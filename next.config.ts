import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import libarchivePackage from "libarchive.js/package.json";
import pdfjsPackage from "pdfjs-dist/package.json";

const nextConfig: NextConfig = {
  async rewrites() {
    const root = "https://office-editor.ziziyi.com/v9.3.0.24-1";
    return [
      { source: "/sdkjs/:path*", destination: `${root}/sdkjs/:path*` },
      { source: "/fonts/:path*", destination: `${root}/fonts/:path*` },
      { source: "/dictionaries/:path*", destination: `${root}/dictionaries/:path*` },
      { source: "/sdkjs-plugins/:path*", destination: `${root}/sdkjs-plugins/:path*` },
      { source: "/common/:path*", destination: `${root}/web-apps/apps/common/:path*` },
      { source: "/themes.json", destination: `${root}/themes.json` },
    ];
  },
  async headers() {
    return [
      {
        source: "/file-icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/libarchive/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/x2t-1/:path*",
        headers: [
          {
            key: "Content-Encoding",
            value: "br",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/v9.3.0.24-1/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    // PDF.js needs matching local fonts, CMaps and image decoders for some PDFs.
    const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
    const destination = path.join(process.cwd(), "public", "pdfjs", pdfjsPackage.version);
    mkdirSync(destination, { recursive: true });
    for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
      cpSync(path.join(source, directory), path.join(destination, directory), { recursive: true });
    }

    // libarchive.js runs in a module worker and resolves its WASM next to the worker bundle.
    const libarchiveSource = path.join(path.dirname(require.resolve("libarchive.js/package.json")), "dist");
    const libarchiveDestination = path.join(process.cwd(), "public", "libarchive", libarchivePackage.version);
    mkdirSync(libarchiveDestination, { recursive: true });
    for (const file of ["worker-bundle.js", "libarchive.wasm"]) {
      cpSync(path.join(libarchiveSource, file), path.join(libarchiveDestination, file));
    }
  }
  return nextConfig;
}
