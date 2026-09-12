import JSZip from "jszip";

export type TeamMemberWorkbookRow = {
  displayName: string;
  email: string;
  roleLabel: string;
  status: "active" | "disabled";
  accountCreatedAt?: string | null;
  joinedAt?: string | null;
  lastSignInAt?: string | null;
  isCurrentUser: boolean;
};

const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const TEMPLATE_LAST_ROW = 204;

const STYLE = {
  title: 1,
  note: 2,
  header: 3,
  body: 4,
  band: 5,
  date: 6,
  dateBand: 7,
  active: 8,
  disabled: 9,
  admin: 10,
  superAdmin: 11,
} as const;

const xmlText = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const cellRef = (column: number, row: number) => `${String.fromCharCode(65 + column)}${row}`;

const textCell = (column: number, row: number, value: string, style: number) =>
  `<c r="${cellRef(column, row)}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;

const emptyCell = (column: number, row: number, style: number) =>
  `<c r="${cellRef(column, row)}" s="${style}"/>`;

const numberCell = (column: number, row: number, value: number, style: number) =>
  `<c r="${cellRef(column, row)}" s="${style}"><v>${value}</v></c>`;

const sheetRow = (row: number, height: number, cells: string) =>
  `<row r="${row}" ht="${height}" customHeight="1">${cells}</row>`;

const dateSerial = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const localTime = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(),
  );
  return (localTime - EXCEL_EPOCH) / 86_400_000;
};

const dateCell = (column: number, row: number, value: string | null | undefined, banded: boolean) => {
  const style = banded ? STYLE.dateBand : STYLE.date;
  const serial = dateSerial(value);
  return serial === null
    ? value ? textCell(column, row, "—", banded ? STYLE.band : STYLE.body) : emptyCell(column, row, style)
    : numberCell(column, row, serial, style);
};

const fill = (color: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;

const font = (color: string, size: number, bold = false) =>
  `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Arial"/>${bold ? "<b/>" : ""}</font>`;

const cellFormat = (fontId: number, fillId: number, borderId: number, options?: { date?: boolean; center?: boolean; indent?: boolean }) =>
  `<xf numFmtId="${options?.date ? 164 : 0}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${options?.date ? ' applyNumberFormat="1"' : ""}><alignment horizontal="${options?.center ? "center" : "left"}" vertical="center"${options?.indent ? ' indent="1"' : ""}/></xf>`;

const stylesXml = () => {
  const fonts = [
    font("334155", 10),
    font("0F172A", 16, true),
    font("64748B", 10),
    font("FFFFFF", 10, true),
    font("047857", 10, true),
    font("B91C1C", 10, true),
    font("1D4ED8", 10, true),
    font("4F46E5", 10, true),
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    fill("1D4ED8"),
    fill("F8FAFC"),
    fill("ECFDF5"),
    fill("FEF2F2"),
    fill("EFF6FF"),
    fill("EEF2FF"),
  ];
  const borders = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>',
    '<border><left/><right style="thin"><color rgb="FF93C5FD"/></right><top/><bottom/><diagonal/></border>',
  ];
  const formats = [
    cellFormat(0, 0, 0),
    cellFormat(1, 0, 0),
    cellFormat(2, 0, 0),
    cellFormat(3, 2, 2, { center: true }),
    cellFormat(0, 0, 1, { indent: true }),
    cellFormat(0, 3, 1, { indent: true }),
    cellFormat(0, 0, 1, { date: true, indent: true }),
    cellFormat(0, 3, 1, { date: true, indent: true }),
    cellFormat(4, 4, 1, { center: true }),
    cellFormat(5, 5, 1, { center: true }),
    cellFormat(6, 6, 1, { center: true }),
    cellFormat(7, 7, 1, { center: true }),
  ];

  return `${XML_HEADER}<styleSheet xmlns="${SPREADSHEET_NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${formats.length}">${formats.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
};

const worksheetXml = (options: {
  columnWidths: number[];
  lastRow: number;
  rows: string[];
  filterRange?: string;
  merges: string[];
  validation?: string;
}) => {
  const lastColumn = String.fromCharCode(64 + options.columnWidths.length);
  const columns = options.columnWidths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  const merges = options.merges.length
    ? `<mergeCells count="${options.merges.length}">${options.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `${XML_HEADER}<worksheet xmlns="${SPREADSHEET_NS}"><dimension ref="A1:${lastColumn}${options.lastRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${columns}</cols><sheetData>${options.rows.join("")}</sheetData>${options.filterRange ? `<autoFilter ref="${options.filterRange}"/>` : ""}${merges}${options.validation ?? ""}<pageMargins left="0.35" right="0.35" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
};

const buildWorkbook = async (sheetName: string, worksheet: string): Promise<Blob> => {
  const zip = new JSZip();
  const now = new Date().toISOString();

  zip.file("[Content_Types].xml", `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `${XML_HEADER}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", stylesXml());
  zip.file("xl/worksheets/sheet1.xml", worksheet);
  zip.file("docProps/core.xml", `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>R2 Admin Go</dc:creator><cp:lastModifiedBy>R2 Admin Go</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file("docProps/app.xml", `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>R2 Admin Go</Application></Properties>`);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
};

