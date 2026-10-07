/**
 * tracker-model — converts tracker progress to/from the Excel workbook layout.
 * Shared by the Node server (store.js) and the browser (static / GitHub Pages
 * mode), so both produce and read exactly the same workbook.
 *
 * Sheets
 *   Settings   Key | Value                     (start_date, updated_at)
 *   Tasks      Day | Week | DayName | TaskNo | Task | Minutes | Type | Done | CompletedAt
 *   Questions  Day | Week | Questions
 *   Scores     Exam | DomainCode | Domain | Score
 *   Notes      Day | Note
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrackerModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOMAINS = [
    ['d1', 'D1 Security & Risk Management', '16%'],
    ['d2', 'D2 Asset Security', '10%'],
    ['d3', 'D3 Security Architecture & Engineering', '13%'],
    ['d4', 'D4 Communication & Network Security', '13%'],
    ['d5', 'D5 Identity & Access Management', '13%'],
    ['d6', 'D6 Security Assessment & Testing', '12%'],
    ['d7', 'D7 Security Operations', '13%'],
    ['d8', 'D8 Software Development Security', '10%'],
  ];

  function emptyProgress() {
    return { startDate: null, done: {}, completedAt: {}, questions: {}, scores: {}, notes: {}, updatedAt: null };
  }

  function truthy(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') return ['true', 'yes', 'y', 'x', '1', 'done', '✓'].indexOf(v.trim().toLowerCase()) >= 0;
    return false;
  }

  /** progress -> sheets (every day/task pre-filled so the workbook is a checklist on its own) */
  function toSheets(plan, p) {
    var taskRows = [['Day', 'Week', 'DayName', 'TaskNo', 'Task', 'Minutes', 'Type', 'Done', 'CompletedAt']];
    plan.days.forEach(function (d) {
      d.tasks.forEach(function (t, i) {
        var key = d.day + ':' + i;
        taskRows.push([d.day, d.week, d.dayName, i + 1, t.text, t.minutes, t.type, p.done[key] === true, (p.completedAt && p.completedAt[key]) || null]);
      });
    });
    var questionRows = [['Day', 'Week', 'Questions']];
    plan.days.forEach(function (d) { questionRows.push([d.day, d.week, p.questions[d.day] != null ? p.questions[d.day] : null]); });

    var scoreRows = [['Exam', 'DomainCode', 'Domain', 'Score']];
    [1, 2].forEach(function (exam) {
      DOMAINS.forEach(function (dom) {
        var v = p.scores['e' + exam + '_' + dom[0]];
        scoreRows.push([exam, dom[0], dom[1], v != null ? v : null]);
      });
    });

    var noteRows = [['Day', 'Note']];
    plan.days.forEach(function (d) { noteRows.push([d.day, p.notes[d.day] != null ? p.notes[d.day] : null]); });

    return [
      { name: 'Settings', rows: [['Key', 'Value'], ['start_date', p.startDate], ['updated_at', p.updatedAt], ['plan', plan.title]], widths: [16, 30] },
      { name: 'Tasks', rows: taskRows, widths: [6, 6, 9, 7, 70, 8, 8, 7, 22] },
      { name: 'Questions', rows: questionRows, widths: [6, 6, 10] },
      { name: 'Scores', rows: scoreRows, widths: [6, 11, 40, 8] },
      { name: 'Notes', rows: noteRows, widths: [6, 90] },
    ];
  }

  /** sheets -> progress (tolerant of edits made by hand in Excel) */
  function fromSheets(sheets) {
    var byName = {};
    sheets.forEach(function (s) { byName[s.name.toLowerCase()] = s.rows; });
    var p = emptyProgress();

    (byName.settings || []).slice(1).forEach(function (row) {
      var k = row[0], v = row[1];
      if (k === 'start_date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) p.startDate = v;
      if (k === 'updated_at' && typeof v === 'string') p.updatedAt = v;
    });
    (byName.tasks || []).slice(1).forEach(function (row) {
      var day = Number(row[0]), taskNo = Number(row[3]);
      if (day >= 1 && day <= 90 && taskNo >= 1 && truthy(row[7])) {
        p.done[day + ':' + (taskNo - 1)] = true;
        if (typeof row[8] === 'string' && row[8]) p.completedAt[day + ':' + (taskNo - 1)] = row[8];
      }
    });
    (byName.questions || []).slice(1).forEach(function (row) {
      var day = Number(row[0]), n = Number(row[2]);
      if (day >= 1 && day <= 90 && Number.isInteger(n) && n > 0) p.questions[day] = Math.min(1000, n);
    });
    (byName.scores || []).slice(1).forEach(function (row) {
      var exam = Number(row[0]), code = String(row[1] || ''), score = row[3];
      if ((exam === 1 || exam === 2) && /^d[1-8]$/.test(code) && score !== null && score !== '' && isFinite(Number(score))) {
        p.scores['e' + exam + '_' + code] = Math.max(0, Math.min(100, Number(score)));
      }
    });
    (byName.notes || []).slice(1).forEach(function (row) {
      var day = Number(row[0]);
      if (day >= 1 && day <= 90 && row[1] !== null && row[1] !== undefined && String(row[1]).trim()) p.notes[day] = String(row[1]).slice(0, 4000);
    });
    return p;
  }

  return { DOMAINS: DOMAINS, emptyProgress: emptyProgress, toSheets: toSheets, fromSheets: fromSheets, truthy: truthy };
});
