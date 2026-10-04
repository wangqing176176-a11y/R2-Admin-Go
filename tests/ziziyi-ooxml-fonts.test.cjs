/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const JSZip = require("jszip");

const filename = path.resolve(__dirname, "../lib/ziziyi/ooxml-fonts.ts");
const source = fs.readFileSync(filename, "utf8");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText, filename);

const { normalizeOoxmlChineseFonts, replaceChineseFontDeclarations } = mod.exports;

test("Chinese font declarations are replaced without changing style names or text", () => {
  const xml = `<?xml version="1.0"?>
    <w:styles xmlns:w="urn:test">
      <w:style><w:name w:val="标题一"/><w:rPr><w:rFonts w:ascii="仿宋_GB2312" w:hAnsi="Times New Roman" w:eastAsia="宋体"/></w:rPr></w:style>
      <w:font w:name="楷体"/>
      <w:p><w:r><w:t>正文中的宋体二字不能被替换</w:t></w:r></w:p>
    </w:styles>`;
  const replaced = replaceChineseFontDeclarations(xml);

  assert.match(replaced, /w:ascii="思源宋体"/);
  assert.match(replaced, /w:hAnsi="Times New Roman"/);
  assert.match(replaced, /w:eastAsia="思源宋体"/);
  assert.match(replaced, /w:font w:name="思源宋体"/);
  assert.match(replaced, /w:name w:val="标题一"/);
  assert.match(replaced, />正文中的宋体二字不能被替换</);
});

test("DOCX, XLSX and PPTX XML font declarations are normalized in memory", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:rFonts w:ascii="FangSong_GB2312" w:eastAsia="仿宋_GB2312"/>');
  zip.file("xl/styles.xml", '<fonts><font><name val="宋体"/></font></fonts>');
  zip.file("ppt/theme/theme1.xml", '<a:font script="Hans" typeface="等线"/>');
  zip.file("word/media/label.txt", "宋体 should remain here");
  const original = await zip.generateAsync({ type: "arraybuffer" });

  const normalized = await normalizeOoxmlChineseFonts(original, "docx");
  const result = await JSZip.loadAsync(normalized);
  assert.equal(await result.file("word/document.xml").async("string"), '<w:rFonts w:ascii="思源宋体" w:eastAsia="思源宋体"/>');
  assert.equal(await result.file("xl/styles.xml").async("string"), '<fonts><font><name val="思源宋体"/></font></fonts>');
  assert.equal(await result.file("ppt/theme/theme1.xml").async("string"), '<a:font script="Hans" typeface="思源宋体"/>');
  assert.equal(await result.file("word/media/label.txt").async("string"), "宋体 should remain here");
});

test("legacy Office files are passed through unchanged", async () => {
  const data = new Uint8Array([1, 2, 3, 4]).buffer;
  assert.equal(await normalizeOoxmlChineseFonts(data, "doc"), data);
});
