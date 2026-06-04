/* ============================================================
   BARREL 23 — Persistent player
   Included on all pages. Fetches sets from API, restores state
   from localStorage, auto-resumes if was playing before navigation.
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) { return (t == null ? '' : String(t)).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var playerEl = $('#player');
  if (!playerEl) return; // no player on this page

  var elTitle = $('#pl-title'), elSub = $('#pl-sub'), elCur = $('#pl-cur'), elEnd = $('#pl-end');
  var seek = $('#seek'), fill = $('#seek-fill'), head = $('#seek-head'), playBtn = $('#pl-play');
  var iconPlay = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
  var iconPause = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';

  var LS = {
    get: function (k, def) { var v = localStorage.getItem('barrel23_' + k); return v !== null ? v : def; },
    set: function (k, v) { localStorage.setItem('barrel23_' + k, v); }
  };

  var sets = [];
  var P = {
    i: parseInt(LS.get('track', '0')) || 0,
    t: parseFloat(LS.get('pos', '0')) || 0,
    playing: LS.get('playing', '0') === '1',
    raf: 0, last: 0
  };

  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function curSet() { return sets[P.i]; }
  function save() { LS.set('track', P.i); LS.set('pos', P.t.toFixed(1)); LS.set('playing', P.playing ? '1' : '0'); }

  function renderProgress() {
    var st = curSet(); if (!st) return;
    var p = Math.min(1, P.t / (st.duration || 1));
    fill.style.width = (p * 100) + '%';
    head.style.left = (p * 100) + '%';
    elCur.textContent = fmt(P.t);
  }

  function renderList() {
    var tl = $('#tracklist'); if (!tl) return;
    tl.innerHTML = '<h4>SETS — ARCHIVE</h4>' + sets.map(function (st, i) {
      return '<div class="tracklist__item' + (i === P.i ? ' active' : '') + '" data-i="' + i + '">' +
        '<span class="ti-i">' + pad(i + 1) + '</span>' +
        '<div class="ti-t">' + esc(st.title) + '<div class="ti-sub">' + esc(st.dj) + ' · ' + esc(st.event) + '</div></div>' +
        '<span class="ti-d">' + fmt(st.duration) + '</span></div>';
    }).join('');
    $$('.tracklist__item', tl).forEach(function (it) {
      it.addEventListener('click', function () { load(+it.dataset.i, true); tl.classList.remove('open'); });
    });
  }

  function renderMeta() {
    var st = curSet(); if (!st) return;
    elTitle.textContent = st.title;
    elSub.textContent = st.dj + (st.event ? ' · ' + st.event : '');
    elEnd.textContent = fmt(st.duration);
    renderProgress(); renderList();
  }

  /* ===== SOUNDCLOUD ===== */
  var scWidget = null, scReady = false;

  function loadSCApi(cb) {
    if (window.SC) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://w.soundcloud.com/player/api.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function getOrCreateSCFrame(url) {
    var frame = document.getElementById('sc-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'sc-frame';
      frame.allow = 'autoplay';
      frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:none;bottom:0;left:0';
      document.body.appendChild(frame);
    }
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
      '&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false&color=%23ff2417';
    return frame;
  }

  function stopSC() {
    if (scWidget) { try { scWidget.pause(); } catch(e){} }
    scWidget = null; scReady = false;
  }

  function setLoading(on) {
    playerEl.classList.toggle('loading', on);
    if (on) {
      playerEl.classList.remove('playing');
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="animation:spin .8s linear infinite"><path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z"/></svg>';
    }
  }

  function playSC(url, startAt) {
    setLoading(true);
    loadSCApi(function () {
      var frame = getOrCreateSCFrame(url);
      scReady = false;
      scWidget = window.SC.Widget(frame);
      scWidget.bind(window.SC.Widget.Events.READY, function () {
        scReady = true;
        scWidget.getDuration(function (ms) {
          if (ms) { curSet().duration = Math.round(ms / 1000); renderMeta(); }
        });
        if (startAt > 0) scWidget.seekTo(startAt * 1000);
        scWidget.play();
      });
      scWidget.bind(window.SC.Widget.Events.PLAY, function () {
        setLoading(false);
        playerEl.classList.add('playing');
        playBtn.innerHTML = iconPause;
      });
      scWidget.bind(window.SC.Widget.Events.PLAY_PROGRESS, function (data) {
        P.t = data.currentPosition / 1000;
        renderProgress(); save();
      });
      scWidget.bind(window.SC.Widget.Events.PAUSE, function () {
        if (P.playing) { P.playing = false; playerEl.classList.remove('playing'); playBtn.innerHTML = iconPlay; save(); }
      });
      scWidget.bind(window.SC.Widget.Events.FINISH, function () { load(P.i + 1, true); });
    });
  }

  /* ===== PLAYBACK ===== */
  function setPlaying(on) {
    P.playing = on;
    playerEl.classList.toggle('playing', on);
    playBtn.innerHTML = on ? iconPause : iconPlay;
    var st = curSet(); if (!st) return;

    if (on && st.soundcloudUrl) {
      cancelAnimationFrame(P.raf);
      if (playerEl._audio) playerEl._audio.pause();
      if (scWidget && scReady) scWidget.play();
      else playSC(st.soundcloudUrl, P.t);
    } else if (on && st.audioUrl) {
      stopSC();
      var audio = playerEl._audio;
      if (!audio) { audio = new Audio(); playerEl._audio = audio; }
      if (audio.src !== location.origin + st.audioUrl) { audio.src = st.audioUrl; audio.currentTime = P.t; }
      audio.play().catch(function(){});
      audio.ontimeupdate = function () { P.t = audio.currentTime; renderProgress(); save(); };
      audio.onended = function () { load(P.i + 1, true); };
      cancelAnimationFrame(P.raf);
    } else if (on) {
      stopSC();
      P.last = performance.now();
      (function loop() {
        P.raf = requestAnimationFrame(function (now) {
          var dt = (now - P.last) / 1000; P.last = now;
          P.t += dt;
          var s = curSet();
          if (P.t >= s.duration) { P.t = 0; load(P.i + 1, true); return; }
          renderProgress();
          if (Math.floor(P.t) % 2 === 0) save();
          loop();
        });
      })();
    } else {
      cancelAnimationFrame(P.raf);
      if (playerEl._audio) playerEl._audio.pause();
      if (scWidget && scReady) scWidget.pause();
      save();
    }
  }

  function load(i, autoplay) {
    P.i = (i + sets.length) % sets.length; P.t = 0;
    if (playerEl._audio) { playerEl._audio.pause(); playerEl._audio.src = ''; }
    stopSC();
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
    if (scWidget && scReady) scWidget.seekTo(P.t * 1000);
    renderProgress(); save();
  }
  var seeking = false;
  seek.addEventListener('mousedown', function (e) { seeking = true; seekTo(e); });
  window.addEventListener('mousemove', function (e) { if (seeking) seekTo(e); });
  window.addEventListener('mouseup', function () { seeking = false; });
  seek.addEventListener('touchstart', function (e) { seekTo(e); }, { passive: true });
  seek.addEventListener('touchmove', function (e) { seekTo(e); }, { passive: true });

  var listBtn = $('#pl-list'), tl = $('#tracklist');
  if (listBtn) listBtn.addEventListener('click', function (e) { e.stopPropagation(); tl.classList.toggle('open'); });
  document.addEventListener('click', function (e) { if (tl && !tl.contains(e.target) && e.target !== listBtn) tl.classList.remove('open'); });

  /* ===== INIT: fetch sets, restore state, auto-resume ===== */
  fetch('/api/content')
    .then(function (r) { return r.json(); })
    .then(function (C) {
      sets = C.sets || [];
      if (!sets.length) { playerEl.classList.add('hidden'); return; }
      if (P.i >= sets.length) P.i = 0;
      renderMeta();
      playerEl.classList.remove('hidden');

      /* auto-resume if was playing before navigation */
      if (P.playing && P.t > 0) {
        setTimeout(function () { setPlaying(true); }, 300);
      }
    });
})();
