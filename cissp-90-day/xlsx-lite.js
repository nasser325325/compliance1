'use strict';

/**
 * xlsx-lite — a tiny .xlsx reader/writer using only Node built-ins (zlib).
 *
 * An .xlsx file is a ZIP of XML parts. This module implements just enough of
 * both formats to round-trip simple tabular data (strings, numbers, booleans)
 * so the app can use an Excel workbook as its database with zero dependencies.
 *
 *   writeWorkbook([{ name: 'Sheet1', rows: [['A', 1, true], ...], widths: [12, 8] }]) -> Buffer
 *   readWorkbook(buffer) -> [{ name: 'Sheet1', rows: [['A', 1, true], ...] }]
 */

const zlib = require('zlib');

// ---------------------------------------------------------------- ZIP ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function zipWrite(entries) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // version needed
    local.writeUInt16LE(0x0800, 6);    // flags: UTF-8 names
    local.writeUInt16LE(8, 8);         // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);      // version made by
    central.writeUInt16LE(20, 6);      // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);      // extra len
    central.writeUInt16LE(0, 32);      // comment len
    central.writeUInt16LE(0, 34);      // disk start
    central.writeUInt16LE(0, 36);      // internal attrs
    central.writeUInt32LE(0, 38);      // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

function zipRead(buf) {
  // Locate the end-of-central-directory record (scan backwards, comment may follow it).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(data) : method === 0 ? Buffer.from(data) : null);
    if (files.get(name) === null) throw new Error(`unsupported zip method ${method} for ${name}`);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------------------------------------------------------------- XML ----

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

function colLetter(n) { // 0 -> A, 25 -> Z, 26 -> AA
  let s = '';
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// -------------------------------------------------------------- WRITE ----

function cellXml(ref, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (v instanceof Date) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.toISOString())}</t></is></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((v, c) => cellXml(`${colLetter(c)}${r + 1}`, v)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = sheet.widths && sheet.widths.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const freeze = sheet.rows.length > 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

function writeWorkbook(sheets) {
  const entries = [];
  entries.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
  });
  entries.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  });
  entries.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
  });
  entries.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });
  entries.push({
    name: 'xl/styles.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
  });
  sheets.forEach((s, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
  return zipWrite(entries);
}

// --------------------------------------------------------------- READ ----

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const texts = [];
    const tre = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(m[1]))) texts.push(unesc(t[1]));
    out.push(texts.join(''));
  }
  return out;
}

function parseSheet(xml, shared) {
  const rows = [];
  const cre = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cre.exec(xml))) {
    const attrs = m[1];
    const inner = m[2] || '';
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const c = colIndex(ref[1]);
    const r = Number(ref[2]) - 1;
    const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
    const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const v = vMatch ? unesc(vMatch[1]) : null;
    let value = null;
    if (type === 's') value = shared[Number(v)] ?? '';
    else if (type === 'inlineStr') {
      const texts = [];
      const tre = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = tre.exec(inner))) texts.push(unesc(t[1]));
      value = texts.join('');
    } else if (type === 'b') value = v === '1' || v === 'true';
    else if (type === 'str' || type === 'e') value = v;
    else if (v !== null && v !== '') value = Number(v);
    if (value === null) continue;
    rows[r] ||= [];
    rows[r][c] = value;
  }
  // Normalise holes to null so consumers can index safely.
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) { rows[i] = []; continue; }
    for (let j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = null;
  }
  return rows;
}

function readWorkbook(buf) {
  const files = zipRead(buf);
  const get = (name) => { const f = files.get(name); return f ? f.toString('utf8') : null; };
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('not an xlsx workbook');
  const rels = get('xl/_rels/workbook.xml.rels') || '';
  const relMap = {};
  const rre = /<Relationship\s+([^>]*?)\/?>/g;
  let m;
  while ((m = rre.exec(rels))) {
    const id = (/Id="([^"]+)"/.exec(m[1]) || [])[1];
    let target = (/Target="([^"]+)"/.exec(m[1]) || [])[1] || '';
    if (target.startsWith('/')) target = target.slice(1); else target = 'xl/' + target;
    if (id) relMap[id] = target;
  }
  const shared = parseSharedStrings(get('xl/sharedStrings.xml'));
  const sheets = [];
  const sre = /<sheet\s+([^>]*?)\/?>/g;
  while ((m = sre.exec(wb))) {
    const name = unesc((/name="([^"]*)"/.exec(m[1]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(m[1]) || /\bid="([^"]+)"/.exec(m[1]) || [])[1];
    const xml = get(relMap[rid]) || '';
    sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  return sheets;
}

module.exports = { writeWorkbook, readWorkbook, crc32 };
