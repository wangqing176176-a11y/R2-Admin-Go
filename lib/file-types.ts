import {
  isBrowserPlayableAudioExt,
  isBrowserPlayableVideoExt,
  isLocalAudioOpenExt,
  isLocalVideoOpenExt,
} from "./media-preview";

// Display categories are independent of which formats the previewers can open.
const FILE_TYPE_GROUPS = [
  ["工程图纸", "dwg dxf dwt dwf dwfx dws dgn plt hpgl hpg"],
  ["设计文件", "psd psb pdd ai ait eps epsf xd fig sketch cdr cdt afdesign afphoto clip kra procreate pdn xcf"],
  ["排版文件", "indd indt indl idml pub afpub qxd qxp sla"],
  ["电子表格", "xls xlsx xlsm xlsb xlt xltx xltm csv tsv ods ots et ett numbers"],
  ["文字文稿", "doc docx docm dot dotx dotm rtf odt ott wps wpt pages wpd"],
  ["演示文稿", "ppt pptx pptm pot potx potm pps ppsx ppsm odp otp dps dpt key keynote"],
  ["文本文稿", "txt text md markdown mdx rst org adoc asciidoc"],
  ["版式文档", "pdf xps oxps djvu djv ps"],
  ["三维图形", "obj 3ds stl ply gltf glb off 3dm fbx dae wrl vrml x3d 3mf ifc ifczip brep step stp iges igs fcstd bim blend max ma mb c4d skp u3d usd usda usdc usdz sldprt sldasm ipt iam prt asm catpart catproduct 3dxml ztl zbp"],
  ["思维导图", "xmind mm mmap mind mindnode emmx"],
  ["流程图表", "vsd vsdx vsdm vss vssx vssm vst vstx vstm drawio eddx"],
  ["纲要文稿", "opml"],
  ["图像文件", "jpg jpeg jpe jfif png gif webp bmp dib tif tiff ico icns avif heic heif jxl tga dds exr hdr"],
  ["原始图像", "raw dng cr2 cr3 nef nrw arw orf rw2 raf sr2 pef"],
  ["矢量图形", "svg svgz emf wmf"],
  ["视频工程", "prproj prfpset prel drp veg vep kdenlive mlt wlmp wfp"],
  ["动画工程", "aep aepx aet aetx fla xfl"],
  ["音频工程", "ses sesx aup aup3 als flp logicx band rpp cpr npr"],
  ["视频文件", "mpg mpeg mpe m2v mxf rm swf"],
  ["音频文件", "mid midi aifc au snd caf oga dsf dff"],
  ["字幕文件", "srt ass ssa sub vtt lrc smi ttml"],
  ["网页文档", "html htm xhtml mhtml mht"],
  ["代码文件", "css scss sass less js jsx mjs cjs ts tsx cts java py pyw go c cc cpp cxx h hh hpp hxx cs php rb rs swift kt kts dart lua pl pm r jl scala sc vue svelte proto graphql gql"],
  ["脚本文件", "sh bash zsh fish bat cmd ps1 psm1 vbs ahk"],
  ["查询脚本", "sql"],
  ["排版源码", "tex bib cls sty"],
  ["配置文件", "ini conf cfg config properties toml yaml yml env lock editorconfig gitignore gitattributes npmrc nvmrc"],
  ["数据文件", "json jsonl ndjson xml db sqlite sqlite3 db3 mdb accdb dbf parquet arrow feather avro orc h5 hdf hdf5 npy npz mat dta sav rdata rds dat bin"],
  ["日志文件", "log"],
  ["压缩文件", "zip rar 7z tar gz bz2 xz zst tgz tbz tbz2 txz tzst lz lzma lz4 lzo cab arj ace sit sitx jar war ear"],
  ["磁盘镜像", "iso img dmg nrg vhd vhdx vmdk qcow qcow2 toast"],
  ["应用程序", "exe com scr"],
  ["安装程序", "msi msp msix msixbundle appx appxbundle apk xapk apks aab ipa pkg deb rpm appimage crx vsix nupkg"],
  ["程序组件", "dll so dylib lib a o sys class pyc pyo wasm node"],
  ["字体文件", "ttf otf woff woff2 eot ttc dfont fon fnt"],
  ["证书密钥", "crt cer pem der p12 pfx csr"],
  ["密钥文件", "ppk"],
  ["电子书籍", "epub mobi azw azw3 fb2 ibooks"],
  ["日程文件", "ics ical"],
  ["通讯名片", "vcf vcard"],
] as const;

const FILE_TYPE_LABELS = new Map<string, string>(
  FILE_TYPE_GROUPS.flatMap(([label, extensions]) => extensions.split(" ").map((ext) => [ext, label] as const)),
);

const SPECIAL_FILE_LABELS = new Map([
  ["dockerfile", "代码文件"],
  ["containerfile", "代码文件"],
  ["makefile", "代码文件"],
  ["cmakelists.txt", "代码文件"],
  ["readme", "文本文稿"],
  ["license", "文本文稿"],
  [".gitignore", "配置文件"],
  [".gitattributes", "配置文件"],
  [".editorconfig", "配置文件"],
  [".npmrc", "配置文件"],
  [".nvmrc", "配置文件"],
]);

export const getFileTypeLabel = (item: { type: string; name: string; locked?: boolean }) => {
  if (item.type === "folder") return item.locked ? "保护目录" : "文件目录";
  const name = (item.name.split(/[\\/]/).pop() ?? "").toLowerCase();
  const specialLabel = SPECIAL_FILE_LABELS.get(name);
  if (specialLabel) return specialLabel;
  if (/^\.env(?:\.|$)/.test(name)) return "配置文件";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return "普通文件";
  const ext = name.slice(dotIndex + 1);
  const label = FILE_TYPE_LABELS.get(ext);
  if (label) return label;
  // Explicit source extensions (such as .ts) take priority over ambiguous media suffixes.
  if (isBrowserPlayableVideoExt(ext) || isLocalVideoOpenExt(ext)) return "视频文件";
  if (isBrowserPlayableAudioExt(ext) || isLocalAudioOpenExt(ext)) return "音频文件";
  return "其他文件";
};
