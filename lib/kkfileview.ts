const DEFAULT_KKFILEVIEW_URL = "https://preview.qinghub.top";

// Set to false to restore the original PDF preview route in both app entry points.
export const KKFILEVIEW_PDF_PREVIEW = true;

const KKFILEVIEW_EXTENSIONS = new Set([
  // Microsoft Office variants not handled by the existing Microsoft viewer.
  "docm", "dot", "dotm", "dotx", "pages",
  "pot", "potm", "potx", "pps", "ppsm", "ppsx", "pptm",
  "xla", "xlam", "xlsb", "xlsm", "xlt", "xltm", "xltx",
  // WPS and OpenDocument.
  "dps", "et", "ett", "wps", "wpt",
  "fodp", "fods", "fodt", "odp", "ods", "odt", "otp", "ots", "ott",
  // Documents, diagrams, mail, and books.
  "bpmn", "eml", "epub", "msg", "ofd", "rtf", "vsd", "vsdx", "xmind",
  // Archives.
  "7z", "bz2", "gz", "gzip", "jar", "rar", "tar", "tgz", "zip",
  // CAD and 3D models.
  "3dm", "3ds", "3mf", "bim", "brep", "cf2", "dae", "dgn", "dwf", "dwfx",
  "dwg", "dwt", "dxf", "fbx", "fcstd", "gltf", "glb", "ifc", "iges", "igs",
  "obj", "off", "plt", "ply", "step", "stl", "stp", "wrl",
  // Additional image and medical formats.
  "dcm", "emf", "eps", "heic", "heif", "jfif", "psd", "tga", "tif", "tiff", "wmf",
  // Diagram source files.
  "drawio",
]);

export const isKkFileViewSupported = (extension: string) =>
  KKFILEVIEW_EXTENSIONS.has(String(extension ?? "").trim().toLowerCase());

const encodeBase64Utf8 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const buildKkFileViewPreviewUrl = (sourceUrl: string) => {
  const baseUrl = String(process.env.NEXT_PUBLIC_KKFILEVIEW_URL || DEFAULT_KKFILEVIEW_URL)
    .trim()
    .replace(/\/+$/, "");
  if (!baseUrl || !sourceUrl) return "";
  return `${baseUrl}/onlinePreview?url=${encodeURIComponent(encodeBase64Utf8(sourceUrl))}&kkagent=true`;
};
