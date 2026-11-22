/* GreenShow banner: a click plays the teaser film in a lightbox */
(function () {
  const SITE = 'https://preview.greenshow.co.il/';
  const box = document.createElement('div');
  box.className = 'gs-teaser';
  box.hidden = true;
  box.innerHTML = `
    <div class="gs-teaser-dialog" role="dialog" aria-modal="true" aria-label="GreenShow – הצצה ראשונה">
      <button type="button" class="gs-teaser-close" aria-label="סגירה"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="gs-teaser-frame">
        <video id="gsTeaserVideo" src="./assets/videos/greenshow-teaser.mp4" poster="./assets/images/greenshow-teaser-poster.jpg" playsinline controls preload="metadata"></video>
      </div>
      <div class="gs-teaser-foot">
        <p><strong>GreenShow</strong> מבית גרינטק – יש למה לצפות.</p>
        <a class="gs-teaser-go" href="${SITE}">כניסה ל־GreenShow ‹</a>
      </div>
    </div>`;
  document.body.appendChild(box);
  const video = box.querySelector('video');
  let last = null;
  function open(trigger) {
    last = trigger;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
    document.documentElement.style.overflow = 'hidden';
    try { video.currentTime = 0; const p = video.play(); if (p) p.catch(() => {}); } catch (e) {}
    box.querySelector('.gs-teaser-close').focus();
  }
  function close() {
    box.classList.remove('show');
    try { video.pause(); } catch (e) {}
    document.documentElement.style.overflow = '';
    setTimeout(() => { box.hidden = true; }, 220);
    if (last) last.focus();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('a[href="#greenshow"]');
    if (t) { e.preventDefault(); open(t); }
  });
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.gs-teaser-close')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
  video.addEventListener('ended', () => box.classList.add('ended'));
  video.addEventListener('play', () => box.classList.remove('ended'));
})();
