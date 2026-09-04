import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import pdfjsPackage from "pdfjs-dist/package.json";

const nextConfig: NextConfig = {
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
  }
  return nextConfig;
}
