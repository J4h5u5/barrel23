/* ============================================================
   BARREL 23 — site logic (API-backed)
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return (t == null ? "" : String(t)).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); };

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
    }).join("");
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function init(C) {
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
    $('#an-kicker').textContent = a.kicker;
    $('#an-title').innerHTML = '<em>' + esc(a.eventName) + '</em>';
    $('#an-blurb').textContent = a.blurb;
    var btn = $('#an-ticket');
    btn.childNodes[0].nodeValue = a.ticketLabel + " ";
    btn.href = a.ticketUrl;
    $('#an-facts').innerHTML = [['DATE', a.date], ['DOORS', a.doors], ['CITY', a.city], ['VENUE', a.venue]].map(function (f) {
      return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + '</div></div>';
    }).join("");

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
      return '<div class="carousel__slide' + (i === 0 ? ' is-on' : '') + '" style="background-image:url(' + src + ')"></div>';
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

    /* ===== PAST EVENTS ===== */
    $('#ev-count').textContent = '[ ' + pad(C.pastEvents.length) + ' ARCHIVED ]';
    $('#events').innerHTML = C.pastEvents.map(function (e) {
      var lu = (e.lineup || []).map(function (n) { return '<b>' + esc(n) + '</b>'; }).join("");
      return '<article class="event-card reveal">' +
        '<div class="event-card__img" style="background-image:url(' + esc(e.image) + ')"></div>' +
        '<div class="event-card__body">' +
          '<div class="event-card__date">' + esc(e.date) + ' — ' + esc(e.city || '') + '</div>' +
          '<h3 class="event-card__name">' + esc(e.name) + ' <span>// ' + esc(e.date.slice(0, 5)) + '</span></h3>' +
          '<div class="lineup">' + lu + '</div>' +
        '</div></article>';
    }).join("");

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
    function parallax() {
      if (rmOn) return;
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

    /* ===== REDUCE MOTION ===== */
    var rmBtn = $('#rm-toggle');
    function setRM(on, persist) {
      rmOn = on;
      document.body.classList.toggle('reduce-motion', on);
      rmBtn.innerHTML = 'MOTION <b>' + (on ? 'OFF' : 'ON') + '</b>';
      if (on) { pEls.forEach(function (el) { el.style.transform = ''; }); } else { parallax(); }
      if (persist) localStorage.setItem('barrel23_rm', on ? '1' : '0');
    }
    var rmStored = localStorage.getItem('barrel23_rm');
    setRM(rmStored === '1' || (rmStored === null && window.matchMedia('(prefers-reduced-motion: reduce)').matches), false);
    rmBtn.addEventListener('click', function () { setRM(!rmOn, true); });

    /* ===== MEDIA PLAYER ===== */
    var sets = C.sets || [];
    var P = { i: parseInt(localStorage.getItem('barrel23_track') || '0') || 0, t: parseFloat(localStorage.getItem('barrel23_pos') || '0') || 0, playing: false, raf: 0, last: 0 };
    if (P.i >= sets.length) P.i = 0;

    var playerEl = $('#player');
    var elTitle = $('#pl-title'), elSub = $('#pl-sub'), elCur = $('#pl-cur'), elEnd = $('#pl-end');
    var seek = $('#seek'), fill = $('#seek-fill'), head = $('#seek-head'), playBtn = $('#pl-play');
    var iconPlay = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
    var iconPause = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';

    function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
    function curSet() { return sets[P.i]; }

    function renderProgress() {
      var st = curSet(); if (!st) return;
      var p = Math.min(1, P.t / st.duration);
      fill.style.width = (p * 100) + '%';
      head.style.left = (p * 100) + '%';
      elCur.textContent = fmt(P.t);
    }

    function renderList() {
      var tl = $('#tracklist');
      tl.innerHTML = '<h4>SETS — ARCHIVE</h4>' + sets.map(function (st, i) {
        return '<div class="tracklist__item' + (i === P.i ? ' active' : '') + '" data-i="' + i + '">' +
          '<span class="ti-i">' + pad(i + 1) + '</span>' +
          '<div class="ti-t">' + esc(st.title) + '<div class="ti-sub">' + esc(st.dj) + ' · ' + esc(st.event) + '</div></div>' +
          '<span class="ti-d">' + fmt(st.duration) + '</span></div>';
      }).join("");
      $$('.tracklist__item', tl).forEach(function (it) {
        it.addEventListener('click', function () { load(+it.dataset.i, true); tl.classList.remove('open'); });
      });
    }

    function renderMeta() {
      var st = curSet(); if (!st) return;
      elTitle.textContent = st.title;
      elSub.textContent = st.dj + ' · ' + st.event;
      elEnd.textContent = fmt(st.duration);
      renderProgress(); renderList();
    }

    function save() { localStorage.setItem('barrel23_track', P.i); localStorage.setItem('barrel23_pos', P.t.toFixed(1)); }

    function setPlaying(on) {
      P.playing = on;
      playerEl.classList.toggle('playing', on);
      playBtn.innerHTML = on ? iconPause : iconPlay;

      if (on && curSet() && curSet().audioUrl) {
        // Real audio
        var audio = playerEl._audio;
        if (!audio) { audio = new Audio(); playerEl._audio = audio; }
        if (audio.src !== location.origin + curSet().audioUrl) {
          audio.src = curSet().audioUrl;
          audio.currentTime = P.t;
        }
        audio.play().catch(function () {});
        audio.ontimeupdate = function () { P.t = audio.currentTime; renderProgress(); save(); };
        audio.onended = function () { load(P.i + 1, true); };
        cancelAnimationFrame(P.raf);
      } else if (on) {
        // Simulated playback
        P.last = performance.now();
        (function loop() {
          P.raf = requestAnimationFrame(function (now) {
            var dt = (now - P.last) / 1000; P.last = now;
            P.t += dt;
            var st = curSet();
            if (P.t >= st.duration) { P.t = 0; load(P.i + 1, true); return; }
            renderProgress();
            if (Math.floor(P.t) % 2 === 0) save();
            loop();
          });
        })();
      } else {
        cancelAnimationFrame(P.raf);
        if (playerEl._audio) playerEl._audio.pause();
        save();
      }
    }

    function load(i, autoplay) {
      P.i = (i + sets.length) % sets.length; P.t = 0;
      if (playerEl._audio) { playerEl._audio.pause(); playerEl._audio.src = ''; }
      renderMeta(); save();
      if (autoplay) setPlaying(true); else renderProgress();
    }

    playBtn.addEventListener('click', function () { setPlaying(!P.playing); });
    $('#pl-next').addEventListener('click', function () { P.t > 3 ? (P.t = 0, renderProgress(), save()) : load(P.i - 1, P.playing); });
    $('#pl-prev').addEventListener('click', function () { load(P.i + 1, P.playing); });

    function seekTo(e) {
      var r = seek.getBoundingClientRect();
      var x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width;
      P.t = Math.max(0, Math.min(1, x)) * curSet().duration;
      if (playerEl._audio) playerEl._audio.currentTime = P.t;
      renderProgress(); save();
    }
    var seeking = false;
    seek.addEventListener('mousedown', function (e) { seeking = true; seekTo(e); });
    window.addEventListener('mousemove', function (e) { if (seeking) seekTo(e); });
    window.addEventListener('mouseup', function () { seeking = false; });
    seek.addEventListener('touchstart', function (e) { seekTo(e); }, { passive: true });
    seek.addEventListener('touchmove', function (e) { seekTo(e); }, { passive: true });

    var listBtn = $('#pl-list'), tl = $('#tracklist');
    listBtn.addEventListener('click', function (e) { e.stopPropagation(); tl.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (!tl.contains(e.target) && e.target !== listBtn) tl.classList.remove('open'); });

    if (sets.length) renderMeta();
  }

  /* ===== Bootstrap: fetch content from API ===== */
  fetch('/api/content')
    .then(function (r) { return r.json(); })
    .then(function (C) { init(C); })
    .catch(function (err) {
      console.error('Failed to load content from API:', err);
      // Show minimal error state
      document.body.innerHTML = '<div style="color:#fff;font-family:monospace;padding:2rem">Failed to load content. Make sure the API server is running.</div>';
    });
})();
