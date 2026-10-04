import { converter } from "./x2t";
import { MockSocket } from "./socket";
import { AscSaveTypes, type Participant, type User } from "./types";
import type { ZiziyiParticipantUser } from "./bridge";
import { getDocumentType, getFileExt } from "./utils";
import { assertOfficeFileSignature } from "@/lib/office-file-signature";
import { normalizeOoxmlChineseFonts } from "./ooxml-fonts";

type EditorServerOptions = {
  editing: boolean;
  user: User;
  participants?: ZiziyiParticipantUser[];
  onSave: (data: Uint8Array<ArrayBuffer>, fileName: string) => Promise<void>;
  onSaveError?: (error: Error) => void;
};

type EditorCommand = {
  block?: string;
  format?: string;
  outputformat?: number;
  savetype?: AscSaveTypes;
  title?: string;
};

const mergeBuffers = (buffers: Uint8Array[]) => {
  const totalLength = buffers.reduce((total, buffer) => total + buffer.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }
  return merged;
};

const randomId = () => Math.random().toString(36).slice(2, 12);

const objectUrl = (data: Uint8Array, type = "application/octet-stream") =>
  URL.createObjectURL(new Blob([data as BlobPart], { type }));

/**
 * Minimal in-browser document server adapted from ZIZIYI Office.
 * It keeps editor traffic inside the browser and returns exported bytes to the host app.
 */
export class EditorServer {
  private id = "";
  private socket: MockSocket | null = null;
  private sessionId = "ziziyi-session";
  private user: User;
  // Keep these protocol values aligned with ZIZIYI's browser server example.
  // The editor shell currently reports build 9, but its mocked document
  // service handshake intentionally uses build 8 unless the caller overrides it.
  private client = { buildVersion: "9.3.0", buildNumber: 8 };
  private participants: Participant[] = [];
  private participantIndexes = new Map<string, number>();
  private nextParticipantIndex = 2;
  private authenticated = false;
  private syncChangesIndex = 0;
  private fileType = "docx";
  private title = "Office 文档";
  private fileSystem = new Map<string, Uint8Array>();
  private objectUrls = new Map<string, string>();
  private downloadId = "";
  private downloadParts: Uint8Array[] = [];
  private fonts: Record<string, Uint8Array> = {};

  constructor(private options: EditorServerOptions) {
    this.user = {
      id: String(options.user.id || "viewer").trim().slice(0, 128) || "viewer",
      name: String(options.user.name || "访客").trim().slice(0, 128) || "访客",
    };
    this.participantIndexes.set(this.user.id, 1);
    this.setParticipants(options.participants ?? []);
    this.send = this.send.bind(this);
    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
  }

  async open(data: ArrayBuffer, fileName: string, fonts: Record<string, Uint8Array> = {}) {
    this.fileType = getFileExt(fileName) || "docx";
    this.title = fileName || `document.${this.fileType}`;
    this.id = randomId();
    this.fonts = fonts;
    assertOfficeFileSignature(new Uint8Array(data), this.fileType);
    await this.loadDocument(data, this.fileType);
    return { id: this.id, documentType: getDocumentType(this.fileType) };
  }

  getDocument() {
    return {
      fileType: this.fileType,
      key: this.id,
      title: this.title,
      url: `/${this.id}`,
    };
  }

  getUser() {
    return this.user;
  }

  getFileType() {
    return this.fileType;
  }

  setParticipants(users: ZiziyiParticipantUser[]) {
    const normalized = new Map<string, User>();
    if (this.options.editing) normalized.set(this.user.id, this.user);
    for (const item of users) {
      const id = String(item?.id ?? "").trim().slice(0, 128);
      const name = String(item?.name ?? "").trim().slice(0, 128);
      if (!id || !name) continue;
      normalized.set(id, { id, name });
    }

    this.participants = Array.from(normalized.values()).map((user) => {
      let indexUser = this.participantIndexes.get(user.id);
      if (!indexUser) {
        indexUser = this.nextParticipantIndex++;
        this.participantIndexes.set(user.id, indexUser);
      }
      return {
        connectionId: user.id === this.user.id ? this.sessionId : `presence-${user.id}`,
        encrypted: false,
        id: user.id,
        idOriginal: user.id,
        indexUser,
        isCloseCoAuthoring: false,
        isLiveViewer: false,
        username: user.name,
        view: false,
      };
    });

    if (this.authenticated) {
      this.send({
        type: "connectState",
        participantsTimestamp: Date.now(),
        participants: this.participants,
        waitAuth: false,
      });
    }
  }

  setClient(info: Partial<typeof this.client>) {
    this.client = { ...this.client, ...info };
  }

  dispose() {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.fileSystem.clear();
    this.downloadParts = [];
    this.fonts = {};
    this.socket?.disconnect();
    this.socket = null;
  }

  private async loadDocument(data: ArrayBuffer, fileType: string) {
    const normalizedData = await normalizeOoxmlChineseFonts(data, fileType);
    const result = await converter.convert({
      data: normalizedData,
      fileFrom: `document.${fileType}`,
      fileTo: "Editor.bin",
      fonts: this.fonts,
    });
    if (!result.output) throw new Error("ZIZIYI 无法解析此 Office 文件");

    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.fileSystem.clear();
    this.fileSystem.set("Editor.bin", result.output);
    this.objectUrls.set("Editor.bin", objectUrl(result.output));
    for (const [name, bytes] of Object.entries(result.media)) this.addMedia(name, bytes);
  }

