export const ZIZIYI_BRIDGE = "r2-admin-go:ziziyi" as const;

export type ZiziyiParticipantUser = {
  id: string;
  name: string;
};

export type ZiziyiHostMessage =
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "open";
      fileName: string;
      editing: boolean;
      theme: "light" | "dark";
      user: {
        id: string;
        name: string;
      };
      participants: ZiziyiParticipantUser[];
      data: ArrayBuffer;
    }
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "participants";
      participants: ZiziyiParticipantUser[];
    }
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "save";
      requestId: string;
    }
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "save-result";
      requestId: string;
      ok: boolean;
      error?: string;
    };

export type ZiziyiEditorMessage =
  | { bridge: typeof ZIZIYI_BRIDGE; type: "ready" }
  | { bridge: typeof ZIZIYI_BRIDGE; type: "loaded" }
  | { bridge: typeof ZIZIYI_BRIDGE; type: "dirty"; dirty: boolean }
  | { bridge: typeof ZIZIYI_BRIDGE; type: "error"; error: string }
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "save-data";
      requestId: string;
      fileName: string;
      data: ArrayBuffer;
    }
  | {
      bridge: typeof ZIZIYI_BRIDGE;
      type: "save-complete";
      requestId: string;
      ok: boolean;
      error?: string;
    };

export const isZiziyiBridgeMessage = (value: unknown): value is { bridge: typeof ZIZIYI_BRIDGE; type: string } =>
  Boolean(value && typeof value === "object" && (value as { bridge?: unknown }).bridge === ZIZIYI_BRIDGE);
