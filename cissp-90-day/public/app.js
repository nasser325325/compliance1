(() => {
  'use strict';

  const LS_KEY = 'cissp90.progress';
  const DAY_MS = 86400000;

  let plan = null;
  let progress = { startDate: null, done: {}, questions: {}, scores: {}, notes: {} };
  let selectedDay = 1;
  let saveTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  };

  // ---------- persistence ----------

  function setStatus(state) {
    const s = $('#saveStatus');
    s.className = 'status ' + (state || '');
    s.title = state === 'saving' ? 'Saving…' : state === 'error' ? 'Server unreachable — saved in this browser only' : 'Saved';
  }

  async function load() {
    const [planRes, progRes] = await Promise.allSettled([
      fetch('/api/plan').then((r) => r.json()),
      fetch('/api/progress').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ]);
    if (planRes.status !== 'fulfilled') throw new Error('plan unavailable');
    plan = planRes.value;

    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignore */ }

    if (progRes.status === 'fulfilled') {
      const server = progRes.value;
      // Prefer whichever copy is newer, so a browser that saved offline is not overwritten.
      if (local && local.updatedAt && (!server.updatedAt || local.updatedAt > server.updatedAt)) {
        progress = local;
        scheduleSave();
      } else {
        progress = server;
      }
      setStatus('');
    } else {
      if (local) progress = local;
      setStatus('error');
    }
    progress.done ||= {}; progress.questions ||= {}; progress.scores ||= {}; progress.notes ||= {};
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus('saving');
    progress.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(progress)); } catch { /* ignore */ }
    saveTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progress),
        });
        if (!r.ok) throw new Error(r.status);
        setStatus('');
      } catch {
        setStatus('error');
      }
    }, 500);
  }

  // ---------- derived values ----------

  function todayDay() {
    if (!progress.startDate) return null;
    const start = new Date(progress.startDate + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = Math.floor((now - start) / DAY_MS) + 1;
    return Math.max(1, Math.min(90, d));
  }

  function dateForDay(d) {
    if (!progress.startDate) return null;
    const start = new Date(progress.startDate + 'T00:00:00');
    return new Date(start.getTime() + (d - 1) * DAY_MS);
  }

  const fmtDate = (dt) => dt ? dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

  function isDone(day, idx) { return progress.done[`${day}:${idx}`] === true; }
  function dayComplete(d) { return d.tasks.every((_, i) => isDone(d.day, i)); }

  function totals() {
    let tasks = 0, done = 0, minutes = 0, questions = 0;
    for (const d of plan.days) {
      d.tasks.forEach((t, i) => { tasks++; if (isDone(d.day, i)) { done++; minutes += t.minutes; } });
      questions += Number(progress.questions[d.day] || 0);
    }
    return { tasks, done, hours: Math.round(minutes / 60), questions };
  }

  // ---------- rendering ----------

  function renderDash() {
    const t = totals();
    const today = todayDay();
    $('#dayNum').textContent = today ?? '—';
    $('#dayDate').textContent = today ? `${fmtDate(dateForDay(today))} · week ${Math.min(13, Math.ceil(today / 7))}` : 'Set a start date to begin';
    const pct = t.tasks ? Math.round((t.done / t.tasks) * 100) : 0;
    $('#pctDone').textContent = pct;
    $('#barDone').style.width = pct + '%';
    $('#qDone').textContent = t.questions.toLocaleString();
    $('#barQ').style.width = Math.min(100, (t.questions / plan.questionTarget) * 100) + '%';
    $('#hDone').textContent = t.hours;
    $('#barH').style.width = Math.min(100, (t.hours / plan.totalHoursTarget) * 100) + '%';
    $('#startDate').value = progress.startDate || '';
    $('#examDate').textContent = fmtDate(dateForDay(83)); // Saturday of week 12
  }

  function taskRow(d, i, t) {
    const done = isDone(d.day, i);
    const cb = el('input', { type: 'checkbox', onchange: (e) => {
      if (e.target.checked) progress.done[`${d.day}:${i}`] = true; else delete progress.done[`${d.day}:${i}`];
      scheduleSave(); renderAll();
    } });
    cb.checked = done;
    return el('li', { class: done ? 'done' : '' },
      cb,
      el('span', { class: 'text', text: t.text }),
      el('span', { class: 'tag ' + t.type, text: t.minutes ? `${t.minutes} min` : t.type }),
    );
  }

  function renderToday() {
    const d = plan.days[selectedDay - 1];
    const w = plan.weeks.find((x) => x.week === d.week);
    const title = $('#todayTitle');
    title.replaceChildren(
      el('button', { class: 'tab', text: '‹', title: 'Previous day', onclick: () => { selectedDay = Math.max(1, selectedDay - 1); renderToday(); } }),
      ` Day ${d.day} · ${d.dayName}${progress.startDate ? ' · ' + fmtDate(dateForDay(d.day)) : ''} `,
      el('button', { class: 'tab', text: '›', title: 'Next day', onclick: () => { selectedDay = Math.min(90, selectedDay + 1); renderToday(); } }),
    );
    title.querySelectorAll('button').forEach((b) => { b.style.cssText = 'background:var(--surface-alt);color:var(--ink);padding:2px 10px;'; });
    $('#todayDomain').textContent = `Week ${w.week} — ${w.domain} (${w.weight} of the exam)`;

    const ul = $('#todayTasks');
    ul.replaceChildren(...d.tasks.map((t, i) => taskRow(d, i, t)));

    const q = $('#todayQ');
    q.value = progress.questions[d.day] ?? '';
    q.oninput = () => { const n = Math.max(0, Math.min(1000, parseInt(q.value, 10) || 0)); if (n) progress.questions[d.day] = n; else delete progress.questions[d.day]; scheduleSave(); renderDash(); };

    const notes = $('#todayNotes');
    notes.value = progress.notes[d.day] || '';
    notes.oninput = () => { if (notes.value.trim()) progress.notes[d.day] = notes.value.slice(0, 4000); else delete progress.notes[d.day]; scheduleSave(); };

    $('#weekFocus').replaceChildren(
      el('p', { class: 'muted', text: w.summary }),
      el('ul', { class: 'plain' }, ...w.focus.map((f) => el('li', { text: f }))),
      w.acronyms.length ? el('div', { class: 'acros' }, ...w.acronyms.map((a) => el('span', { text: a }))) : null,
      el('p', { class: 'muted', text: w.questionTarget ? `Question target this week: ${w.questionTarget}` : '' }),
    );
  }

  function renderPlan() {
    const today = todayDay();
    const container = $('#weeks');
    container.replaceChildren(...plan.weeks.map((w) => {
      const days = plan.days.filter((d) => d.week === w.week);
      const total = days.reduce((a, d) => a + d.tasks.length, 0);
      const done = days.reduce((a, d) => a + d.tasks.filter((_, i) => isDone(d.day, i)).length, 0);
      const details = el('details', { class: 'card week' },
        el('summary', {},
          el('span', { class: 'wk', text: w.week === 13 ? 'Buffer' : `Week ${w.week}` }),
          el('span', { class: 'dom', text: w.domain }),
          el('span', { class: 'diff ' + w.difficulty, text: w.difficulty }),
          el('span', { class: 'tag', text: w.weight !== '—' ? `weight ${w.weight}` : '' }),
          el('span', { class: 'wprog', text: `${done}/${total}` }),
        ),
        el('div', { class: 'body' },
          el('div', { class: 'focus' },
            el('p', { class: 'muted', text: w.summary }),
            el('ul', {}, ...w.focus.map((f) => el('li', { text: f }))),
            w.acronyms.length ? el('div', { class: 'acros' }, ...w.acronyms.map((a) => el('span', { text: a }))) : null,
          ),
          el('div', { class: 'days' }, ...days.map((d) => dayCard(d, today))),
        ),
      );
      if (today && days.some((d) => d.day === today)) details.open = true;
      return details;
    }));
  }

  function dayCard(d, today) {
    const card = el('div', { class: 'dayc' + (d.day === today ? ' today' : '') + (dayComplete(d) ? ' complete' : '') },
      el('div', { class: 'dh' }, el('span', { text: `Day ${d.day}` }), el('small', { text: d.dayName })),
      ...d.tasks.map((t, i) => {
        const cb = el('input', { type: 'checkbox', onchange: (e) => {
          if (e.target.checked) progress.done[`${d.day}:${i}`] = true; else delete progress.done[`${d.day}:${i}`];
          scheduleSave(); renderAll();
        } });
        cb.checked = isDone(d.day, i);
        return el('label', {}, cb, el('span', { text: t.text.replace(/\s*\(.*?\)\s*$/, '') }));
      }),
    );
    const q = el('input', { type: 'number', min: 0, max: 1000, placeholder: '0', oninput: (e) => {
      const n = Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0));
      if (n) progress.questions[d.day] = n; else delete progress.questions[d.day];
      scheduleSave(); renderDash();
    } });
    q.value = progress.questions[d.day] ?? '';
    card.append(el('div', { class: 'qline' }, 'Qs ', q));
    return card;
  }

  function renderCheckpoints() {
    $('#checkpointCards').replaceChildren(...plan.checkpoints.map((c) =>
      el('div', { class: 'card cp' }, el('h2', { text: c.name }), el('div', { class: 'mins', text: `${c.minutes} min` }), el('p', { class: 'muted', text: c.detail })),
    ));
    const tbody = $('#checkpointTable tbody');
    tbody.replaceChildren(...plan.weeks.filter((w) => w.week <= 12).map((w) => {
      const days = plan.days.filter((d) => d.week === w.week);
      const find = (name, type) => { const d = days.find((x) => x.dayName === name); if (!d) return null; const i = d.tasks.findIndex((t) => t.type === type || (type === 'quiz' && t.type === 'exam')); return i < 0 ? null : isDone(d.day, i); };
      const cell = (v) => el('td', { class: v === null ? 'miss' : v ? 'ok' : 'miss', text: v === null ? 'n/a' : v ? '✓' : '—' });
      const q = days.reduce((a, d) => a + Number(progress.questions[d.day] || 0), 0);
      return el('tr', {}, el('td', { text: `Week ${w.week}` }), cell(find('Wed', 'quiz')), cell(find('Sat', 'quiz')), cell(find('Sun', 'review')), el('td', { text: w.questionTarget ? `${q} / ${w.questionTarget}` : String(q) }));
    }));
  }

  const DOMAINS = [
    ['d1', 'D1 Security & Risk Management', '16%'],
    ['d2', 'D2 Asset Security', '10%'],
    ['d3', 'D3 Security Architecture & Engineering', '13%'],
    ['d4', 'D4 Communication & Network Security', '13%'],
    ['d5', 'D5 Identity & Access Management', '13%'],
    ['d6', 'D6 Security Assessment & Testing', '12%'],
    ['d7', 'D7 Security Operations', '13%'],
    ['d8', 'D8 Software Development Security', '10%'],
  ];

  function renderExams() {
    const tbody = $('#examTable tbody');
    let anyLow = false;
    const avgs = { e1: [], e2: [] };
    tbody.replaceChildren(...DOMAINS.map(([key, name, weight]) => {
      const cells = ['e1', 'e2'].map((ex) => {
        const k = `${ex}_${key}`;
        const v = progress.scores[k];
        if (v !== undefined) { avgs[ex].push(v); if (v < 70) anyLow = true; }
        const input = el('input', { type: 'number', min: 0, max: 100, placeholder: '%', oninput: (e) => {
          const n = e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value)));
          if (n === undefined || Number.isNaN(n)) delete progress.scores[k]; else progress.scores[k] = n;
          scheduleSave(); renderExams();
        } });
        input.value = v ?? '';
        return el('td', { class: v === undefined ? '' : v < 70 ? 'low' : v >= 75 ? 'good' : '' }, input);
      });
      return el('tr', {}, el('td', { text: name }), el('td', { text: weight }), ...cells);
    }));
    const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) + ' %' : '—';
    $('#exam1Avg').textContent = `Exam #1 avg: ${avg(avgs.e1)}`;
    $('#exam2Avg').textContent = `Exam #2 avg: ${avg(avgs.e2)}`;
    $('#examWarn').classList.toggle('hidden', !anyLow);
    $('#materials').replaceChildren(...plan.materials.map((m) => el('li', { text: m })));
  }

  function renderAll() { renderDash(); renderToday(); renderPlan(); renderCheckpoints(); renderExams(); }

  // ---------- wiring ----------

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + b.dataset.view));
  });

  $('#startDate').addEventListener('change', (e) => {
    progress.startDate = e.target.value || null;
    selectedDay = todayDay() || 1;
    scheduleSave(); renderAll();
  });

  load()
    .then(() => { selectedDay = todayDay() || 1; renderAll(); })
    .catch((err) => { document.body.prepend(el('p', { class: 'pill warn', text: 'Could not load the plan from the server: ' + err.message })); });
})();
