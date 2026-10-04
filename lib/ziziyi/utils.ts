import { DocumentType } from "./types";
import { ZIZIYI_SOURCE_HAN_FONT_PATH } from "./fonts";

export function getFileExt(name: string) {
  const type = name.split(".").pop() || "";
  return type.toLowerCase();
}

export enum AppType {
  word = 1,
  slide = 3,
  cell = 2,
  draw = 4,
  pdf = 5,
}

export const docTypeMap = {
  // Document
  docx: AppType.word,
  doc: AppType.word,
  odt: AppType.word,
  rtf: AppType.word,
  txt: AppType.word,
  html: AppType.word,
  mht: AppType.word,
  epub: AppType.word,
  fb2: AppType.word,
  mobi: AppType.word,
  docm: AppType.word,
  dotx: AppType.word,
  dotm: AppType.word,
  oform: AppType.word,
  docxf: AppType.word,

  // Presentation
  pptx: AppType.slide,
  ppt: AppType.slide,
  odp: AppType.slide,
  ppsx: AppType.slide,
  pptm: AppType.slide,
  ppsm: AppType.slide,
  potx: AppType.slide,
  potm: AppType.slide,
  otp: AppType.slide,
  odg: AppType.slide,

  // Spreadsheet
  xlsx: AppType.cell,
  xls: AppType.cell,
  ods: AppType.cell,
  csv: AppType.cell,
  xlsm: AppType.cell,
  xltx: AppType.cell,
  xltm: AppType.cell,
  xlsb: AppType.cell,
  ots: AppType.cell,

  // Draw
  vsdx: AppType.draw,
  vssx: AppType.draw,
  vstx: AppType.draw,
  vsdm: AppType.draw,
  vssm: AppType.draw,
  vstm: AppType.draw,

  // PDF
  pdf: AppType.pdf,
};

export function getDocumentType(ext: string) {
  const code = docTypeMap[ext.toLowerCase() as keyof typeof docTypeMap];
  const type = AppType[code] as DocumentType;
  return type || DocumentType.Word;
}

/** Returns the URL for creating a new document of the given type. */
export function getNewUrl(type: string) {
  return `/editor?new=${type}`;
}

export const APP_ROOT = process.env.NEXT_PUBLIC_APP_ROOT || "/v9.3.0.24-1";
export const PRELOAD_HTML = "/web-apps/apps/api/documents/preload.html";
export const API_JS = "/web-apps/apps/api/documents/api.js";

const ZIZIYI_CDN_ROOT = "https://office-editor.ziziyi.com/v9.3.0.24-1";
const editorDirectory: Record<DocumentType, string> = {
  [DocumentType.Word]: "documenteditor",
  [DocumentType.Cell]: "spreadsheeteditor",
  [DocumentType.Slide]: "presentationeditor",
  [DocumentType.Draw]: "visioeditor",
  [DocumentType.Pdf]: "pdfeditor",
};

/** Resolve root-relative editor runtime requests back to the versioned CDN tree. */
export const createZiziyiAssetUrlResolver = (documentType: DocumentType, appOrigin: string) => {
  const editor = editorDirectory[documentType] || editorDirectory[DocumentType.Word];
  return (rawUrl: string) => {
    let url: URL;
    try {
      url = new URL(rawUrl, appOrigin);
    } catch {
      return rawUrl;
    }
    if (url.origin !== appOrigin) return url.href;

    if (url.pathname === "/fonts/081") {
      return `${appOrigin}${ZIZIYI_SOURCE_HAN_FONT_PATH}`;
    }

    const suffix = `${url.pathname}${url.search}${url.hash}`;
    if (/^\/(sdkjs|fonts|dictionaries|sdkjs-plugins)\//.test(url.pathname) || url.pathname === "/themes.json") {
      return `${ZIZIYI_CDN_ROOT}${suffix}`;
    }
    if (url.pathname.startsWith("/common/")) {
      return `${ZIZIYI_CDN_ROOT}/web-apps/apps${suffix}`;
    }
    if (url.pathname.startsWith("/resources/")) {
      return `${ZIZIYI_CDN_ROOT}/web-apps/apps/${editor}/main${suffix}`;
    }
    return url.href;
  };
};
