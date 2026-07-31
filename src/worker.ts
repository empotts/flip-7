import { DurableObject } from "cloudflare:workers";
import type {
  ActionCard,
  Card,
  ClientMessage,
  GameView,
  PlayerView,
  ServerMessage,
} from "./types";

type Player = Omit<PlayerView, "connected"> & { token: string };
type PendingAction = { kind: ActionCard["kind"]; ownerId: string; card: ActionCard };
type ForcedDraw = {
  targetId: string;
  remaining: number;
  deferredActions: PendingAction[];
};

type StoredGame = {
  id: string;
  phase: GameView["phase"];
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  dealerIndex: number;
  currentPlayerId: string | null;
  pendingAction: PendingAction | null;
  actionQueue: PendingAction[];
  forcedDraw: ForcedDraw | null;
  initialDealQueue: string[];
  resumeFlow: "initial-deal" | "advance-turn" | null;
  round: number;
  winnerId: string | null;
  message: string;
};

type LegacyGame = Omit<StoredGame, "discardPile" | "dealerIndex" | "actionQueue" | "forcedDraw" | "initialDealQueue" | "resumeFlow" | "pendingAction"> & {
  discardPile?: Card[];
  dealerIndex?: number;
  actionQueue?: PendingAction[];
  forcedDraw?: ForcedDraw | null;
  initialDealQueue?: string[];
  resumeFlow?: StoredGame["resumeFlow"];
  pendingAction?: PendingAction | ActionCard["kind"] | null;
};

type SocketAttachment = { playerId: string };

export interface WorkerEnv {
  GAMES: DurableObjectNamespace<GameRoom>;
}

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...init?.headers },
  });

const cleanName = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);

const gameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/games") {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      const name = cleanName(body.name);
      if (!name) return json({ error: "Enter a name to create a game." }, { status: 400 });

      const id = gameCode();
      const room = env.GAMES.getByName(id);
      const player = await room.createGame(id, name);
      return json({ gameId: id, ...player }, { status: 201 });
    }

    const joinMatch = url.pathname.match(/^\/games\/([A-Z0-9]+)\/join$/);
    if (request.method === "POST" && joinMatch) {
      const id = joinMatch[1];
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      const name = cleanName(body.name);
      if (!name) return json({ error: "Enter a name to join." }, { status: 400 });
      const result = await env.GAMES.getByName(id).joinGame(name);
      return result.ok
        ? json({ gameId: id, playerId: result.playerId, token: result.token })
        : json({ error: result.error }, { status: 409 });
    }

    const socketMatch = url.pathname.match(/^\/games\/([A-Z0-9]+)\/socket$/);
    if (request.method === "GET" && socketMatch) {
      return env.GAMES.getByName(socketMatch[1]).fetch(request);
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};

