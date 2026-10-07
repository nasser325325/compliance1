'use strict';

/**
 * Excel-backed data store (server mode).
 *
 * The single source of truth is DATA_DIR/cissp-tracker.xlsx — a real workbook you
 * can open, read and edit in Excel. Every save rewrites it atomically; every load
 * reads it back, so ticks made in Excel show up in the web app and vice versa.
 * The sheet layout lives in tracker-model.js and is shared with the browser.
 *
 * A legacy progress.json (from v1) is migrated into the workbook on first load.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { writeWorkbook, readWorkbook } = require('./xlsx-lite');
const { toSheets, fromSheets, emptyProgress, DOMAINS } = require('./tracker-model');
const PLAN = require('./plan');

const deflate = (u8) => new Uint8Array(zlib.deflateRawSync(u8, { level: 6 }));
const inflate = (u8) => new Uint8Array(zlib.inflateRawSync(u8));

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'cissp-tracker.xlsx');
    this.legacyJson = path.join(dataDir, 'progress.json');
  }

  async load() {
    if (!fs.existsSync(this.file)) {
      // first run: migrate v1 JSON if present, otherwise start fresh and create the workbook
      let p = emptyProgress();
      try { p = { ...p, ...JSON.parse(fs.readFileSync(this.legacyJson, 'utf8')) }; } catch { /* none */ }
      p.updatedAt = new Date().toISOString();
      this.save(p);
      return p;
    }
    const sheets = await readWorkbook(new Uint8Array(fs.readFileSync(this.file)), { inflate });
    return fromSheets(sheets);
  }

  save(p) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const bytes = writeWorkbook(toSheets(PLAN, p), { deflate });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, this.file); // atomic replace
    return bytes;
  }

  /** Raw workbook bytes for download (regenerated from the current state). */
  async exportBuffer() {
    return Buffer.from(writeWorkbook(toSheets(PLAN, await this.load()), { deflate }));
  }

  /** Parse an uploaded workbook (import). */
  static async parse(bytes) {
    return fromSheets(await readWorkbook(new Uint8Array(bytes), { inflate }));
  }
}

module.exports = { Store, emptyProgress, DOMAINS };
