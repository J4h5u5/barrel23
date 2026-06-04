/* ============================================================
   BARREL 23 — EVENT PAGE
   Reads ?id=<slug> or ?i=<index> from URL, renders past event.
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return (t == null ? '' : String(t)).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  var ICON = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 14v4h1v-4H2zm2-1v5h1v-5H4zm2-1v6h1v-6H6zm2-2v8h1V10H8zm2-1.5V18h1V8.5h-1zM12 7v11h1V7h-1zm2.5 1c-.3 0-.6.05-.9.13V18H21a3 3 0 0 0 .2-6A4.5 4.5 0 0 0 14.5 8z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.9 11.6c-1 .4-1 1.4-.1 1.7l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.8-.5l2.4-2.4 4.9 3.6c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.2-.5-1.8-1.9-1.2z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.3 1.8 4 4 4.2V10c-1.5 0-2.9-.5-4-1.3v6.5A5.7 5.7 0 1 1 10.3 9.5v3a2.7 2.7 0 1 0 2.7 2.7V3H16z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.4-2.5.4-3.8s-.1-2.5-.4-3.8zM10 15V9l5.2 3L10 15z"/></svg>'
  };
  function socialLinks(map) {
    return Object.keys(map || {}).filter(function (k) { return ICON[k] && map[k] && map[k] !== '#'; }).map(function (k) {
      return '<a href="' + esc(map[k]) + '" target="_blank" rel="noopener" aria-label="' + k + '">' + ICON[k] + '</a>';
    }).join('');
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
