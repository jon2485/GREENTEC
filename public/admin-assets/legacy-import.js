/* Legacy import screen: reads the owner's export files in the browser (gzip/jsonl/json) and sends small batches. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function post(url, fd) { return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json().catch(function () { return { status: 'error', message: 'שגיאת שרת (' + r.status + ')' }; }); }); }

  async function readText(file) {
    if (/\.gz$/i.test(file.name)) {
      if (!window.DecompressionStream) throw new Error('הדפדפן לא תומך בפתיחת gz. השתמשו ב־Chrome/Edge עדכני, או חלצו את הקובץ קודם.');
      return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return await file.text();
  }
  async function readRecords(file, kind) {
    var text = await readText(file);
    if (kind === 'carts') return [JSON.parse(text)];
    var t = text.trim();
    if (t[0] === '[') return JSON.parse(t);
    var out = []; t.split(/\r?\n/).forEach(function (l) { l = l.trim(); if (l) out.push(JSON.parse(l)); }); return out;
  }
  function reportHtml(r, title) {
    var reasons = Object.keys(r.reasons || {}).map(function (k) { return '<li>' + esc(k) + ': ' + r.reasons[k] + '</li>'; }).join('');
    return '<div class="border rounded p-2 bg-light"><b>' + esc(title || 'דוח') + '</b> — נוצרו ' + r.created + ' · עודכנו ' + r.updated + ' · דולגו ' + r.skipped + ' · נכשלו ' + r.failed +
      (reasons ? '<ul class="small mb-0 mt-1">' + reasons + '</ul>' : '') + ((r.notes || []).length ? '<details class="small mt-1"><summary>הערות</summary>' + r.notes.map(esc).join('<br>') + '</details>' : '') + '</div>';
  }
  function previewHtml(rows) {
    if (!rows.length) return '<p class="text-muted small">אין רשומות להצגה</p>';
    var cols = Object.keys(rows[0]);
    return '<div class="table-responsive mt-2"><table class="table table-sm adm-table"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + esc(r[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function merge(a, b) { ['created', 'updated', 'skipped', 'failed'].forEach(function (k) { a[k] += b[k] || 0; }); Object.keys(b.reasons || {}).forEach(function (k) { a.reasons[k] = (a.reasons[k] || 0) + b.reasons[k]; }); (b.notes || []).forEach(function (n) { if (a.notes.length < 60) a.notes.push(n); }); return a; }

  $$('[data-legacy-kind]').forEach(function (box) {
    var kind = box.dataset.legacyKind, url = box.dataset.batchUrl, input = $('[data-legacy-file]', box), out = $('[data-legacy-out]', box);
    var bPrev = $('[data-legacy-preview]', box), bRun = $('[data-legacy-run]', box), bStop = $('[data-legacy-stop]', box), bar = $('.progress', box), pb = $('.progress-bar', box);
    var records = null, stop = false;
    input.addEventListener('change', async function () {
      records = null; bPrev.disabled = bRun.disabled = true; if (!input.files[0]) return;
      out.innerHTML = '<span class="small text-muted">קורא את הקובץ...</span>';
      try { records = await readRecords(input.files[0], kind); out.innerHTML = '<span class="small">נקראו ' + records.length.toLocaleString('he-IL') + ' רשומות. כדאי לבדוק תצוגה מקדימה לפני הייבוא.</span>'; bPrev.disabled = bRun.disabled = false; }
      catch (e) { out.innerHTML = '<div class="alert alert-danger small">לא ניתן לקרוא את הקובץ: ' + esc(e.message) + '</div>'; }
    });
    bPrev.addEventListener('click', async function () {
      var fd = new FormData(); fd.append('kind', kind); fd.append('dry', '1'); fd.append('records', JSON.stringify(records.slice(0, kind === 'carts' ? 1 : 20)));
      out.innerHTML = '<span class="small text-muted">מכין תצוגה מקדימה...</span>';
      var r = await post(url, fd);
      out.innerHTML = r.status === 'success' ? '<p class="small mb-1">תצוגה מקדימה – כך יישמרו הרשומות (שום דבר עוד לא נשמר):</p>' + previewHtml(r.preview || []) + ((r.report && r.report.notes || []).length ? '<p class="small">' + r.report.notes.map(esc).join('<br>') + '</p>' : '') : '<div class="alert alert-danger small">' + esc(r.message) + '</div>';
    });
    bStop.addEventListener('click', function () { stop = true; });
    bRun.addEventListener('click', async function () {
      if (!confirm('לייבא ' + records.length.toLocaleString('he-IL') + ' רשומות? אפשר להריץ שוב בלי כפילויות.')) return;
      stop = false; bRun.disabled = bPrev.disabled = input.disabled = true; bStop.classList.remove('d-none'); bar.classList.remove('d-none');
      var total = { created: 0, updated: 0, skipped: 0, failed: 0, reasons: {}, notes: [] }, size = kind === 'orders' ? 100 : kind === 'users' ? 250 : 1, i = 0;
      window.onbeforeunload = function () { return 'הייבוא עדיין רץ'; };
      try {
        while (i < records.length && !stop) {
          var fd = new FormData(); fd.append('kind', kind); fd.append('records', JSON.stringify(records.slice(i, i + size)));
          var r = null;
          for (var t = 0; t < 3 && !r; t++) { try { r = await post(url, fd); if (r.status !== 'success') { if (/התחברות/.test(r.message || '')) throw new Error(r.message); r = null; } } catch (e) { if (t === 2) throw e; } }
          if (!r) throw new Error('החבילה שמתחילה ברשומה ' + (i + 1) + ' נכשלה 3 פעמים');
          merge(total, r.report); i += size;
          var p = Math.min(100, Math.round(i / records.length * 100)); pb.style.width = p + '%'; pb.textContent = p + '% (' + Math.min(i, records.length).toLocaleString('he-IL') + ')';
          out.innerHTML = reportHtml(total, 'בתהליך...');
        }
        out.innerHTML = reportHtml(total, stop ? 'נעצר (אפשר להמשיך בהרצה חוזרת – בלי כפילויות)' : 'הייבוא הסתיים');
      } catch (e) { out.innerHTML = reportHtml(total, 'נעצר בגלל שגיאה') + '<div class="alert alert-danger small mt-2">' + esc(e.message) + '</div>'; }
      finally { window.onbeforeunload = null; bRun.disabled = bPrev.disabled = input.disabled = false; bStop.classList.add('d-none'); }
    });
  });

  var adminBtn = $('[data-legacy-admin]');
  if (adminBtn) adminBtn.addEventListener('click', async function () {
    adminBtn.disabled = true; var box = $('#legacyAdminReport'); box.innerHTML = '<span class="small text-muted">מייבא... (כחצי דקה)</span>';
    var r = await post(adminBtn.dataset.legacyAdmin, new FormData());
    box.innerHTML = r.status === 'success' ? r.html : '<div class="alert alert-danger small">' + esc(r.message) + '</div>'; adminBtn.disabled = false;
  });
  var st = $('#imgStatus');
  if (st) setInterval(function () { if (document.hidden) return; fetch(st.dataset.statusUrl, { method: 'POST', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (r) { if (r.line) st.textContent = r.line; }).catch(function () {}); }, 5000);
})();
