export type NumberCard = { kind: "number"; value: number; id: string };
export type BonusCard = { kind: "bonus"; value: 2 | 4 | 6 | 8 | 10; id: string };
export type DoubleCard = { kind: "double"; id: string };
export type ActionCard = {
  kind: "freeze" | "flip3" | "secondChance";
  id: string;
};
export type Card = NumberCard | BonusCard | DoubleCard | ActionCard;

export type PlayerView = {
  id: string;
  name: string;
  cards: Card[];
  score: number;
  roundScore: number;
  status: "active" | "stayed" | "busted" | "frozen";
  connected: boolean;
  isHost: boolean;
  hasSecondChance: boolean;
};

export type GameView = {
  id: string;
  phase: "lobby" | "playing" | "round-over" | "game-over";
  players: PlayerView[];
  deckCount: number;
  currentPlayerId: string | null;
  pendingAction: "freeze" | "flip3" | "secondChance" | null;
  pendingActionPlayerId: string | null;
  dealerId: string | null;
  round: number;
  winnerId: string | null;
  message: string;
};

export type ServerMessage =
  | { type: "state"; game: GameView }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "start" }
  | { type: "hit" }
  | { type: "stay" }
  | { type: "target"; targetId: string };
