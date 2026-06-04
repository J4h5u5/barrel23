/* ============================================================
   BARREL 23 — EVENT PAGE
   Reads ?id=<slug> or ?i=<index> from URL, renders past event.
   ============================================================ */
(function () {
  var $ = B23.$, $$ = B23.$$, esc = B23.esc, pad = B23.pad, socialLinks = B23.socialLinks;
  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  fetch('/api/content')
    .then(function (r) { return r.json(); })
    .then(function (C) {
      /* brand */
      $$('[data-logo]').forEach(function (el) { el.src = C.brand.logo; });
      $$('[data-wordmark]').forEach(function (el) { el.src = C.brand.wordmark || C.brand.logo; });

      /* footer */
      var fsoc = $('#footer-socials'); if (fsoc) fsoc.innerHTML = socialLinks(C.socials);
      var fnav = $('#footer-nav');
      if (fnav) fnav.innerHTML = (C.nav.items || []).map(function (i) { return '<a href="/">' + esc(i) + '</a>'; }).join('');
      var fy = $('#footer-year'); if (fy) fy.textContent = new Date().getFullYear();

      /* resolve event */
      var events = C.pastEvents || [];
      var id = getParam('id');
      var ev = null;
      if (id) ev = events.filter(function (e) { return e.id === id; })[0];
      if (!ev) {
        var idx = parseInt(getParam('i'), 10);
        if (!isNaN(idx) && events[idx]) ev = events[idx];
      }

      if (!ev) {
        $('#ev-main').hidden = true;
        $('#ev-404').hidden = false;
        return;
      }

      document.title = 'BARREL 23 — ' + ev.name + ' · ' + ev.date;

      /* title */
      $('#ev-name').innerHTML = '<em>' + esc(ev.name) + '</em>';
      $('#ev-date').textContent = ev.date;
      $('#ev-meta').innerHTML =
        '<b>' + esc(ev.city || 'DUBAI') + '</b>' +
        '<span class="dot"></span><span>' + esc(ev.date) + '</span>' +
        (ev.venue ? '<span class="dot"></span><span>' + esc(ev.venue) + '</span>' : '');

      /* lead */
      if (ev.image) $('#ev-lead-img').firstElementChild.style.backgroundImage = 'url(' + esc(ev.image) + ')';
      $('#ev-lead-tag').textContent = ev.name + (ev.city ? ' — ' + ev.city : '');
      $('#ev-desc').textContent = ev.description || '';

      var facts = [
        ['DATE', ev.date],
        ['CITY', ev.city || 'DUBAI'],
        ['DOORS', ev.doors || '—'],
        ['VENUE', ev.venue || '—']
      ];
      $('#ev-facts').innerHTML = facts.map(function (f) {
        return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + '</div></div>';
      }).join('');

      var styles = (C.about && C.about.styles) ? C.about.styles.slice(0, 4) : ['HARD TECHNO', 'SCHRANZ'];
      $('#ev-styles').innerHTML = styles.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('');

      /* lineup — match against djs roster for photos/socials */
      function findDJ(name) {
        var key = String(name || '').trim().toLowerCase();
        return (C.djs || []).filter(function (d) { return (d.name || '').toLowerCase() === key; })[0];
      }
      var lineup = ev.lineup || [];
      var lineupSec = $('#ev-lineup-sec');
      if (!lineup.length) { lineupSec.hidden = true; }
      else {
        $('#ev-dj-count').textContent = '[ ' + pad(lineup.length) + ' ARTISTS ]';
        $('#ev-djs').innerHTML = lineup.map(function (entry) {
          var name = typeof entry === 'string' ? entry : (entry.name || '');
          var dj = findDJ(name) || {};
          var img = dj.image || ev.image || '';
          var role = dj.role || (typeof entry === 'object' && entry.role) || 'GUEST';
          var socials = dj.socials || (typeof entry === 'object' && entry.socials) || {};
          var links = socialLinks(socials);
          return '<article class="ev-dj">' +
            (img ? '<div class="ev-dj__img"><div style="background-image:url(' + esc(img) + ')"></div></div>' : '<div class="ev-dj__img ev-dj__img--blank"><div></div></div>') +
            '<div class="ev-dj__body">' +
              '<div class="ev-dj__role">' + esc(role) + '</div>' +
              '<div class="ev-dj__name">' + esc(name) + '</div>' +
              (links ? '<div class="ev-dj__socials">' + links + '</div>' : '') +
            '</div></article>';
        }).join('');
      }

      /* gallery */
      var gallery = ev.gallery || [];
      var galSec = $('#ev-gallery-sec');
      if (!gallery.length) { galSec.hidden = true; }
      else {
        $('#ev-shot-count').textContent = '[ ' + pad(gallery.length) + ' FRAMES ]';
        $('#ev-gallery').innerHTML = gallery.map(function (src, i) {
          return '<button class="ev-shot" data-i="' + i + '" aria-label="Open photo ' + (i + 1) + '">' +
            '<img src="' + esc(src) + '" alt="' + esc(ev.name) + ' frame ' + (i + 1) + '" loading="lazy"></button>';
        }).join('');
      }

      /* lightbox */
      var lb = $('#lightbox'), lbImg = $('#lb-img'), lbCount = $('#lb-count');
      var lbIndex = 0;
      function openLb(i) {
        lbIndex = (i + gallery.length) % gallery.length;
        lbImg.src = gallery[lbIndex];
        lbCount.innerHTML = '<b>' + pad(lbIndex + 1) + '</b> / ' + pad(gallery.length);
        lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
      function closeLb() { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
      $('#ev-gallery').addEventListener('click', function (e) { var s = e.target.closest('.ev-shot'); if (s) openLb(+s.dataset.i); });
      $('#lb-close').addEventListener('click', closeLb);
      $('#lb-prev').addEventListener('click', function (e) { e.stopPropagation(); openLb(lbIndex - 1); });
      $('#lb-next').addEventListener('click', function (e) { e.stopPropagation(); openLb(lbIndex + 1); });
      lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
      document.addEventListener('keydown', function (e) {
        if (!lb.classList.contains('open')) return;
        if (e.key === 'Escape') closeLb();
        else if (e.key === 'ArrowLeft') openLb(lbIndex - 1);
        else if (e.key === 'ArrowRight') openLb(lbIndex + 1);
      });

      /* reveal on scroll */
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.08 });
      $$('.reveal').forEach(function (el) { io.observe(el); });
      document.body.classList.add('ready');
    });
})();