export class GameRoom extends DurableObject<WorkerEnv> {
  private game: StoredGame | null = null;
  private sockets = new Map<WebSocket, SocketAttachment>();

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    for (const socket of ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment) this.sockets.set(socket, attachment);
    }
    ctx.blockConcurrencyWhile(async () => {
      const stored = (await ctx.storage.get<LegacyGame>("game")) ?? null;
      if (!stored) return;
      this.game = {
        ...stored,
        discardPile: stored.discardPile ?? [],
        dealerIndex: stored.dealerIndex ?? Math.max(0, stored.round - 1) % stored.players.length,
        pendingAction:
          stored.pendingAction && typeof stored.pendingAction === "object"
            ? stored.pendingAction
            : null,
        actionQueue: stored.actionQueue ?? [],
        forcedDraw: stored.forcedDraw ?? null,
        initialDealQueue: stored.initialDealQueue ?? [],
        resumeFlow: stored.resumeFlow ?? null,
      };
    });
  }

  async createGame(id: string, name: string) {
    if (this.game) throw new Error("Game already exists");
    const player = this.newPlayer(name, true);
    this.game = {
      id,
      phase: "lobby",
      players: [player],
      deck: [],
      discardPile: [],
      dealerIndex: 0,
      currentPlayerId: null,
      pendingAction: null,
      actionQueue: [],
      forcedDraw: null,
      initialDealQueue: [],
      resumeFlow: null,
      round: 0,
      winnerId: null,
      message: `${name} created the table.`,
    };
    await this.save();
    return { playerId: player.id, token: player.token };
  }

  async joinGame(name: string): Promise<
    | { ok: true; playerId: string; token: string }
    | { ok: false; error: string }
  > {
    if (!this.game) return { ok: false, error: "That game does not exist." };
    if (this.game.phase !== "lobby") return { ok: false, error: "That game has already started." };
    if (this.game.players.length >= 8) return { ok: false, error: "That table is full." };
    if (this.game.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "That name is already at the table." };
    }
    const player = this.newPlayer(name, false);
    this.game.players.push(player);
    this.game.message = `${name} joined the table.`;
    await this.saveAndBroadcast();
    return { ok: true, playerId: player.id, token: player.token };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    if (!this.game) return new Response("Game not found", { status: 404 });

    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const player = this.game.players.find((candidate) => candidate.id === playerId);
    if (!player || player.token !== token) return new Response("Invalid player session", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const attachment = { playerId };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);
    this.sockets.set(server, attachment);
    server.send(JSON.stringify({ type: "state", game: this.view() } satisfies ServerMessage));
    await this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const attachment =
      this.sockets.get(socket) ?? (socket.deserializeAttachment() as SocketAttachment | null);
    if (!attachment || !this.game) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.sendError(socket, "That move could not be read.");
    }

    try {
      this.applyMove(attachment.playerId, message);
      await this.saveAndBroadcast();
    } catch (error) {
      this.sendError(socket, error instanceof Error ? error.message : "That move is not allowed.");
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    this.sockets.delete(socket);
    socket.close(code, reason);
    await this.broadcast();
  }

  async webSocketError(socket: WebSocket) {
    this.sockets.delete(socket);
  }

  private applyMove(playerId: string, move: ClientMessage) {
    const game = this.requiredGame();
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("Player not found.");

    if (move.type === "start") {
      if (!player.isHost) throw new Error("Only the host can start a round.");
      if (game.phase === "playing") throw new Error("The round is already underway.");
      if (game.phase === "game-over") throw new Error("This game is finished.");
      if (game.players.length < 2) throw new Error("Invite at least one more player first.");
      this.startRound();
      return;
    }

    if (game.phase !== "playing") throw new Error("Wait for the host to start the round.");

    if (move.type === "target") {
      this.assignPendingAction(playerId, move.targetId);
      return;
    }

    if (game.pendingAction) throw new Error("Choose a player for your action card first.");
    if (game.currentPlayerId !== playerId) throw new Error("It is not your turn yet.");
    if (player.status !== "active") throw new Error("You are out for this round.");

    if (move.type === "hit") {
      game.resumeFlow = "advance-turn";
      this.drawOne(player, false);
      this.continueFlow();
      return;
    }

    if (move.type === "stay") {
      if (player.cards.length === 0) throw new Error("You need at least one card before you can stay.");
      player.status = "stayed";
      player.roundScore = this.score(player.cards);
      game.message = `${player.name} stayed on ${player.roundScore}.`;
      this.advanceTurn();
      this.finishRoundIfNeeded();
    }
  }

  private startRound() {
    const game = this.requiredGame();
    for (const player of game.players) game.discardPile.push(...player.cards);
    if (game.deck.length === 0) this.recycleDiscardPile();
    if (game.deck.length === 0) game.deck = this.makeDeck(game.round + 1);

    game.phase = "playing";
    game.round += 1;
    game.dealerIndex = (game.round - 1) % game.players.length;
    game.pendingAction = null;
    game.actionQueue = [];
    game.forcedDraw = null;
    game.winnerId = null;
    game.currentPlayerId = null;
    for (const player of game.players) {
      player.cards = [];
      player.roundScore = 0;
      player.status = "active";
      player.hasSecondChance = false;
    }

    game.initialDealQueue = this.playerOrderAfter(game.dealerIndex).map((player) => player.id);
    game.resumeFlow = "initial-deal";
    const dealer = game.players[game.dealerIndex];
    game.message = `Round ${game.round}. ${dealer.name} is dealing one card to everyone.`;
    this.continueFlow();
  }

  private continueFlow() {
    const game = this.requiredGame();
    while (game.phase === "playing" && !game.pendingAction) {
      if (game.forcedDraw) {
        const forced = game.forcedDraw;
        const target = game.players.find((player) => player.id === forced.targetId);
        if (!target || target.status !== "active") {
          game.discardPile.push(...forced.deferredActions.map((action) => action.card));
          game.forcedDraw = null;
          continue;
        }

        this.drawOne(target, true);
        forced.remaining -= 1;
        if (game.phase !== "playing" || game.pendingAction) return;
        if (target.status !== "active") {
          game.discardPile.push(...forced.deferredActions.map((action) => action.card));
          game.forcedDraw = null;
          continue;
        }
        if (forced.remaining > 0) continue;

        game.forcedDraw = null;
        game.actionQueue.unshift(...forced.deferredActions);
        continue;
      }

      if (game.actionQueue.length > 0) {
        const action = game.actionQueue.shift()!;
        if (!game.players.some((player) => player.status === "active")) {
          game.discardPile.push(action.card);
          continue;
        }
        this.setPendingAction(action);
        return;
      }

      if (game.resumeFlow === "initial-deal") {
        const nextPlayerId = game.initialDealQueue.shift();
        if (nextPlayerId) {
          const nextPlayer = game.players.find((player) => player.id === nextPlayerId);
          if (nextPlayer?.status === "active") this.drawOne(nextPlayer, false);
          if (game.phase !== "playing" || game.pendingAction) return;
          continue;
        }

        game.resumeFlow = null;
        const first = this.firstActiveAfter(game.dealerIndex);
        game.currentPlayerId = first?.id ?? null;
        if (first) game.message = `The opening deal is complete. ${first.name}, flip or stay?`;
        this.finishRoundIfNeeded();
        return;
      }

      if (game.resumeFlow === "advance-turn") {
        game.resumeFlow = null;
        this.advanceTurn();
        this.finishRoundIfNeeded();
      }
      return;
    }
  }

  private drawOne(player: Player, forced: boolean) {
    const game = this.requiredGame();
    const card = this.takeCard();

    if (card.kind === "number") {
      const duplicate = player.cards.some(
        (held) => held.kind === "number" && held.value === card.value,
      );
      if (duplicate && player.hasSecondChance) {
        const chanceIndex = player.cards.findIndex((held) => held.kind === "secondChance");
        const [chance] = player.cards.splice(chanceIndex, 1);
        if (chance) game.discardPile.push(chance);
        game.discardPile.push(card);
        player.hasSecondChance = false;
        game.message = `${player.name}'s Second Chance blocked a duplicate ${card.value}.`;
        return;
      }

      player.cards.push(card);
      if (duplicate) {
        player.status = "busted";
        player.roundScore = 0;
        game.message = `${player.name} flipped a second ${card.value} and busted.`;
        return;
      }

      game.message = `${player.name} flipped ${card.value}.`;
      if (player.cards.filter((held) => held.kind === "number").length === 7) {
        this.endRound(player);
      }
      return;
    }

    if (card.kind === "bonus" || card.kind === "double") {
      player.cards.push(card);
      game.message = `${player.name} found ${card.kind === "double" ? "×2" : `+${card.value}`}.`;
      return;
    }

    if (card.kind === "secondChance") {
      if (!player.hasSecondChance) {
        player.cards.push(card);
        player.hasSecondChance = true;
        game.message = `${player.name} picked up a Second Chance.`;
        return;
      }

      const recipients = game.players.filter(
        (candidate) =>
          candidate.id !== player.id &&
          candidate.status === "active" &&
          !candidate.hasSecondChance,
      );
      if (recipients.length === 0) {
        game.discardPile.push(card);
        game.message = `${player.name} discarded an extra Second Chance.`;
      } else {
        this.setPendingAction({ kind: card.kind, ownerId: player.id, card });
      }
      return;
    }

    const action = { kind: card.kind, ownerId: player.id, card } satisfies PendingAction;
    if (forced && game.forcedDraw) {
      game.forcedDraw.deferredActions.push(action);
      game.message = `${player.name} revealed ${card.kind === "freeze" ? "Freeze" : "Flip Three"}. It resolves after the forced draws.`;
    } else {
      this.setPendingAction(action);
    }
  }

  private setPendingAction(action: PendingAction) {
    const game = this.requiredGame();
    game.pendingAction = action;
    const owner = game.players.find((player) => player.id === action.ownerId);
    const label = action.kind === "freeze" ? "Freeze" : action.kind === "flip3" ? "Flip Three" : "an extra Second Chance";
    game.message = `${owner?.name ?? "A player"} drew ${label}. Choose an eligible player.`;
  }

  private assignPendingAction(playerId: string, targetId: string) {
    const game = this.requiredGame();
    const pending = game.pendingAction;
    if (!pending || pending.ownerId !== playerId) {
      throw new Error("You do not have an action card to assign.");
    }

    const owner = game.players.find((player) => player.id === playerId);
    const target = game.players.find((player) => player.id === targetId);
    if (!owner || !target || target.status !== "active") {
      throw new Error("Choose an active player.");
    }

    if (pending.kind === "secondChance") {
      if (target.id === owner.id || target.hasSecondChance) {
        throw new Error("Give the extra Second Chance to another active player who does not have one.");
      }
      game.pendingAction = null;
      target.cards.push(pending.card);
      target.hasSecondChance = true;
      game.message = `${owner.name} gave ${target.name} a Second Chance.`;
      this.continueFlow();
      return;
    }

    game.pendingAction = null;
    game.discardPile.push(pending.card);
    if (pending.kind === "freeze") {
      target.status = "frozen";
      target.roundScore = this.score(target.cards);
      game.message = `${owner.name} froze ${target.name} on ${target.roundScore} points.`;
    } else {
      game.forcedDraw = { targetId: target.id, remaining: 3, deferredActions: [] };
      game.message = `${owner.name} made ${target.name} flip three.`;
    }
    this.continueFlow();
  }

  private advanceTurn() {
    const game = this.requiredGame();
    if (!game.players.some((player) => player.status === "active")) {
      game.currentPlayerId = null;
      return;
    }
    const currentIndex = Math.max(
      0,
      game.players.findIndex((player) => player.id === game.currentPlayerId),
    );
    const next = this.firstActiveAfter(currentIndex);
    game.currentPlayerId = next?.id ?? null;
    if (next) game.message += ` ${next.name}, flip or stay?`;
  }

  private finishRoundIfNeeded() {
    const game = this.requiredGame();
    if (game.phase !== "playing" || game.players.some((player) => player.status === "active")) return;
    this.endRound();
  }

  private endRound(flipSevenPlayer?: Player) {
    const game = this.requiredGame();
    if (game.phase !== "playing") return;
    game.currentPlayerId = null;
    if (game.pendingAction) game.discardPile.push(game.pendingAction.card);
    game.discardPile.push(...game.actionQueue.map((action) => action.card));
    if (game.forcedDraw) {
      game.discardPile.push(...game.forcedDraw.deferredActions.map((action) => action.card));
    }
    game.pendingAction = null;
    game.actionQueue = [];
    game.forcedDraw = null;
    game.initialDealQueue = [];
    game.resumeFlow = null;

    for (const player of game.players) {
      if (player.status === "busted") continue;
      player.roundScore = this.score(player.cards);
      if (player.status === "active") player.status = "stayed";
      player.score += player.roundScore;
    }

    const highestScore = Math.max(...game.players.map((player) => player.score));
    const leaders = game.players.filter((player) => player.score === highestScore);
    if (highestScore >= 200 && leaders.length === 1) {
      game.phase = "game-over";
      game.winnerId = leaders[0].id;
      game.message = `${leaders[0].name} wins with ${leaders[0].score} points!`;
      return;
    }

    game.phase = "round-over";
    if (flipSevenPlayer) {
      game.message = `${flipSevenPlayer.name} flipped seven unique numbers! Everyone banks their cards.`;
    } else if (highestScore >= 200) {
      game.message = `The leaders are tied on ${highestScore}. Play another round to break the tie.`;
    } else {
      game.message = `Round ${game.round} is over. The host can deal the next round.`;
    }
  }

  private score(cards: Card[]) {
    const numberTotal = cards.reduce(
      (total, card) => total + (card.kind === "number" ? card.value : 0),
      0,
    );
    const bonusTotal = cards.reduce(
      (total, card) => total + (card.kind === "bonus" ? card.value : 0),
      0,
    );
    const doubled = cards.some((card) => card.kind === "double");
    const flipSevenBonus = cards.filter((card) => card.kind === "number").length >= 7 ? 15 : 0;
    return numberTotal * (doubled ? 2 : 1) + bonusTotal + flipSevenBonus;
  }

  private takeCard() {
    const game = this.requiredGame();
    if (game.deck.length === 0) this.recycleDiscardPile();
    const card = game.deck.pop();
    if (!card) throw new Error("There are no cards available to draw.");
    return card;
  }

  private recycleDiscardPile() {
    const game = this.requiredGame();
    game.deck = this.shuffle(game.discardPile);
    game.discardPile = [];
  }

  private makeDeck(round: number) {
    const cards: Card[] = [];
    let serial = 0;
    const add = <T extends Omit<Card, "id">>(card: T, count = 1) => {
      for (let index = 0; index < count; index += 1) {
        cards.push({ ...card, id: `${round}-${serial++}` } as Card);
      }
    };
    add({ kind: "number", value: 0 }, 1);
    for (let value = 1; value <= 12; value += 1) add({ kind: "number", value }, value);
    for (const value of [2, 4, 6, 8, 10] as const) add({ kind: "bonus", value });
    add({ kind: "double" }, 1);
    add({ kind: "freeze" }, 3);
    add({ kind: "flip3" }, 3);
    add({ kind: "secondChance" }, 3);
    return this.shuffle(cards);
  }

  private shuffle<T>(values: T[]) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
      [shuffled[index], shuffled[random]] = [shuffled[random], shuffled[index]];
    }
    return shuffled;
  }

  private playerOrderAfter(index: number) {
    const game = this.requiredGame();
    return game.players.map((_, offset) => game.players[(index + offset + 1) % game.players.length]);
  }

  private firstActiveAfter(index: number) {
    return this.playerOrderAfter(index).find((player) => player.status === "active");
  }

  private newPlayer(name: string, isHost: boolean): Player {
    return {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      name,
      cards: [],
      score: 0,
      roundScore: 0,
      status: "active",
      isHost,
      hasSecondChance: false,
    };
  }

  private view(): GameView {
    const game = this.requiredGame();
    const connectedIds = new Set([...this.sockets.values()].map((value) => value.playerId));
    return {
      id: game.id,
      phase: game.phase,
      players: game.players.map(({ token: _token, ...player }) => ({
        ...player,
        connected: connectedIds.has(player.id),
      })),
      deckCount: game.deck.length,
      currentPlayerId: game.currentPlayerId,
      pendingAction: game.pendingAction?.kind ?? null,
      pendingActionPlayerId: game.pendingAction?.ownerId ?? null,
      dealerId: game.players[game.dealerIndex]?.id ?? null,
      round: game.round,
      winnerId: game.winnerId,
      message: game.message,
    };
  }

  private requiredGame() {
    if (!this.game) throw new Error("Game not found.");
    return this.game;
  }

  private async save() {
    await this.ctx.storage.put("game", this.requiredGame());
  }

  private async saveAndBroadcast() {
    await this.save();
    await this.broadcast();
  }

  private async broadcast() {
    if (!this.game) return;
    const message = JSON.stringify({ type: "state", game: this.view() } satisfies ServerMessage);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private sendError(socket: WebSocket, message: string) {
    socket.send(JSON.stringify({ type: "error", message } satisfies ServerMessage));
  }
}
