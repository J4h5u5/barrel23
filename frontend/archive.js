/* ============================================================
   BARREL 23 — ARCHIVE PAGE — all past events grid
   ============================================================ */
(function () {
  var $ = B23.$, $$ = B23.$$, esc = B23.esc, pad = B23.pad, socialLinks = B23.socialLinks, parseDate = B23.parseDate;

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
