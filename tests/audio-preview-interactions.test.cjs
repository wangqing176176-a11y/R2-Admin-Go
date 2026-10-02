const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../components/AudioPreviewPlayer.tsx");
const source = fs.readFileSync(filename, "utf8");
const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const stateNames = [];
function readStateNames(node) {
  if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
    && node.initializer && ts.isCallExpression(node.initializer)
    && node.initializer.expression.getText(parsed) === "useState") {
    stateNames.push(node.name.elements[0].name.getText(parsed));
  }
  ts.forEachChild(node, readStateNames);
}
readStateNames(parsed);

let activeFixture;
const mockReact = {
  ...React,
  useState(initial) {
    const key = stateNames[activeFixture.stateIndex++];
    if (!(key in activeFixture.state)) activeFixture.state[key] = initial;
    return [activeFixture.state[key], (next) => {
      activeFixture.state[key] = typeof next === "function" ? next(activeFixture.state[key]) : next;
    }];
  },
  useRef(initial) { return { current: activeFixture.refIndex++ === 0 ? activeFixture.audio : initial }; },
  useMemo(factory) { return factory(); },
  useEffect() {},
};
const styles = Object.fromEntries(["settings", "trigger", "popover", "panel", "heading", "volume", "speed", "speedPicker"].map(key => [key, `audio-settings-${key}`]));
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod.require = (name) => {
  if (name === "react") return mockReact;
  if (name === "@/lib/media-preview") return { isBrowserPlayableAudioExt: () => true };
  if (name.endsWith(".module.css")) return { __esModule: true, default: styles };
  return require(name);
};
mod._compile(ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const Player = mod.exports.default;

function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const byClass = (node, className) => find(node, n => n.props?.className?.split(" ").includes(className));
const byLabel = (node, label) => find(node, n => n.props?.["aria-label"] === label);

function fixture(overrides = {}) {
  const f = {
    state: {
      duration: 120, currentTime: 12, compactLayout: true, mobileLyricsOpen: false,
      lyricsText: "[00:00.00]第一句\n[00:30.00]第二句", playbackStatus: "ready", ...overrides,
    },
    audio: { currentTime: 12, paused: true },
    render() {
      activeFixture = f;
      f.stateIndex = f.refIndex = 0;
      return Player({ name: "歌曲.mp3", keyPath: "歌曲.mp3", url: "local-test.mp3" });
    },
  };
  return f;
}

test("mobile artwork opens lyrics; clicking a lyric closes them without seeking", () => {
  const f = fixture();
  let tree = f.render();
  const artwork = byClass(tree, "r2-audio-artwork");
  assert.equal(artwork.props.role, "button");
  assert.equal(artwork.props.tabIndex, 0);
  artwork.props.onClick();
  assert.equal(f.state.mobileLyricsOpen, true);
  tree = f.render();
  const lyrics = byLabel(tree, "歌词");
  assert.ok(lyrics);
  const line = byLabel(tree, "第二句，返回歌曲海报");
  line.props.onClick();
  // React bubbles the line click to the lyric viewport.
  lyrics.props.onClick();
  assert.equal(f.state.mobileLyricsOpen, false);
  assert.equal(f.audio.currentTime, 12);
  assert.equal(byLabel(f.render(), "歌词"), null);
});

test("mobile artwork can be activated by Enter and Space", () => {
  for (const key of ["Enter", " "]) {
    const f = fixture();
    let prevented = false;
    byClass(f.render(), "r2-audio-artwork").props.onKeyDown({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(f.state.mobileLyricsOpen, true);
  }
});

test("a track without lyrics does not open a blank lyric view", () => {
  const f = fixture({ lyricsText: "" });
  const artwork = byClass(f.render(), "r2-audio-artwork");
  assert.equal(artwork.props.role, undefined);
  artwork.props.onClick();
  assert.equal(f.state.mobileLyricsOpen, false);
});

test("desktop lyrics still seek; the artwork does not toggle lyrics", () => {
  const f = fixture({ compactLayout: false });
  const tree = f.render();
  byClass(tree, "r2-audio-artwork").props.onClick();
  assert.equal(f.state.mobileLyricsOpen, false);
  byLabel(tree, "第二句，跳转到 0:30").props.onClick();
  byLabel(tree, "歌词").props.onClick();
  assert.equal(f.audio.currentTime, 30);
  assert.equal(f.state.currentTime, 30);
  assert.equal(f.state.showLyrics, true);
});

test("desktop mounts only the merged settings control and mounts the popup on demand", () => {
  const f = fixture({ compactLayout: false });
  let tree = f.render();
  assert.equal(byClass(tree, "r2-audio-speed"), null);
  assert.equal(byClass(tree, "r2-audio-volume"), null);
  assert.equal(byClass(tree, "r2-audio-settings-popover"), null);
  assert.ok(byClass(tree, "r2-audio-settings-trigger"));
  byClass(tree, "r2-audio-playback-settings").props.onMouseEnter();
  tree = f.render();
  assert.equal(byClass(tree, "r2-audio-settings-trigger").props["aria-expanded"], true);
  byLabel(tree, "播放速度").props.onChange({ currentTarget: { value: "1.5" } });
  byLabel(tree, "音量").props.onChange({ currentTarget: { value: "0" } });
  assert.equal(f.state.playbackRate, 1.5);
  assert.equal(f.state.volume, 0);
  assert.equal(f.state.muted, true);
  let focused = false;
  byClass(f.render(), "r2-audio-playback-settings").props.onKeyDown({
    key: "Escape", stopPropagation() {},
    currentTarget: { querySelector() { return { focus() { focused = true; } }; } },
  });
  assert.equal(focused, true);
  assert.equal(f.state.playbackSettingsOpen, false);
  assert.equal(byClass(f.render(), "r2-audio-settings-popover"), null);
});

test("mobile retains its existing speed, volume and lyric buttons without desktop duplicates", () => {
  const tree = fixture({ playbackSettingsOpen: true }).render();
  assert.equal(byClass(tree, "r2-audio-playback-settings"), null);
  assert.ok(byClass(tree, "r2-audio-speed"));
  assert.ok(byClass(tree, "r2-audio-volume"));
  assert.ok(byClass(tree, "r2-audio-lyrics-toggle"));
});
