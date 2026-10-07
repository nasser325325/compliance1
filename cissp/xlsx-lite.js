/* eslint-disable no-var */
/**
 * xlsx-lite — a tiny .xlsx reader/writer with no dependencies, usable from
 * Node (module.exports) and the browser (window.XlsxLite).
 *
 * An .xlsx file is a ZIP of XML parts. This implements just enough of both
 * formats to round-trip simple tabular data (strings, numbers, booleans) so the
 * tracker can use an Excel workbook as its database with zero npm packages.
 *
 *   writeWorkbook(sheets, { deflate? })      -> Uint8Array
 *       sheets: [{ name, rows: [[cell, ...], ...], widths?: [n, ...] }]
 *       deflate: optional sync (Uint8Array) -> Uint8Array raw-deflate; without it
 *                entries are stored uncompressed (still a valid .xlsx).
 *   readWorkbook(bytes, { inflate? })        -> Promise<[{ name, rows }]>
 *       inflate: (Uint8Array) -> Uint8Array | Promise<Uint8Array> raw-inflate;
 *                required to read files that Excel (or anything else) compressed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XlsxLite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8');

  // ---------------------------------------------------------------- ZIP ----

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xffffffff;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(d) {
    d = d || new Date();
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  function concat(parts) {
    var len = 0;
    for (var i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len);
    var off = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], off); off += parts[j].length; }
    return out;
  }

  function zipWrite(entries, deflate) {
    var dt = dosDateTime();
    var locals = [];
    var centrals = [];
    var offset = 0;

    for (var i = 0; i < entries.length; i++) {
      var nameBuf = enc.encode(entries[i].name);
      var raw = typeof entries[i].data === 'string' ? enc.encode(entries[i].data) : entries[i].data;
      var method = deflate ? 8 : 0;
      var comp = deflate ? deflate(raw) : raw;
      var crc = crc32(raw);

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);          // version needed
      local.setUint16(6, 0x0800, true);      // flags: UTF-8 names
      local.setUint16(8, method, true);
      local.setUint16(10, dt.time, true);
      local.setUint16(12, dt.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, comp.length, true);
      local.setUint32(22, raw.length, true);
      local.setUint16(26, nameBuf.length, true);
      local.setUint16(28, 0, true);

      var central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);        // version made by
      central.setUint16(6, 20, true);        // version needed
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, method, true);
      central.setUint16(12, dt.time, true);
      central.setUint16(14, dt.date, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, comp.length, true);
      central.setUint32(24, raw.length, true);
      central.setUint16(28, nameBuf.length, true);
      central.setUint16(30, 0, true);        // extra len
      central.setUint16(32, 0, true);        // comment len
      central.setUint16(34, 0, true);        // disk start
      central.setUint16(36, 0, true);        // internal attrs
      central.setUint32(38, 0, true);        // external attrs
      central.setUint32(42, offset, true);   // local header offset

      locals.push(new Uint8Array(local.buffer), nameBuf, comp);
      centrals.push(new Uint8Array(central.buffer), nameBuf);
      offset += 30 + nameBuf.length + comp.length;
    }

    var centralBuf = concat(centrals);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralBuf.length, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);

    return concat(locals.concat([centralBuf, new Uint8Array(end.buffer)]));
  }

  async function zipRead(bytes, inflate) {
    var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = -1;
    for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip file');
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var files = new Map();

    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));

      var lNameLen = dv.getUint16(localOff + 26, true);
      var lExtraLen = dv.getUint16(localOff + 28, true);
      var start = localOff + 30 + lNameLen + lExtraLen;
      var data = buf.subarray(start, start + compSize);
      if (method === 0) files.set(name, data);
      else if (method === 8) {
        if (!inflate) throw new Error('workbook is compressed and no inflate function was provided');
        files.set(name, await inflate(data));
      } else throw new Error('unsupported zip method ' + method + ' for ' + name);

      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  // ---------------------------------------------------------------- XML ----

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function unesc(s) {
    return s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(Number(d)); })
      .replace(/&amp;/g, '&');
  }

  function colLetter(n) {
    var s = '';
    n += 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  // -------------------------------------------------------------- WRITE ----

  function cellXml(ref, v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
    if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    if (v instanceof Date) v = v.toISOString();
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var rows = sheet.rows.map(function (row, r) {
      var cells = row.map(function (v, c) { return cellXml(colLetter(c) + (r + 1), v); }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');
    var cols = sheet.widths && sheet.widths.length
      ? '<cols>' + sheet.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>'
      : '';
    var freeze = sheet.rows.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + freeze + cols + '<sheetData>' + rows + '</sheetData></worksheet>';
  }

  function writeWorkbook(sheets, opts) {
    opts = opts || {};
    var entries = [];
    entries.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>',
    });
    entries.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    });
    entries.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>',
    });
    entries.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    });
    entries.push({
      name: 'xl/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    });
    sheets.forEach(function (s, i) { entries.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
    return zipWrite(entries, opts.deflate);
  }

  // --------------------------------------------------------------- READ ----

  function parseSharedStrings(xml) {
    if (!xml) return [];
    var out = [];
    var re = /<si>([\s\S]*?)<\/si>/g;
    var m;
    while ((m = re.exec(xml))) {
      var texts = [];
      var tre = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      var t;
      while ((t = tre.exec(m[1]))) texts.push(unesc(t[1]));
      out.push(texts.join(''));
    }
    return out;
  }

  function parseSheet(xml, shared) {
    var rows = [];
    var cre = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    var m;
    while ((m = cre.exec(xml))) {
      var attrs = m[1];
      var inner = m[2] || '';
      var ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) continue;
      var c = colIndex(ref[1]);
      var r = Number(ref[2]) - 1;
      var type = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
      var vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      var v = vMatch ? unesc(vMatch[1]) : null;
      var value = null;
      if (type === 's') value = shared[Number(v)] !== undefined ? shared[Number(v)] : '';
      else if (type === 'inlineStr') {
        var texts = [];
        var tre = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        var t;
        while ((t = tre.exec(inner))) texts.push(unesc(t[1]));
        value = texts.join('');
      } else if (type === 'b') value = v === '1' || v === 'true';
      else if (type === 'str' || type === 'e') value = v;
      else if (v !== null && v !== '') value = Number(v);
      if (value === null) continue;
      rows[r] = rows[r] || [];
      rows[r][c] = value;
    }
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i]) { rows[i] = []; continue; }
      for (var j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = null;
    }
    return rows;
  }

  async function readWorkbook(bytes, opts) {
    opts = opts || {};
    var files = await zipRead(bytes, opts.inflate);
    var get = function (name) { var f = files.get(name); return f ? dec.decode(f) : null; };
    var wb = get('xl/workbook.xml');
    if (!wb) throw new Error('not an xlsx workbook');
    var rels = get('xl/_rels/workbook.xml.rels') || '';
    var relMap = {};
    var rre = /<Relationship\s+([^>]*?)\/?>/g;
    var m;
    while ((m = rre.exec(rels))) {
      var id = (/Id="([^"]+)"/.exec(m[1]) || [])[1];
      var target = (/Target="([^"]+)"/.exec(m[1]) || [])[1] || '';
      target = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
      if (id) relMap[id] = target;
    }
    var shared = parseSharedStrings(get('xl/sharedStrings.xml'));
    var sheets = [];
    var sre = /<sheet\s+([^>]*?)\/?>/g;
    while ((m = sre.exec(wb))) {
      var name = unesc((/name="([^"]*)"/.exec(m[1]) || [])[1] || '');
      var rid = (/r:id="([^"]+)"/.exec(m[1]) || /\bid="([^"]+)"/.exec(m[1]) || [])[1];
      sheets.push({ name: name, rows: parseSheet(get(relMap[rid]) || '', shared) });
    }
    return sheets;
  }

  return { writeWorkbook: writeWorkbook, readWorkbook: readWorkbook, crc32: crc32 };
});
