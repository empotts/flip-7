export type GameMode = "classic" | "vengeance";

export type NumberCard = {
  kind: "number";
  value: number;
  special?: "zero" | "unlucky7" | "lucky13";
  id: string;
};
export type BonusCard = { kind: "bonus"; value: 2 | 4 | 6 | 8 | 10; id: string };
export type DoubleCard = { kind: "double"; id: string };
export type ModifierCard = {
  kind: "modifier";
  value: "half" | -2 | -4 | -6 | -8 | -10;
  id: string;
};
export type ActionCard = {
  kind:
    | "freeze"
    | "flip3"
    | "secondChance"
    | "justOneMore"
    | "flip4"
    | "steal"
    | "swap"
    | "discard";
  id: string;
};
export type Card = NumberCard | BonusCard | DoubleCard | ModifierCard | ActionCard;

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
  mode: GameMode;
  pointGoal: number;
  phase: "lobby" | "playing" | "round-over" | "game-over";
  players: PlayerView[];
  deckCount: number;
  currentPlayerId: string | null;
  pendingAction: ActionCard["kind"] | "modifier" | null;
  pendingActionPlayerId: string | null;
  pendingCardSelections: { playerId: string; cardId: string }[];
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
  | { type: "restart" }
  | { type: "hit" }
  | { type: "stay" }
  | { type: "target"; targetId: string }
  | { type: "selectCard"; playerId: string; cardId: string };
