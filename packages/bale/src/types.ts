export type BaleIncomingMessage = {
  message_id: string;
  text?: string;
  from?: {
    id: string;
    username?: string;
  };
  chat?: {
    id: string;
  };
};

export type BaleUpdate = {
  update_id: string;
  message?: BaleIncomingMessage;
};

export type BaleCommand =
  | { type: 'start' }
  | { type: 'help' }
  | { type: 'materials' }
  | { type: 'legacySearchCommand' }
  | { type: 'unknown'; text: string };
