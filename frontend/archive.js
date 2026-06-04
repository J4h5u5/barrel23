/* ============================================================
   BARREL 23 — ARCHIVE PAGE — all past events grid
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return (t == null ? '' : String(t)).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var ICON = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 14v4h1v-4H2zm2-1v5h1v-5H4zm2-1v6h1v-6H6zm2-2v8h1V10H8zm2-1.5V18h1V8.5h-1zM12 7v11h1V7h-1zm2.5 1c-.3 0-.6.05-.9.13V18H21a3 3 0 0 0 .2-6A4.5 4.5 0 0 0 14.5 8z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.9 11.6c-1 .4-1 1.4-.1 1.7l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.8-.5l2.4-2.4 4.9 3.6c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.2-.5-1.8-1.9-1.2z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.3 1.8 4 4 4.2V10c-1.5 0-2.9-.5-4-1.3v6.5A5.7 5.7 0 1 1 10.3 9.5v3a2.7 2.7 0 1 0 2.7 2.7V3H16z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.4-2.5.4-3.8s-.1-2.5-.4-3.8zM10 15V9l5.2 3L10 15z"/></svg>'
  };
  function socialLinks(map) {
    return Object.keys(map || {}).filter(function (k) { return ICON[k] && map[k]; }).map(function (k) {
      return '<a href="' + esc(map[k]) + '" target="_blank" rel="noopener" aria-label="' + k + '">' + ICON[k] + '</a>';
    }).join('');
  }

  function eventUrl(ev, idx) {
    return 'event.html?' + (ev.id ? 'id=' + encodeURIComponent(ev.id) : 'i=' + idx);
  }

  fetch('/api/content')
    .then(function (r) { return r.json(); })
    .then(function (C) {
      $$('[data-logo]').forEach(function (el) { el.src = C.brand.logo; });
      $$('[data-wordmark]').forEach(function (el) { el.src = C.brand.wordmark || C.brand.logo; });
      var fsoc = $('#footer-socials'); if (fsoc) fsoc.innerHTML = socialLinks(C.socials);
      var fnav = $('#footer-nav');
      if (fnav) fnav.innerHTML = (C.nav.items || []).map(function (i) { return '<a href="/">' + esc(i) + '</a>'; }).join('');
      var fy = $('#footer-year'); if (fy) fy.textContent = new Date().getFullYear();

      var topbar = $('#topbar');
      window.addEventListener('scroll', function () { topbar.classList.toggle('scrolled', window.scrollY > 40); }, { passive: true });

      function parseDate(s) { var p = (s || '').split('.'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(0); }
      var events = (C.pastEvents || []).slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); });
      $('#ev-count').textContent = '[ ' + pad(events.length) + ' ARCHIVED ]';

      $('#events').innerHTML = events.map(function (e, idx) {
        var lu = (e.lineup || []).map(function (n) {
          var name = typeof n === 'string' ? n : (n.name || '');
          return '<b>' + esc(name) + '</b>';
        }).join('');
        var url = eventUrl(e, idx);
        return '<article class="event-card reveal">' +
          '<a class="event-card__link" href="' + url + '" aria-label="' + esc(e.name) + '"></a>' +
          '<div class="event-card__img" data-bg="' + esc(e.image) + '"></div>' +
          '<div class="event-card__body">' +
            '<div class="event-card__date">' + esc(e.date) + (e.city ? ' — ' + esc(e.city) : '') + '</div>' +
            '<h3 class="event-card__name">' + esc(e.name) + ' <span>// ' + esc((e.date || '').slice(0, 5)) + '</span></h3>' +
            '<div class="lineup">' + lu + '</div>' +
          '</div></article>';
      }).join('');

      /* lazy images */
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            if (el.dataset.bg) { el.style.backgroundImage = 'url(' + el.dataset.bg + ')'; delete el.dataset.bg; }
            el.classList.add('in');
            io.unobserve(el);
          }
        });
      }, { rootMargin: '200px' });
      $$('.event-card').forEach(function (el) { io.observe(el); });
      $$('[data-bg]').forEach(function (el) { io.observe(el); });
      document.body.classList.add('ready');
    });
})();