  private addMedia(name: string, data: Uint8Array) {
    const path = `media/${name}`;
    const url = objectUrl(data);
    this.fileSystem.set(path, data);
    this.objectUrls.set(path, url);
    return url;
  }

  handleConnect({ socket }: { socket: MockSocket }) {
    this.socket = socket;

    socket.server.on("message", this.handleMessage as (...args: unknown[]) => void);
    this.send({
      maxPayload: 100_000_000,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      sid: this.sessionId,
      upgrades: [],
    });
    this.send({
      type: "license",
      license: {
        type: 3,
        buildNumber: this.client.buildNumber,
        buildVersion: this.client.buildVersion,
        light: false,
        mode: 0,
        rights: 1,
        protectionSupport: true,
        isAnonymousSupport: true,
        liveViewerSupport: true,
        branding: false,
        customization: true,
        advancedApi: false,
      },
    });
  }

  handleDisconnect() {
    this.authenticated = false;
    this.socket = null;
  }

  private send(...messages: unknown[]) {
    this.socket?.server.emit("message", ...messages);
  }

  async handleMessage(message: Record<string, string>) {
    const type = typeof message === "object" && message ? message.type : "";
    switch (type) {
      case "auth":
        this.authenticated = true;
        this.send({ type: "authChanges", changes: [] });
        this.send({
          type: "auth",
          result: 1,
          sessionId: this.sessionId,
          participants: this.participants,
          locks: [],
          indexUser: 1,
          buildVersion: this.client.buildVersion,
          buildNumber: this.client.buildNumber,
          licenseType: 3,
          editorType: 2,
          mode: "edit",
          permissions: {
            comment: true,
            chat: true,
            download: true,
            edit: true,
            fillForms: false,
            modifyFilter: true,
            protect: true,
            print: true,
            review: false,
            copy: true,
          },
        });
        this.send({
          type: "documentOpen",
          data: {
            type: "open",
            status: "ok",
            data: Object.fromEntries(this.objectUrls),
          },
        });
        break;
      case "isSaveLock":
        this.send({ type: "saveLock", saveLock: false });
        break;
      case "saveChanges":
        this.send({
          type: "unSaveLock",
          index: -1,
          syncChangesIndex: ++this.syncChangesIndex,
          time: Date.now(),
        });
        break;
      case "getLock":
        this.send({
          type: "getLock",
          locks: {
            [message.block]: {
              time: Date.now(),
              user: this.user.id,
              block: message.block,
            },
          },
        });
        this.send({
          type: "releaseLock",
          locks: {
            [message.block]: {
              time: Date.now(),
              user: this.user.id,
              block: message.block,
            },
          },
        });
        break;
    }
  }

  async handleRequest(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(`/downloadas/${this.id}`)) {
      const command = JSON.parse(url.searchParams.get("cmd") || "{}") as EditorCommand;
      const chunk = new Uint8Array(await request.arrayBuffer());
      let result: "ok" | "error" = "ok";
      let hostSaveStarted = false;

      const exportDocument = async () => {
        const input = mergeBuffers(this.downloadParts);
        const targetExt = getFileExt(command.title || "") || this.fileType;
        const fileFrom = command.format === "pdf" ? "from.pdf" : "from.bin";
        let formatTo = command.outputformat;
        if (!formatTo && targetExt === "pdf") formatTo = 513;

        let { output } = await converter.convert({
          data: input.buffer,
          fileFrom,
          fileTo: `document.${targetExt}`,
          formatTo,
          media: Object.fromEntries(this.fileSystem),
          fonts: this.fonts,
        });
        if (!output && command.format === "pdf" && targetExt === "pdf") {
          output = input as Uint8Array<ArrayBuffer>;
        }
        if (!output) throw new Error("ZIZIYI 文件转换失败");
        assertOfficeFileSignature(output, targetExt);
        hostSaveStarted = true;
        await this.options.onSave(output, this.title);
      };

      try {
        switch (command.savetype) {
          case AscSaveTypes.PartStart:
            this.downloadId = `_${Math.round(Math.random() * 1000)}`;
            this.downloadParts = [chunk];
            break;
          case AscSaveTypes.Part:
            this.downloadParts.push(chunk);
            break;
          case AscSaveTypes.Complete:
            this.downloadParts.push(chunk);
            await exportDocument();
            this.downloadParts = [];
            break;
          case AscSaveTypes.CompleteAll:
          default:
            this.downloadId = `_${Math.round(Math.random() * 1000)}`;
            this.downloadParts = [chunk];
            await exportDocument();
            this.downloadParts = [];
            break;
        }
      } catch (error) {
        result = "error";
        this.downloadParts = [];
        if (!hostSaveStarted) {
          this.options.onSaveError?.(error instanceof Error ? error : new Error("ZIZIYI 文件保存失败"));
        }
        console.error("[ZIZIYI] save failed", error);
      }

      window.setTimeout(() => {
        this.send({
          type: "documentOpen",
          data: {
            type: "save",
            status: result,
            data: "data:,",
            filetype: this.fileType,
          },
        });
      }, 100);

      return Response.json({ status: result, type: "save", data: this.downloadId });
    }

    if (url.pathname.endsWith(`/upload/${this.id}`)) {
      const data = new Uint8Array(await request.arrayBuffer());
      const fileName = `${Date.now()}.png`;
      const path = `media/${fileName}`;
      return Response.json({ [path]: this.addMedia(fileName, data) });
    }

    if (url.pathname === "/plugins.json") {
      return Response.json({ url: "", pluginsData: [], autostart: [] });
    }

    return null;
  }
}
