/* ============================================================
   BARREL 23 — site logic (API-backed)
   ============================================================ */
(function () {
  var $ = B23.$, $$ = B23.$$, esc = B23.esc, pad = B23.pad, socialLinks = B23.socialLinks;


  function init(C) {
    var announced = !(C.announce && C.announce.announced === false);
    /* ===== BRAND / NAV ===== */
    $$('[data-brand-name]').forEach(function (el) { el.textContent = C.brand.name; });
    $$('[data-logo]').forEach(function (el) { el.src = C.brand.logo; });
    $$('[data-wordmark]').forEach(function (el) { el.src = C.brand.wordmark || C.brand.logo; });

    var navEl = $('#nav');
    if (C.nav && C.nav.enabled) {
      navEl.classList.remove('nav--hidden');
      navEl.innerHTML = C.nav.items.map(function (i) { return '<a href="#">' + esc(i) + '</a>'; }).join("");
    }
    var fnav = $('#footer-nav');
    if (fnav) fnav.innerHTML = (C.nav.items || []).map(function (i) { return '<a href="#">' + esc(i) + '</a>'; }).join("");

    /* ===== HERO ===== */
    $('#hero-title').innerHTML = '<em>' + esc(C.hero.eventName) + '</em>';
    $('#hero-edition').textContent = C.hero.edition;
    $('#hero-location').innerHTML = '<b>' + esc(C.hero.location) + '</b>';
    $('#hero-tagline').textContent = C.hero.tagline;
    var vid = $('#hero-video');
    if (vid && C.hero.video) {
      vid.src = C.hero.video;
      vid.muted = true;
      var tryPlay = function () { var p = vid.play(); if (p && p.catch) p.catch(function () {}); };
      vid.addEventListener('loadeddata', tryPlay);
      tryPlay();
      document.addEventListener('click', tryPlay, { once: true });
    }

    /* ===== HERO DATE / COUNTDOWN vs TBA ===== */
    var heroDate = $('#hero-date');
    var cdEl = $('#countdown'), sigEl = $('#hero-signal');
    if (announced) {
      if (heroDate) { heroDate.textContent = C.announce.date || heroDate.textContent; heroDate.hidden = false; }
      if (sigEl) sigEl.hidden = true;
      if (cdEl) cdEl.hidden = false;
    } else {
      if (heroDate) heroDate.hidden = true;
      if (cdEl) cdEl.hidden = true;
      if (sigEl) {
        sigEl.hidden = false;
        var sl = $('#hero-signal-label'), ss = $('#hero-signal-status');
        if (sl) sl.textContent = C.announce.kicker || 'NEXT TRANSMISSION';
        if (ss) ss.textContent = C.hero.tbaStatus || 'DATE TO BE REVEALED';
      }
    }

    /* ===== COUNTDOWN ===== */
    var target = new Date(C.hero.targetDate).getTime();
    var units = [
      { key: 'days', el: $('#cd-days'), cls: 'flash-strong', prev: null },
      { key: 'hours', el: $('#cd-hours'), cls: 'flash-strong', prev: null },
      { key: 'minutes', el: $('#cd-minutes'), cls: 'flash-mid', prev: null },
      { key: 'seconds', el: $('#cd-seconds'), cls: 'flash-soft', prev: null }
    ];
    function flash(u) { var p = u.el; p.classList.remove(u.cls); void p.offsetWidth; p.classList.add(u.cls); }
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var vals = {
        days: Math.floor(diff / 864e5),
        hours: Math.floor(diff % 864e5 / 36e5),
        minutes: Math.floor(diff % 36e5 / 6e4),
        seconds: Math.floor(diff % 6e4 / 1e3)
      };
      units.forEach(function (u) {
        var nv = vals[u.key];
        var numEl = u.el.querySelector('.cd-num');
        if (u.prev === null) { numEl.textContent = pad(nv); u.prev = nv; return; }
        if (nv !== u.prev) { numEl.textContent = pad(nv); flash(u); u.prev = nv; }
      });
    }
    tick(); setInterval(tick, 250);

    /* ===== ANNOUNCE ===== */
    var a = C.announce;
    var anLive = $('#an-live'), anTba = $('#an-tba');
    $('#an-kicker').textContent = a.kicker;
    $('#an-title').innerHTML = '<em>' + esc(announced ? a.eventName : (a.tba && a.tba.headline ? a.tba.headline : 'TBA')) + '</em>';

    if (announced) {
      if (anLive) anLive.hidden = false;
      if (anTba) anTba.hidden = true;
      $('#an-blurb').textContent = a.blurb;
      var btn = $('#an-ticket');
      btn.childNodes[0].nodeValue = a.ticketLabel + " ";
      btn.href = a.ticketUrl;
      $('#an-facts').innerHTML = [['DATE', a.date], ['DOORS', a.doors], ['CITY', a.city], ['VENUE', a.venue]].map(function (f) {
        return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + '</div></div>';
      }).join("");
    } else {
      if (anLive) anLive.hidden = true;
      if (anTba) anTba.hidden = false;
      var t = a.tba || {};
      var anTbaStatus = $('#an-tba-status'); if (anTbaStatus) anTbaStatus.textContent = t.status || 'TO BE ANNOUNCED';
      var anTbaBlurb = $('#an-tba-blurb'); if (anTbaBlurb) anTbaBlurb.textContent = t.blurb || '';
      var anTbaCta = $('#an-tba-cta');
      if (anTbaCta) { anTbaCta.childNodes[0].nodeValue = (t.ctaLabel || 'GET THE DROP') + ' '; anTbaCta.href = t.ctaUrl || '#'; }
    }

    var anLineup = (a.lineup || []).map(function (act) {
      return typeof act === 'string' ? { name: act, tag: '' } : (act || {});
    }).filter(function (act) { return (act.name || '').trim(); });
    var anLabel = $('#an-lineup-label');
    if (anLabel) anLabel.textContent = a.lineupLabel || 'LINE-UP';
    var anLineEl = $('#an-lineup'), anLineWrap = $('#an-lineup-wrap');
    if (anLineWrap) anLineWrap.style.display = anLineup.length ? '' : 'none';
    if (anLineEl) {
      anLineEl.innerHTML = anLineup.map(function (act, i) {
        var tag = (act.tag || '').trim();
        var head = /HEAD/i.test(tag);
        return '<li class="ln-act' + (head ? ' ln-act--head' : '') + '">' +
          '<span class="ln-lead"><span class="ln-no">' + pad(i + 1) + '</span>' +
          '<span class="ln-name">' + esc(act.name) + '</span></span>' +
          (tag ? '<span class="ln-tag">' + esc(tag) + '</span>' : '') + '</li>';
      }).join("");
    }

    /* carousel */
    var track = $('#carousel-track'), dots = $('#carousel-dots');
    var imgs = a.images || [];
    track.innerHTML = imgs.map(function (src, i) {
      var style = i === 0 ? ' style="background-image:url(' + src + ')"' : '';
      return '<div class="carousel__slide' + (i === 0 ? ' is-on' : '') + '" data-bg="' + src + '"' + style + '></div>';
    }).join("");
    dots.innerHTML = imgs.map(function (_, i) { return '<i data-i="' + i + '" class="' + (i === 0 ? 'on' : '') + '"></i>'; }).join("");
    var slides = $$('.carousel__slide', track), dotEls = $$('i', dots), ci = 0, ctimer;
    function goSlide(n) {
      ci = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('is-on', i === ci); });
      dotEls.forEach(function (d, i) { d.classList.toggle('on', i === ci); });
    }
    dotEls.forEach(function (d) { d.addEventListener('click', function () { clearInterval(ctimer); goSlide(+d.dataset.i); ctimer = setInterval(function () { goSlide(ci + 1); }, 4200); }); });
    if (slides.length > 1) ctimer = setInterval(function () { goSlide(ci + 1); }, 4200);

    /* ===== PAST EVENTS (show last 5, link to event page) ===== */
    var ARCHIVE_LIMIT = 5;
    function parseDate(s) { var p = (s || '').split('.'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(0); }
    var allEvents = (C.pastEvents || []).slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); });
    var shownEvents = allEvents.slice(0, ARCHIVE_LIMIT);
    $('#ev-count').textContent = '[ ' + pad(allEvents.length) + ' ARCHIVED ]';
    function eventUrl(e, idx) {
      return 'event.html?' + (e.id ? 'id=' + encodeURIComponent(e.id) : 'i=' + idx);
    }
    $('#events').innerHTML = shownEvents.map(function (e, idx) {
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
    }).join('') +
    (allEvents.length > ARCHIVE_LIMIT
      ? '<div class="archive-more reveal"><a class="btn btn--ghost" href="archive.html">SEE ALL ' + allEvents.length + ' EVENTS </a></div>'
      : '');

    /* ===== DJs ===== */
    $('#djs').innerHTML = C.djs.map(function (dj) {
      return '<article class="dj reveal">' +
        '<img src="' + esc(dj.image) + '" alt="' + esc(dj.name) + '" loading="lazy">' +
        '<div class="dj__scrim"></div>' +
        '<div class="dj__info">' +
          '<div class="dj__role">' + esc(dj.role || 'ARTIST') + '</div>' +
          '<div class="dj__name">' + esc(dj.name) + '</div>' +
          '<div class="dj__socials">' + socialLinks(dj.socials || {}) + '</div>' +
        '</div></article>';
    }).join("");

    /* ===== ABOUT ===== */
    $('#ab-kicker').textContent = C.about.kicker;
    $('#ab-statement').innerHTML = esc(C.about.statement).replace(/UNDERGROUND/, '<em>UNDERGROUND</em>').replace(/EMIRATES/, '<em>EMIRATES</em>');
    $('#ab-paras').innerHTML = C.about.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join("");
    $('#ab-styles').innerHTML = C.about.styles.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join("");
    $('#sound-head').textContent = C.about.equipment.heading;
    $('#sound-body').textContent = C.about.equipment.body;
    $('#contact-email').textContent = C.contacts.email;
    $('#contact-email').href = 'mailto:' + C.contacts.email;
    $('#contact-bookings').textContent = C.contacts.bookings;
    $('#contact-bookings').href = 'mailto:' + C.contacts.bookings;

    /* ===== FOOTER ===== */
    $('#footer-socials').innerHTML = socialLinks(C.socials);
    $('#footer-year').textContent = new Date().getFullYear();

    /* ===== TOPBAR scroll ===== */
    var topbar = $('#topbar');
    function onScroll() { topbar.classList.toggle('scrolled', window.scrollY > 40); }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    /* ===== PARALLAX ===== */
    var pEls = $$('[data-parallax]'), rmOn = false;
    var isMobile = window.matchMedia('(max-width: 900px)').matches;
    function parallax() {
      if (rmOn || isMobile) return;
      var y = window.scrollY;
      pEls.forEach(function (el) { el.style.transform = 'translate3d(0,' + (y * parseFloat(el.dataset.parallax)) + 'px,0)'; });
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(parallax); }, { passive: true });
    parallax();

    /* ===== REVEAL ===== */
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$('.reveal').forEach(function (el) { io.observe(el); });

    var bgIo = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.style.backgroundImage = 'url(' + e.target.dataset.bg + ')';
          bgIo.unobserve(e.target);
        }
      });
    }, { rootMargin: '200px' });
    $$('[data-bg]').forEach(function (el) { if (!el.style.backgroundImage) bgIo.observe(el); });

    /* ===== REDUCE MOTION ===== */
    var rmBtn = $('#rm-toggle');
    function setRM(on, persist) {
      rmOn = on;
      document.body.classList.toggle('reduce-motion', on);
      rmBtn.innerHTML = 'MOTION <b>' + (on ? 'OFF' : 'ON') + '</b>';
      if (on) { pEls.forEach(function (el) { el.style.transform = ''; }); } else { parallax(); }
      if (persist) localStorage.setItem('barrel23_rm', on ? '1' : '0');
    }
    setRM(false, false);
    rmBtn.addEventListener('click', function () { setRM(!rmOn, true); });

    /* ===== MEDIA PLAYER — handled by player.js (loaded separately) ===== */
  }

  /* ===== Bootstrap: fetch content from API ===== */
  fetch('/api/content')
    .then(function (r) { return r.json(); })
    .then(function (C) { window.__B23_CONTENT = C; init(C); document.body.classList.add('ready'); })
    .catch(function (err) {
      console.error('Failed to load content from API:', err);
      document.body.innerHTML = '<div style="color:#fff;font-family:monospace;padding:2rem">Failed to load content. Make sure the API server is running.</div>';
      document.body.classList.add('ready');
    });
})();
