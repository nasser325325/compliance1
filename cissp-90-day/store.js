'use strict';

/**
 * Excel-backed data store.
 *
 * The single source of truth is DATA_DIR/cissp-tracker.xlsx — a real workbook you
 * can open, read and edit in Excel. Every save rewrites it atomically; every load
 * reads it back, so ticks made in Excel show up in the web app and vice versa.
 *
 * Sheets
 *   Settings   Key | Value                     (start_date, updated_at)
 *   Tasks      Day | Week | DayName | TaskNo | Task | Minutes | Type | Done | CompletedAt
 *   Questions  Day | Week | Questions
 *   Scores     Exam | DomainCode | Domain | Score
 *   Notes      Day | Note
 *
 * A legacy progress.json (from v1) is migrated into the workbook on first load.
 */

const fs = require('fs');
const path = require('path');
const { writeWorkbook, readWorkbook } = require('./xlsx-lite');
const PLAN = require('./plan');

const DOMAINS = [
  ['d1', 'D1 Security & Risk Management'],
  ['d2', 'D2 Asset Security'],
  ['d3', 'D3 Security Architecture & Engineering'],
  ['d4', 'D4 Communication & Network Security'],
  ['d5', 'D5 Identity & Access Management'],
  ['d6', 'D6 Security Assessment & Testing'],
  ['d7', 'D7 Security Operations'],
  ['d8', 'D8 Software Development Security'],
];

function emptyProgress() {
  return { startDate: null, done: {}, completedAt: {}, questions: {}, scores: {}, notes: {}, updatedAt: null };
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'cissp-tracker.xlsx');
    this.legacyJson = path.join(dataDir, 'progress.json');
  }

  // ------------------------------------------------------------ read ----

  load() {
    if (!fs.existsSync(this.file)) {
      // first run: migrate v1 JSON if present, otherwise start fresh and create the workbook
      let p = emptyProgress();
      try { p = { ...p, ...JSON.parse(fs.readFileSync(this.legacyJson, 'utf8')) }; } catch { /* none */ }
      p.updatedAt = new Date().toISOString();
      this.save(p);
      return p;
    }
    const sheets = readWorkbook(fs.readFileSync(this.file));
    const byName = Object.fromEntries(sheets.map((s) => [s.name.toLowerCase(), s.rows]));
    const p = emptyProgress();

    for (const row of (byName.settings || []).slice(1)) {
      const [k, v] = row;
      if (k === 'start_date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) p.startDate = v;
      if (k === 'updated_at' && typeof v === 'string') p.updatedAt = v;
    }
    for (const row of (byName.tasks || []).slice(1)) {
      const day = Number(row[0]); const taskNo = Number(row[3]); const done = truthy(row[7]);
      if (day >= 1 && day <= 90 && taskNo >= 1 && done) {
        p.done[`${day}:${taskNo - 1}`] = true;
        if (typeof row[8] === 'string' && row[8]) p.completedAt[`${day}:${taskNo - 1}`] = row[8];
      }
    }
    for (const row of (byName.questions || []).slice(1)) {
      const day = Number(row[0]); const n = Number(row[2]);
      if (day >= 1 && day <= 90 && Number.isInteger(n) && n > 0) p.questions[day] = Math.min(1000, n);
    }
    for (const row of (byName.scores || []).slice(1)) {
      const exam = Number(row[0]); const code = String(row[1] || ''); const score = row[3];
      if ((exam === 1 || exam === 2) && /^d[1-8]$/.test(code) && score !== null && score !== '' && Number.isFinite(Number(score))) {
        p.scores[`e${exam}_${code}`] = Math.max(0, Math.min(100, Number(score)));
      }
    }
    for (const row of (byName.notes || []).slice(1)) {
      const day = Number(row[0]);
      if (day >= 1 && day <= 90 && row[1] !== null && row[1] !== undefined && String(row[1]).trim()) p.notes[day] = String(row[1]).slice(0, 4000);
    }
    return p;
  }

  // ----------------------------------------------------------- write ----

  save(p) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const buf = writeWorkbook(this.toSheets(p));
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, this.file); // atomic replace
    return buf;
  }

  /** Raw workbook bytes for download (regenerated from the current state). */
  exportBuffer() {
    return writeWorkbook(this.toSheets(this.load()));
  }

  toSheets(p) {
    const taskRows = [['Day', 'Week', 'DayName', 'TaskNo', 'Task', 'Minutes', 'Type', 'Done', 'CompletedAt']];
    for (const d of PLAN.days) {
      d.tasks.forEach((t, i) => {
        const key = `${d.day}:${i}`;
        taskRows.push([d.day, d.week, d.dayName, i + 1, t.text, t.minutes, t.type, p.done[key] === true, p.completedAt?.[key] || null]);
      });
    }
    const questionRows = [['Day', 'Week', 'Questions']];
    for (const d of PLAN.days) questionRows.push([d.day, d.week, p.questions[d.day] ?? null]);

    const scoreRows = [['Exam', 'DomainCode', 'Domain', 'Score']];
    for (const exam of [1, 2]) for (const [code, name] of DOMAINS) scoreRows.push([exam, code, name, p.scores[`e${exam}_${code}`] ?? null]);

    const noteRows = [['Day', 'Note']];
    for (const d of PLAN.days) noteRows.push([d.day, p.notes[d.day] ?? null]);

    return [
      { name: 'Settings', rows: [['Key', 'Value'], ['start_date', p.startDate], ['updated_at', p.updatedAt], ['plan', PLAN.title]], widths: [16, 30] },
      { name: 'Tasks', rows: taskRows, widths: [6, 6, 9, 7, 70, 8, 8, 7, 22] },
      { name: 'Questions', rows: questionRows, widths: [6, 6, 10] },
      { name: 'Scores', rows: scoreRows, widths: [6, 11, 40, 8] },
      { name: 'Notes', rows: noteRows, widths: [6, 90] },
    ];
  }
}

function truthy(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') return ['true', 'yes', 'y', 'x', '1', 'done', '✓'].includes(v.trim().toLowerCase());
  return false;
}

module.exports = { Store, emptyProgress, DOMAINS };
