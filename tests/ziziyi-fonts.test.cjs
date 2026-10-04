/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/ziziyi/fonts.ts");
const source = fs.readFileSync(filename, "utf8");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const {
  createZiziyiFontMiddleware,
  decodeZiziyiFont,
  encodeZiziyiFont,
  prepareSourceHanSerifScFont,
  prioritizeTtcFace,
} = mod.exports;
const fontPath = path.resolve(__dirname, "../public/siyuansongti.ttc");

function readWindowsEnglishNames(font, faceIndex = 0) {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const faceOffset = view.getUint32(12 + faceIndex * 4, false);
  const tableCount = view.getUint16(faceOffset + 4, false);
  let tableOffset = -1;
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = faceOffset + 12 + index * 16;
    if (Buffer.from(font.buffer, font.byteOffset + recordOffset, 4).toString("ascii") === "name") {
      tableOffset = view.getUint32(recordOffset + 8, false);
      break;
    }
  }
  assert.notEqual(tableOffset, -1);
  const recordCount = view.getUint16(tableOffset + 2, false);
  const stringStorageOffset = tableOffset + view.getUint16(tableOffset + 4, false);
  const names = {};
  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = tableOffset + 6 + index * 12;
    if (view.getUint16(recordOffset, false) !== 3 || view.getUint16(recordOffset + 4, false) !== 0x0409) continue;
    const nameId = view.getUint16(recordOffset + 6, false);
    const length = view.getUint16(recordOffset + 8, false);
    const valueOffset = stringStorageOffset + view.getUint16(recordOffset + 10, false);
    names[nameId] = Array.from({ length: length / 2 }, (_, itemIndex) =>
      String.fromCharCode(view.getUint16(valueOffset + itemIndex * 2, false)),
    ).join("");
  }
  return names;
}

test("the local Source Han collection exposes its Simplified Chinese face first", () => {
  const original = fs.readFileSync(fontPath);
  const originalOffsets = Array.from({ length: original.readUInt32BE(8) }, (_, index) => original.readUInt32BE(12 + index * 4));
  const prepared = prioritizeTtcFace(original, 2);
  const view = new DataView(prepared.buffer, prepared.byteOffset, prepared.byteLength);

  assert.equal(view.getUint32(8, false), 4);
  assert.equal(view.getUint32(12, false), originalOffsets[2]);
  assert.deepEqual(
    Array.from({ length: 4 }, (_, index) => view.getUint32(12 + index * 4, false)),
    [originalOffsets[2], originalOffsets[0], originalOffsets[1], originalOffsets[3]],
  );
  assert.equal(original.readUInt32BE(12), originalOffsets[0], "preparing the font must not modify the user's TTC file");
});

test("the local font follows ZIZIYI's reversible header encoding", () => {
  const prepared = prepareSourceHanSerifScFont(fs.readFileSync(fontPath));
  const encoded = encodeZiziyiFont(prepared);
  assert.notDeepEqual(encoded.subarray(0, 32), prepared.subarray(0, 32));
  const decoded = decodeZiziyiFont(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
  assert.deepEqual(decoded, prepared);
});

test("the SC face identifies itself as ZIZIYI's registered CJK fallback", () => {
  const original = fs.readFileSync(fontPath);
  const prepared = prepareSourceHanSerifScFont(original);
  const names = readWindowsEnglishNames(prepared);

  assert.equal(names[1], "Droid Sans Fallback");
  assert.equal(names[4], "Droid Sans Fallback");
  assert.equal(names[6], "DroidSansFallbackRegular");
  assert.equal(readWindowsEnglishNames(original, 2)[1], "Source Han Serif SC");
});

test("invalid TTC input fails closed", () => {
  assert.throws(() => prioritizeTtcFace(new Uint8Array([1, 2, 3, 4]), 2), /TTC/);
});

test("the editor font middleware serves the encoded local SC face as font 081", async () => {
  const nativeFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(String(url), "/siyuansongti.ttc");
    return new Response(fs.readFileSync(fontPath), { status: 200 });
  };
  try {
    const middleware = createZiziyiFontMiddleware();
    assert.equal(await middleware(new Request("http://localhost/not-a-font")), null);
    const response = await middleware(new Request("http://localhost/ziziyi-local-fonts/source-han-serif-sc-v2/081"));
    assert.equal(response.status, 200);
    const decoded = decodeZiziyiFont(await response.arrayBuffer());
    const decodedView = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    const original = fs.readFileSync(fontPath);
    assert.equal(decodedView.getUint32(12, false), original.readUInt32BE(20));
    assert.equal(readWindowsEnglishNames(decoded)[1], "Droid Sans Fallback");
  } finally {
    global.fetch = nativeFetch;
  }
});