export const buildMemberImportTemplateWorkbook = (allowedRoles: string[]): Promise<Blob> => {
  const roles = allowedRoles.length ? allowedRoles : ["协作成员"];
  const rows: string[] = [
    sheetRow(1, 34, textCell(0, 1, "团队成员导入模板", STYLE.title)),
    sheetRow(2, 25, textCell(0, 2, `从第 5 行开始填写；身份可选：${roles.join("、")}。`, STYLE.note)),
    sheetRow(3, 11, ""),
    sheetRow(4, 30, ["用户名", "邮箱", "初始密码", "身份"].map((value, column) => textCell(column, 4, value, STYLE.header)).join("")),
  ];
  for (let row = 5; row <= TEMPLATE_LAST_ROW; row++) {
    const style = row % 2 === 0 ? STYLE.band : STYLE.body;
    rows.push(sheetRow(row, 27, [0, 1, 2, 3].map((column) => emptyCell(column, row, style)).join("")));
  }
  const validationChoices = xmlText(`"${roles.join(",")}"`);
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="身份不合法" error="请选择列表中的成员身份" sqref="D5:D${TEMPLATE_LAST_ROW}"><formula1>${validationChoices}</formula1></dataValidation></dataValidations>`;
  const worksheet = worksheetXml({
    columnWidths: [20, 36, 22, 22],
    lastRow: TEMPLATE_LAST_ROW,
    rows,
    filterRange: `A4:D${TEMPLATE_LAST_ROW}`,
    merges: ["A1:D1", "A2:D2"],
    validation,
  });
  return buildWorkbook("成员导入模板", worksheet);
};

const localDateTimeLabel = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const buildTeamMembersExportWorkbook = (
  teamName: string,
  members: TeamMemberWorkbookRow[],
  exportedAt = new Date(),
): Promise<Blob> => {
  const rows: string[] = [
    sheetRow(1, 34, textCell(0, 1, "团队成员", STYLE.title)),
    sheetRow(2, 25, textCell(0, 2, `团队：${teamName || "当前团队"}`, STYLE.note) + textCell(4, 2, `导出时间：${localDateTimeLabel(exportedAt)}`, STYLE.note)),
    sheetRow(3, 11, ""),
    sheetRow(4, 30, ["姓名", "邮箱", "身份", "账户状态", "账户注册时间", "加入团队时间", "最近一次登录时间"].map((value, column) => textCell(column, 4, value, STYLE.header)).join("")),
  ];

  members.forEach((member, index) => {
    const row = index + 5;
    const banded = index % 2 === 1;
    const bodyStyle = banded ? STYLE.band : STYLE.body;
    const roleStyle = member.roleLabel === "超级管理员" ? STYLE.superAdmin : member.roleLabel === "管理员" ? STYLE.admin : bodyStyle;
    const cells = [
      textCell(0, row, member.displayName || "未命名成员", bodyStyle),
      textCell(1, row, member.email, bodyStyle),
      textCell(2, row, member.roleLabel, roleStyle),
      textCell(3, row, member.status === "active" ? "已启用" : "已禁用", member.status === "active" ? STYLE.active : STYLE.disabled),
      dateCell(4, row, member.accountCreatedAt, banded),
      dateCell(5, row, member.joinedAt, banded),
      member.isCurrentUser ? textCell(6, row, "当前在线", STYLE.active) : dateCell(6, row, member.lastSignInAt, banded),
    ];
    rows.push(sheetRow(row, 27, cells.join("")));
  });

  const lastRow = Math.max(4, members.length + 4);
  const worksheet = worksheetXml({
    columnWidths: [21, 37, 19, 16, 24, 24, 25],
    lastRow,
    rows,
    filterRange: `A4:G${lastRow}`,
    merges: ["A1:G1", "A2:D2", "E2:G2"],
  });
  return buildWorkbook("团队成员", worksheet);
};
