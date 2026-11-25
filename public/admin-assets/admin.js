/* GREENTEC admin – AJAX forms (UPME-style JSON), row editors, pickers, direct-to-bucket uploads. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var toastT;
  function toast(msg, ok) {
    var t = $('#admToast'); if (!t) { alert(msg); return; }
    t.textContent = msg; t.className = 'adm-toast show ' + (ok ? 'ok' : 'err');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'adm-toast'; }, 3800);
  }
  function post(url, fd) {
    return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return { status: 'error', message: 'שגיאת שרת (' + r.status + ')' }; });
    });
  }
  function handle(res) {
    toast(res.message || (res.status === 'success' ? 'בוצע' : 'שגיאה'), res.status === 'success');
    if (res.status === 'success' && res.redirect) setTimeout(function () { location.href = res.redirect; }, 350);
    else if (res.status === 'success' && res.reload) setTimeout(function () { location.reload(); }, 450);
    return res;
  }
  window.admPost = function (url, fd) { return post(url, fd).then(handle); };

  // keep active tab across reloads
  document.addEventListener('shown.bs.tab', function (e) { try { history.replaceState(null, '', '#' + e.target.getAttribute('data-tab-key')); } catch (x) {} });
  function openHashTab() { var h = location.hash.slice(1); if (!h) return; var b = $('[data-tab-key="' + h + '"]'); if (b && window.bootstrap) bootstrap.Tab.getOrCreateInstance(b).show(); }

  // AJAX forms
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f.matches('form[data-ajax]')) return;
    e.preventDefault();
    if ($('[data-uploading]', f)) { toast('המתינו לסיום ההעלאה', false); return; }
    var b = $('button[type=submit],button:not([type])', f); if (b) b.disabled = true;
    post(f.getAttribute('action'), new FormData(f)).then(handle).catch(function () { toast('שגיאת תקשורת', false); }).then(function () { if (b) b.disabled = false; });
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    var act = t.closest('[data-act]');
    if (act) { if (act.dataset.confirm && !confirm(act.dataset.confirm)) return; admPost(act.dataset.act, new FormData()); return; }
    if (t.closest('[data-nav-toggle]')) { t.closest('.adm-nav-group').classList.toggle('open'); return; }
    if (t.closest('[data-side-toggle]')) { $('#admSide').classList.toggle('show'); return; }
    var rm = t.closest('[data-remove-row]'); if (rm) { rm.closest('[data-row]').remove(); return; }
    var add = t.closest('[data-add-row]');
    if (add) { var k = add.dataset.addRow, tpl = $('template[data-tpl="' + k + '"]'), box = $('[data-rows="' + k + '"]'); if (tpl && box) box.insertAdjacentHTML('beforeend', tpl.innerHTML); return; }
    var mv = t.closest('[data-move]');
    if (mv) { var row = mv.closest('[data-row]'), d = mv.dataset.move; if (d === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); if (d === 'down' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); if (d === 'top') row.parentNode.insertBefore(row, row.parentNode.firstElementChild); return; }
    var all = t.closest('[data-check-all]');
    if (all) { var tb = all.closest('table'); $$('tbody input[type=checkbox]', tb).forEach(function (c) { c.checked = all.checked; }); return; }
    if (t.closest('[data-clear-file]')) { var bx = t.closest('[data-file-box]'); $('input[type=hidden]', bx).value = ''; $('.adm-file-state', bx).innerHTML = '<span class="badge text-bg-warning">הקובץ יוסר בשמירה</span>'; return; }
    var pv = t.closest('[data-html-preview]');
    if (pv) { var ta = pv.closest('.mb-3').querySelector('textarea'); var w = window.open('', '_blank'); w.document.write('<html dir="rtl"><body style="font-family:Heebo,sans-serif;padding:20px">' + ta.value + '</body></html>'); return; }
    var res = t.closest('[data-pick-id]');
    if (res) { e.preventDefault(); var pk = res.closest('[data-picker]'); addChip(pk, res.dataset.pickId, res.dataset.pickName); $('.adm-picker-res', pk).innerHTML = ''; $('[data-picker-q]', pk).value = ''; return; }
    var chip = t.closest('[data-rm]'); if (chip) { var pk2 = chip.closest('[data-picker]'); chip.closest('.adm-chip').remove(); syncPicker(pk2); }
  });

  // inline edits in tables (sort, qty, showHome)
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('[data-inline]')) { var fd = new FormData(); fd.append('field', el.dataset.field); fd.append('value', el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value); post(el.dataset.inline, fd).then(function (r) { toast(r.message, r.status === 'success'); }); }
    if (el.matches('[data-memo-tpl]') && el.value) { el.form.querySelector('textarea[name=text]').value = el.value; }
    if (el.matches('[data-upload-to]')) uploadImage(el);
    if (el.matches('[data-upload-gallery]')) uploadGallery(el);
    if (el.matches('[data-bucket-upload]')) uploadDigital(el);
    if (el.matches('[data-studio-upload]')) uploadStudio(el);
  });

  // filters
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.matches('[data-filter-list]')) { var v = el.value.trim(); $$('.form-check', el.nextElementSibling).forEach(function (c) { c.style.display = !v || c.textContent.indexOf(v) >= 0 ? '' : 'none'; }); }
    if (el.matches('[data-filter-table]')) { var v2 = el.value.trim(); $$('tbody tr', el.parentNode).forEach(function (r) { r.style.display = !v2 || r.textContent.indexOf(v2) >= 0 ? '' : 'none'; }); }
    if (el.matches('[data-picker-q]')) pickerSearch(el);
  });

  // ---- product picker ----
  var pT;
  function pickerSearch(el) {
    clearTimeout(pT); var pk = el.closest('[data-picker]'), box = $('.adm-picker-res', pk), q = el.value.trim();
    if (!q) { box.innerHTML = ''; return; }
    pT = setTimeout(function () {
      fetch('/admin/adminAjax/products/lookup?q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (r) {
        box.innerHTML = (r.items || []).map(function (i) { return '<a href="#" class="list-group-item list-group-item-action d-flex gap-2 align-items-center" data-pick-id="' + i.id + '" data-pick-name="' + esc(i.name) + '">' + (i.mainImage ? '<img src="' + esc(i.mainImage) + '" class="adm-thumb-xs" alt="">' : '') + '<span>' + esc(i.name) + '</span> <small class="text-muted">#' + i.id + '</small></a>'; }).join('') || '<div class="list-group-item text-muted small">לא נמצאו מוצרים</div>';
      });
    }, 250);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function addChip(pk, id, name) {
    var chips = $('.adm-chips', pk); if ($('[data-id="' + id + '"]', chips)) return;
    chips.insertAdjacentHTML('beforeend', '<span class="adm-chip" data-id="' + id + '">' + esc(name) + ' <small>#' + id + '</small> <b data-rm>×</b></span>'); syncPicker(pk);
  }
  function syncPicker(pk) { $('input[type=hidden]', pk).value = $$('.adm-chip', pk).map(function (c) { return c.dataset.id; }).join(','); }

  // ---- uploads: presigned PUT straight to the bucket; multipart for big files ----
  function presign(file, extra) {
    var fd = new FormData(); fd.append('name', file.name); fd.append('type', file.type || 'application/octet-stream'); fd.append('size', file.size);
    Object.keys(extra || {}).forEach(function (k) { fd.append(k, extra[k]); });
    return post('/admin/adminAjax/storage/presign', fd).then(function (r) { if (r.status !== 'success') throw new Error(r.message); return r; });
  }
  function putXhr(url, body, type, onProgress) {
    return new Promise(function (ok, bad) {
      var x = new XMLHttpRequest(); x.open('PUT', url); if (type) x.setRequestHeader('Content-Type', type);
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
      x.onload = function () { x.status >= 200 && x.status < 300 ? ok(x.getResponseHeader('ETag')) : bad(new Error('העלאה נכשלה (' + x.status + ')')); };
      x.onerror = function () { bad(new Error('העלאה נחסמה – ייתכן שחסרה הגדרת CORS בדלי')); }; x.send(body);
    });
  }
  function uploadFile(file, extra, progress) {
    return presign(file, extra).then(function (r) {
      if (!r.multipart) return putXhr(r.url, file, file.type || 'application/octet-stream', function (l) { progress && progress(l / file.size); }).then(function () { return r; });
      var urls = r.urls.slice(), done = new Array(r.parts).fill(0), etags = [], next = 0;
      function urlFor(n) {
        if (urls[n - 1]) return Promise.resolve(urls[n - 1]);
        var fd = new FormData(); fd.append('key', r.key); fd.append('uploadId', r.uploadId); fd.append('from', n); fd.append('count', 200);
        return post('/admin/adminAjax/storage/parts', fd).then(function (x) { x.urls.forEach(function (u, i) { urls[n - 1 + i] = u; }); return urls[n - 1]; });
      }
      function worker() {
        if (next >= r.parts) return Promise.resolve();
        var n = ++next, start = (n - 1) * r.partSize, blob = file.slice(start, Math.min(file.size, start + r.partSize));
        var attempt = function (left) {
          return urlFor(n).then(function (u) { return putXhr(u, blob, null, function (l) { done[n - 1] = l; progress && progress(done.reduce(function (a, b) { return a + b; }, 0) / file.size); }); })
            .catch(function (e) { if (left > 0) return attempt(left - 1); throw e; });
        };
        return attempt(3).then(function (etag) { if (!etag) throw new Error('הדלי לא החזיר ETag – יש להגדיר CORS עם ExposeHeaders: ETag'); etags.push({ PartNumber: n, ETag: etag }); return worker(); });
      }
      return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
        var fd = new FormData(); fd.append('key', r.key); fd.append('uploadId', r.uploadId); fd.append('parts', JSON.stringify(etags));
        return post('/admin/adminAjax/storage/complete', fd).then(function (x) { if (x.status !== 'success') throw new Error(x.message); return r; });
      }).catch(function (e) { var fd = new FormData(); fd.append('key', r.key); fd.append('uploadId', r.uploadId); post('/admin/adminAjax/storage/abort', fd); throw e; });
    });
  }
  function uploadImage(el) {
    var file = el.files[0]; if (!file) return; var input = el.closest('.mb-3').querySelector('input[name="' + el.dataset.uploadTo + '"]');
    el.setAttribute('data-uploading', '1'); toast('מעלה תמונה...', true);
    uploadFile(file, { folder: el.dataset.folder }).then(function (r) { input.value = r.publicUrl || '/' + r.key; toast('התמונה הועלתה. לחצו "שמירה".', true); })
      .catch(function (e) { toast(e.message, false); }).then(function () { el.removeAttribute('data-uploading'); el.value = ''; });
  }
  function uploadGallery(el) {
    var key = el.dataset.uploadGallery, tpl = $('template[data-tpl="' + key + '"]'), box = $('[data-rows="' + key + '"]'), field = el.dataset.galleryField || 'img_url';
    var files = Array.prototype.slice.call(el.files); el.setAttribute('data-uploading', '1'); var n = 0;
    files.reduce(function (p, file) { return p.then(function () { return uploadFile(file, { folder: el.dataset.folder }).then(function (r) { box.insertAdjacentHTML('beforeend', tpl.innerHTML); var rows = $$('[data-row]', box), last = rows[rows.length - 1]; $('[name="' + field + '"]', last).value = r.publicUrl || '/' + r.key; n++; toast('הועלו ' + n + '/' + files.length, true); }); }); }, Promise.resolve())
      .then(function () { toast('ההעלאה הסתיימה. לחצו "שמירה".', true); }).catch(function (e) { toast(e.message, false); }).then(function () { el.removeAttribute('data-uploading'); el.value = ''; });
  }
  function uploadDigital(el) {
    var file = el.files[0]; if (!file) return; var bx = el.closest('[data-file-box]'), bar = $('.progress', bx), pb = $('.progress-bar', bx);
    bar.classList.remove('d-none'); el.setAttribute('data-uploading', '1');
    uploadFile(file, { kind: el.dataset.bucketUpload === 'sampleFile' ? 'sample' : 'digital', product: el.dataset.product }, function (p) { var v = Math.min(100, Math.round(p * 100)); pb.style.width = v + '%'; pb.textContent = v + '%'; })
      .then(function (r) { $('input[type=hidden]', bx).value = r.key; $('.adm-file-state', bx).innerHTML = '<span class="badge text-bg-success">הועלה</span> <code dir="ltr">' + esc(r.key) + '</code>'; pb.style.width = '100%'; pb.textContent = '100%'; toast('הקובץ הועלה. לחצו "שמירה".', true); })
      .catch(function (e) { toast(e.message, false); pb.classList.add('bg-danger'); }).then(function () { el.removeAttribute('data-uploading'); el.value = ''; });
  }

  // studio: media deliverable → bucket (studio/{project}/...) → new immutable asset version
  function uploadStudio(el) {
    var file = el.files[0]; if (!file) return; var bx = el.closest('[data-studio-box]'), bar = $('.progress', bx), pb = $('.progress-bar', bx);
    var engine = $('[name=engine]', bx).value; if (!engine) { toast('יש לבחור מנוע מאושר', false); el.value = ''; return; }
    bar.classList.remove('d-none'); el.setAttribute('data-uploading', '1');
    uploadFile(file, { kind: 'studio', project: el.dataset.project }, function (p) { var v = Math.min(100, Math.round(p * 100)); pb.style.width = v + '%'; pb.textContent = v + '%'; })
      .then(function (r) {
        var fd = new FormData(); fd.append('output', el.dataset.studioUpload); fd.append('key', r.key); fd.append('name', file.name); fd.append('mime', file.type || ''); fd.append('size', file.size);
        fd.append('engine', engine); fd.append('cost', $('[name=cost]', bx).value || '0'); fd.append('settings', $('[name=settings]', bx).value || '');
        return post('/admin/adminAjax/studio/add_media/' + el.dataset.task, fd).then(handle);
      })
      .catch(function (e) { toast(e.message, false); pb.classList.add('bg-danger'); }).then(function () { el.removeAttribute('data-uploading'); el.value = ''; });
  }

  // drag & drop ordering for [data-sortable] tbodies
  function sortable(tb) {
    var drag = null;
    $$('tr', tb).forEach(function (r) { r.draggable = true; });
    tb.addEventListener('dragstart', function (e) { drag = e.target.closest('tr'); e.dataTransfer.effectAllowed = 'move'; drag.classList.add('dragging'); });
    tb.addEventListener('dragend', function () { if (drag) drag.classList.remove('dragging'); drag = null; });
    tb.addEventListener('dragover', function (e) { e.preventDefault(); var over = e.target.closest('tr'); if (!drag || !over || over === drag) return; var r = over.getBoundingClientRect(); tb.insertBefore(drag, e.clientY > r.top + r.height / 2 ? over.nextSibling : over); });
  }
  document.addEventListener('DOMContentLoaded', function () { $$('[data-sortable]').forEach(sortable); openHashTab(); });
  if (document.readyState !== 'loading') { $$('[data-sortable]').forEach(sortable); setTimeout(openHashTab, 50); }
})();
