/* ============================================================
   BARREL 23 — Admin panel (API-backed)
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  var TOKEN_KEY = 'barrel23_admin_token';
  var C = null;
  var dirty = false;

  /* ============================================================
     AUTH
     ============================================================ */
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    var token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, opts);
  }

  function showLogin(errorMsg) {
    document.body.innerHTML = '';
    var wrap = el('div'); wrap.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a';
    var box = el('div'); box.style.cssText = 'width:340px;background:#111;border:1px solid #222;padding:40px;font-family:var(--mono,monospace)';
    box.innerHTML = '<div style="color:#ff2417;font-size:11px;letter-spacing:3px;margin-bottom:24px">BARREL 23 / ADMIN</div>' +
      '<h2 style="color:#fff;margin:0 0 24px;font-size:20px">Sign in</h2>';
    if (errorMsg) {
      var err = el('div'); err.style.cssText = 'color:#ff2417;font-size:12px;margin-bottom:16px'; err.textContent = errorMsg;
      box.appendChild(err);
    }
    var uLabel = el('label'); uLabel.style.cssText = 'display:block;color:#888;font-size:11px;letter-spacing:2px;margin-bottom:6px'; uLabel.textContent = 'USERNAME';
    var uInput = el('input'); uInput.type = 'text'; uInput.style.cssText = 'width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #333;color:#fff;padding:10px;font-family:inherit;font-size:13px;margin-bottom:16px;outline:none';
    var pLabel = el('label'); pLabel.style.cssText = 'display:block;color:#888;font-size:11px;letter-spacing:2px;margin-bottom:6px'; pLabel.textContent = 'PASSWORD';
    var pInput = el('input'); pInput.type = 'password'; pInput.style.cssText = 'width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #333;color:#fff;padding:10px;font-family:inherit;font-size:13px;margin-bottom:24px;outline:none';
    var btn = el('button', 'btn btn--primary'); btn.textContent = 'SIGN IN'; btn.style.cssText = 'width:100%;padding:12px;font-family:inherit;font-size:12px;letter-spacing:2px;cursor:pointer';

    function doLogin() {
      btn.textContent = '…';
      var form = new URLSearchParams();
      form.append('username', uInput.value.trim());
      form.append('password', pInput.value);
      fetch('/api/auth/login', { method: 'POST', body: form })
        .then(function (r) {
          if (!r.ok) throw new Error('Invalid credentials');
          return r.json();
        })
        .then(function (data) {
          setToken(data.access_token);
          location.reload();
        })
        .catch(function (e) { showLogin(e.message || 'Login failed'); });
    }

    btn.addEventListener('click', doLogin);
    pInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    box.appendChild(uLabel); box.appendChild(uInput);
    box.appendChild(pLabel); box.appendChild(pInput);
    box.appendChild(btn);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    uInput.focus();
  }

  /* ============================================================
     API helpers
     ============================================================ */
  function loadContent() {
    return apiFetch('/api/content').then(function (r) {
      if (r.status === 401) { clearToken(); showLogin('Session expired. Please sign in again.'); throw new Error('401'); }
      return r.json();
    });
  }

  function saveContent() {
    return apiFetch('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(C)
    }).then(function (r) {
      if (r.status === 401) { clearToken(); showLogin('Session expired.'); throw new Error('401'); }
      if (!r.ok) throw new Error('Save failed');
      return r.json();
    });
  }

  function uploadFile(file, preset) {
    preset = preset || 'gallery';
    var fd = new FormData();
    fd.append('file', file);
    fd.append('preset', preset);
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
      xhr.onload = function () {
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Upload failed: ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('Upload error')); };
      xhr.send(fd);
    });
  }

  function resizeFile(fileId, preset) {
    var fd = new FormData();
    fd.append('file_id', fileId);
    fd.append('preset', preset);
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/resize');
      xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
      xhr.onload = function () {
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Resize failed: ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('Resize error')); };
      xhr.send(fd);
    });
  }

  function deleteFile(fileId) {
    return apiFetch('/api/media/files/' + fileId, { method: 'DELETE' });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ============================================================
     UI helpers
     ============================================================ */
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  var saveState = $('#savestate');
  function setDirty(d) {
    dirty = d;
    saveState.className = 'savestate ' + (d ? 'dirty' : 'saved');
    saveState.textContent = d ? '● UNSAVED CHANGES' : '✓ ALL SAVED';
  }

  function bind(input, obj, key, transform) {
    input.value = obj[key] == null ? '' : obj[key];
    input.addEventListener('input', function () {
      obj[key] = transform ? transform(input.value) : input.value;
      setDirty(true);
    });
  }

  function field(labelText, value, opts) {
    opts = opts || {};
    var f = el('div', 'field' + (opts.mono ? ' field--mono' : ''));
    f.appendChild(el('label', null, labelText));
    var input;
    if (opts.textarea) { input = el('textarea'); input.value = value || ''; if (opts.rows) input.rows = opts.rows; }
    else { input = el('input'); input.type = opts.type || 'text'; input.value = value == null ? '' : value; }
    if (opts.placeholder) input.placeholder = opts.placeholder;
    f.appendChild(input);
    if (opts.hint) f.appendChild(el('div', 'hint', opts.hint));
    f._input = input;
    return f;
  }

  /* Image/file field with preset-aware upload */
  function mediaField(labelText, value, accept, onChange, preset) {
    preset = preset || 'gallery';
    var isImage = !accept || accept.indexOf('image') !== -1;
    var f = el('div', 'field');
    f.appendChild(el('label', null, labelText));
    var wrap = el('div', 'imgpick');
    var prev = el('div', 'imgpick__prev');
    if (value) prev.style.backgroundImage = 'url(' + value + ')';
    var col = el('div', 'imgpick__col');

    var urlInput = el('input'); urlInput.type = 'text'; urlInput.value = value || '';
    urlInput.style.fontFamily = 'var(--mono)'; urlInput.style.fontSize = '13px';
    urlInput.addEventListener('input', function () {
      prev.style.backgroundImage = urlInput.value ? 'url(' + urlInput.value + ')' : 'none';
      onChange(urlInput.value); setDirty(true);
    });

    var row = el('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap';

    var uploadBtn = el('button', 'btn btn--sm'); uploadBtn.textContent = 'UPLOAD';
    var fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = accept || 'image/*'; fileInput.hidden = true;

    // Preset selector (only for images)
    var presetSel = null;
    if (isImage) {
      presetSel = el('select'); presetSel.style.cssText = 'background:#111;color:#888;border:1px solid #333;padding:4px 8px;font-family:var(--mono);font-size:11px;cursor:pointer';
      [['gallery','GALLERY (1400px)'],['portrait','PORTRAIT (800px)'],['thumbnail','THUMB (600px)'],['original','ORIGINAL']].forEach(function(p){
        var o = el('option'); o.value = p[0]; o.textContent = p[1];
        if (p[0] === preset) o.selected = true;
        presetSel.appendChild(o);
      });
      row.appendChild(presetSel);
    }

    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0]; if (!file) return;
      var selectedPreset = presetSel ? presetSel.value : 'original';
      uploadBtn.textContent = '…'; uploadBtn.disabled = true;
      uploadFile(file, selectedPreset)
        .then(function (data) {
          urlInput.value = data.url;
          prev.style.backgroundImage = 'url(' + data.url + ')';
          onChange(data.url); setDirty(true);
          uploadBtn.textContent = 'UPLOAD'; uploadBtn.disabled = false;
          var saved = data.saved_bytes > 0 ? ' (saved ' + fmtSize(data.saved_bytes) + ')' : '';
          toast('UPLOADED ' + fmtSize(data.size_bytes) + saved);
        })
        .catch(function (e) { toast('UPLOAD FAILED: ' + e.message); uploadBtn.textContent = 'UPLOAD'; uploadBtn.disabled = false; });
    });

    row.appendChild(uploadBtn); row.appendChild(fileInput);
    col.appendChild(urlInput); col.appendChild(row);
    wrap.appendChild(prev); wrap.appendChild(col);
    f.appendChild(wrap);
    return f;
  }

  function chipsEditor(arr, placeholder) {
    var wrap = el('div');
    var chips = el('div', 'chips');
    function render() {
      chips.innerHTML = '';
      arr.forEach(function (v, i) {
        var c = el('span', 'chip', '<span>' + v + '</span>');
        var b = el('button', null, '×');
        b.addEventListener('click', function () { arr.splice(i, 1); render(); setDirty(true); });
        c.appendChild(b); chips.appendChild(c);
      });
    }
    render();
    var addrow = el('div', 'addrow');
    var inp = el('input'); inp.type = 'text'; inp.placeholder = placeholder || 'Add…'; inp.style.fontFamily = 'var(--mono)'; inp.style.fontSize = '13px';
    var add = el('button', 'btn btn--sm', 'ADD');
    function doAdd() { var v = inp.value.trim(); if (v) { arr.push(v); inp.value = ''; render(); setDirty(true); } }
    add.addEventListener('click', doAdd);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    addrow.appendChild(inp); addrow.appendChild(add);
    wrap.appendChild(chips); wrap.appendChild(addrow);
    return wrap;
  }

  function repeatItem(idx, title, sub, bodyEl, onDelete) {
    var item = el('div', 'item');
    var bar = el('div', 'item__bar');
    bar.innerHTML = '<span class="idx">' + (idx < 9 ? '0' : '') + (idx + 1) + '</span>' +
      '<span class="ttl">' + title + '</span><span class="sub">' + (sub || '') + '</span>' +
      '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    bar.addEventListener('click', function () { item.classList.toggle('open'); });
    var body = el('div', 'item__body');
    body.appendChild(bodyEl);
    var foot = el('div', 'item__foot');
    var del = el('button', 'btn btn--sm btn--danger', 'DELETE');
    del.addEventListener('click', onDelete);
    foot.appendChild(del); body.appendChild(foot);
    item.appendChild(bar); item.appendChild(body);
    return item;
  }

  /* ============================================================
     PANELS
     ============================================================ */
  var panels = {};

  panels.dashboard = function (root) {
    var stats = el('div', 'stats');
    [
      [C.hero.eventName, 'NEXT EVENT', true],
      [C.pastEvents.length, 'PAST EVENTS', false],
      [C.djs.length, 'RESIDENTS', false],
      [C.sets.length, 'AUDIO SETS', false]
    ].forEach(function (s) {
      var st = el('div', 'stat', '<div class="n' + (s[2] ? ' red' : '') + '" style="font-size:' + (s[2] ? '30px' : '42px') + '">' + s[0] + '</div><div class="l">' + s[1] + '</div>');
      stats.appendChild(st);
    });
    root.appendChild(stats);

    var pl = el('div', 'preview-link');
    pl.innerHTML = '<div><h3>Live site preview</h3><p>Open the public site in a new tab.</p></div>';
    var a = el('a', 'btn btn--primary', 'OPEN SITE ↗'); a.href = '/'; a.target = '_blank';
    pl.appendChild(a);

    var logout = el('button', 'btn btn--ghost'); logout.style.marginLeft = '12px'; logout.textContent = 'SIGN OUT';
    logout.addEventListener('click', function () { clearToken(); showLogin(); });
    pl.appendChild(logout);
    root.appendChild(pl);
  };

  panels.hero = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 01</div><div class="card__head"><div><h2>Hero & Countdown</h2></div></div>';
    var g = el('div', 'grid cols-2');
    var fName = field('Event name', C.hero.eventName); bind(fName._input, C.hero, 'eventName');
    var fEd = field('Edition / label', C.hero.edition); bind(fEd._input, C.hero, 'edition');
    var fLoc = field('Location', C.hero.location); bind(fLoc._input, C.hero, 'location');
    var fTag = field('Tagline', C.hero.tagline); bind(fTag._input, C.hero, 'tagline');
    g.appendChild(fName); g.appendChild(fEd); g.appendChild(fLoc); g.appendChild(fTag);
    card.appendChild(g);
    var g2 = el('div', 'grid cols-2'); g2.style.marginTop = '18px';
    var fDate = field('Countdown target', (C.hero.targetDate || '').slice(0, 16), { type: 'datetime-local' });
    fDate._input.addEventListener('input', function () { C.hero.targetDate = fDate._input.value + ':00'; setDirty(true); });
    g2.appendChild(fDate); card.appendChild(g2);
    root.appendChild(card);

    var vcard = el('div', 'card');
    vcard.innerHTML = '<div class="card__head"><div><h2>Background video</h2></div></div>';
    var fv = mediaField('Video file (mp4)', C.hero.video, 'video/mp4', function (v) { C.hero.video = v; });
    vcard.appendChild(fv);
    root.appendChild(vcard);
  };

  panels.announce = function (root) {
    var a = C.announce;
    if (typeof a.announced === 'undefined') a.announced = true;
    a.tba = a.tba || { headline: 'TBA', status: 'TO BE ANNOUNCED', blurb: '', ctaLabel: 'GET THE DROP', ctaUrl: '#' };

    /* status toggle card */
    var statusCard = el('div', 'card');
    statusCard.innerHTML = '<div class="kick">BLOCK 01 + 02</div><div class="card__head"><div><h2>Next event status</h2><p>When the date isn\'t locked yet, switch to <b>Date TBA</b> — the countdown and event details are hidden and replaced with a "to be announced" state.</p></div></div>';
    var segWrap = el('div'); segWrap.style.cssText = 'display:flex;gap:8px;margin:16px 0 0';
    var segOn = el('button', 'btn btn--sm', 'ANNOUNCED');
    var segOff = el('button', 'btn btn--sm', '◌ DATE TBA');
    segWrap.appendChild(segOn); segWrap.appendChild(segOff);
    statusCard.appendChild(segWrap);
    root.appendChild(statusCard);

    /* live event card */
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 02</div><div class="card__head"><div><h2>Next Event Announcement</h2></div></div>';
    var g = el('div', 'grid cols-2');
    [['Kicker', 'kicker'], ['Event name', 'eventName'], ['Date', 'date'], ['Doors / time', 'doors'], ['City', 'city'], ['Venue', 'venue']].forEach(function (pair) {
      var f = field(pair[0], a[pair[1]]); bind(f._input, a, pair[1]); g.appendChild(f);
    });
    card.appendChild(g);
    var fb = field('Blurb', a.blurb, { textarea: true, rows: 4 }); bind(fb._input, a, 'blurb'); fb.style.marginTop = '18px'; card.appendChild(fb);
    var g3 = el('div', 'grid cols-2'); g3.style.marginTop = '18px';
    var ft1 = field('Ticket button label', a.ticketLabel); bind(ft1._input, a, 'ticketLabel');
    var ft2 = field('Ticket URL', a.ticketUrl, { mono: true }); bind(ft2._input, a, 'ticketUrl');
    g3.appendChild(ft1); g3.appendChild(ft2); card.appendChild(g3);
    root.appendChild(card);

    /* lineup */
    var lcard = el('div', 'card');
    lcard.innerHTML = '<div class="card__head"><div><h2>Line-up</h2></div></div>';
    a.lineup = a.lineup || [];
    var fl = field('Section label', a.lineupLabel || 'LINE-UP'); bind(fl._input, a, 'lineupLabel'); fl.style.maxWidth = '260px'; fl.style.marginBottom = '18px'; lcard.appendChild(fl);
    var llist = el('div', 'lu-list');
    function renderLineup() {
      llist.innerHTML = '';
      a.lineup.forEach(function (act, i) {
        if (typeof act === 'string') { act = { name: act, tag: '' }; a.lineup[i] = act; }
        var row = el('div', 'lu-row');
        var handle = el('span', 'lu-no', (i < 9 ? '0' : '') + (i + 1));
        var nm = el('input', 'lu-in'); nm.type = 'text'; nm.value = act.name || ''; nm.placeholder = 'Artist name';
        nm.addEventListener('input', function () { act.name = nm.value; setDirty(true); });
        var tg = el('input', 'lu-in lu-in--tag'); tg.type = 'text'; tg.value = act.tag || ''; tg.placeholder = 'Tag';
        tg.addEventListener('input', function () { act.tag = tg.value; setDirty(true); });
        var up = el('button', 'lu-btn', '↑');
        up.addEventListener('click', function () { if (i > 0) { a.lineup.splice(i - 1, 0, a.lineup.splice(i, 1)[0]); renderLineup(); setDirty(true); } });
        var dn = el('button', 'lu-btn', '↓');
        dn.addEventListener('click', function () { if (i < a.lineup.length - 1) { a.lineup.splice(i + 1, 0, a.lineup.splice(i, 1)[0]); renderLineup(); setDirty(true); } });
        var del = el('button', 'lu-btn lu-btn--danger', '×');
        del.addEventListener('click', function () { a.lineup.splice(i, 1); renderLineup(); setDirty(true); });
        row.appendChild(handle); row.appendChild(nm); row.appendChild(tg); row.appendChild(up); row.appendChild(dn); row.appendChild(del);
        llist.appendChild(row);
      });
    }
    renderLineup();
    var addLn = el('button', 'btn btn--sm', '+ ADD ARTIST'); addLn.style.marginTop = '12px';
    addLn.addEventListener('click', function () { a.lineup.push({ name: '', tag: '' }); renderLineup(); setDirty(true); });
    lcard.appendChild(llist); lcard.appendChild(addLn);
    root.appendChild(lcard);

    /* carousel */
    var icard = el('div', 'card');
    icard.innerHTML = '<div class="card__head"><div><h2>Carousel images</h2></div></div>';
    var imgList = el('div');
    function renderImgs() {
      imgList.innerHTML = '';
      a.images.forEach(function (src, i) {
        var f = mediaField('Image ' + (i + 1), src, 'image/*', function (v) { a.images[i] = v; });
        var del = el('button', 'btn btn--sm btn--danger', 'REMOVE'); del.style.marginTop = '8px';
        del.addEventListener('click', function () { a.images.splice(i, 1); renderImgs(); setDirty(true); });
        f.appendChild(del); f.style.marginBottom = '16px'; imgList.appendChild(f);
      });
    }
    renderImgs();
    var addImg = el('button', 'btn btn--sm', '+ ADD IMAGE');
    addImg.addEventListener('click', function () { a.images.push(''); renderImgs(); setDirty(true); });
    icard.appendChild(imgList); icard.appendChild(addImg);
    root.appendChild(icard);

    /* TBA editor card */
    var tcard = el('div', 'card');
    tcard.innerHTML = '<div class="kick">DATE TBA</div><div class="card__head"><div><h2>"To be announced" state</h2><p>Copy shown in Block 02 while no date is set. Block 01 shows the signal line.</p></div></div>';
    var th = field('Headline', a.tba.headline); bind(th._input, a.tba, 'headline'); tcard.appendChild(th);
    var ts = field('Status line', a.tba.status); bind(ts._input, a.tba, 'status'); tcard.appendChild(ts);
    var tb = field('Blurb', a.tba.blurb, { textarea: true, rows: 3 }); bind(tb._input, a.tba, 'blurb'); tcard.appendChild(tb);
    var g2 = el('div', 'grid cols-2');
    var tc1 = field('CTA label', a.tba.ctaLabel); bind(tc1._input, a.tba, 'ctaLabel');
    var tc2 = field('CTA URL', a.tba.ctaUrl, { mono: true }); bind(tc2._input, a.tba, 'ctaUrl');
    g2.appendChild(tc1); g2.appendChild(tc2); tcard.appendChild(g2);
    var th2 = field('Hero signal text (Block 01)', C.hero.tbaStatus || 'DATE TO BE REVEALED');
    bind(th2._input, C.hero, 'tbaStatus'); th2.style.marginTop = '18px'; tcard.appendChild(th2);
    root.appendChild(tcard);

    var liveCards = [card, lcard, icard];
    function applyState() {
      segOn.classList.toggle('on', !!a.announced);
      segOff.classList.toggle('on', !a.announced);
      liveCards.forEach(function (c) { c.style.opacity = a.announced ? '' : '0.4'; c.style.pointerEvents = a.announced ? '' : 'none'; });
      tcard.style.opacity = a.announced ? '0.4' : '';
      tcard.style.pointerEvents = a.announced ? 'none' : '';
    }
    segOn.addEventListener('click', function () { a.announced = true; setDirty(true); applyState(); });
    segOff.addEventListener('click', function () { a.announced = false; setDirty(true); applyState(); });
    applyState();
  };

  panels.events = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · ARCHIVE</div><div class="card__head"><div><h2>Past Events</h2></div></div>';
    var list = el('div');
    function render() {
      list.innerHTML = '';
      C.pastEvents.forEach(function (ev, i) {
        var body = el('div');
        var g = el('div', 'grid cols-2');
        var f1 = field('Event name', ev.name); bind(f1._input, ev, 'name');
        var f2 = field('Date', ev.date, { mono: true }); bind(f2._input, ev, 'date');
        var f3 = field('City', ev.city); bind(f3._input, ev, 'city');
        g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); body.appendChild(g);
        var img = mediaField('Photo', ev.image, 'image/*', function (v) { ev.image = v; }); img.style.marginTop = '16px'; body.appendChild(img);
        var lu = el('div', 'field'); lu.style.marginTop = '16px';
        lu.appendChild(el('label', null, 'LINEUP')); ev.lineup = ev.lineup || [];
        lu.appendChild(chipsEditor(ev.lineup, 'Add DJ…')); body.appendChild(lu);
        list.appendChild(repeatItem(i, ev.name + ' — ' + ev.date, (ev.lineup || []).length + ' artists', body, function () {
          C.pastEvents.splice(i, 1); render(); setDirty(true);
        }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD PAST EVENT');
    add.addEventListener('click', function () { C.pastEvents.push({ name: 'COVEN', date: '01.01.2026', city: 'DUBAI', image: '', lineup: [] }); render(); setDirty(true); });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  panels.djs = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · THE CIRCLE</div><div class="card__head"><div><h2>Residents</h2></div></div>';
    var list = el('div');
    function render() {
      list.innerHTML = '';
      C.djs.forEach(function (dj, i) {
        dj.socials = dj.socials || {};
        var body = el('div');
        var g = el('div', 'grid cols-2');
        var f1 = field('Name', dj.name); bind(f1._input, dj, 'name');
        var f2 = field('Role', dj.role); bind(f2._input, dj, 'role');
        g.appendChild(f1); g.appendChild(f2); body.appendChild(g);
        var img = mediaField('Portrait', dj.image, 'image/*', function (v) { dj.image = v; }); img.style.marginTop = '16px'; body.appendChild(img);
        var g2 = el('div', 'grid cols-2'); g2.style.marginTop = '16px';
        var s1 = field('Instagram URL', dj.socials.instagram, { mono: true }); bind(s1._input, dj.socials, 'instagram');
        var s2 = field('SoundCloud URL', dj.socials.soundcloud, { mono: true }); bind(s2._input, dj.socials, 'soundcloud');
        g2.appendChild(s1); g2.appendChild(s2); body.appendChild(g2);
        list.appendChild(repeatItem(i, dj.name, dj.role, body, function () { C.djs.splice(i, 1); render(); setDirty(true); }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD RESIDENT');
    add.addEventListener('click', function () { C.djs.push({ name: 'NEW DJ', role: 'RESIDENT', image: '', socials: { instagram: '#', soundcloud: '#' } }); render(); setDirty(true); });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  panels.sets = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">MEDIA PLAYER</div><div class="card__head"><div><h2>Audio Sets</h2><p>Upload MP3 files for the floating player.</p></div></div>';
    var list = el('div');
    function fmt(s) { s = +s || 0; return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    function parse(v) { var p = String(v).split(':'); return p.length === 2 ? (+p[0] * 60 + (+p[1] || 0)) : (+v || 0); }
    function render() {
      list.innerHTML = '';
      C.sets.forEach(function (st, i) {
        var body = el('div');
        var g = el('div', 'grid cols-2');
        var f1 = field('Title', st.title); bind(f1._input, st, 'title');
        var f2 = field('DJ', st.dj); bind(f2._input, st, 'dj');
        var f3 = field('Event', st.event); bind(f3._input, st, 'event');
        var f4 = field('Duration (mm:ss)', fmt(st.duration), { mono: true });
        f4._input.addEventListener('input', function () { st.duration = parse(f4._input.value); setDirty(true); });
        g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); g.appendChild(f4); body.appendChild(g);

        /* audio upload */
        var af = el('div', 'field'); af.style.marginTop = '16px';
        af.appendChild(el('label', null, 'AUDIO FILE'));
        var audioWrap = el('div'); audioWrap.style.display = 'flex'; audioWrap.style.alignItems = 'center'; audioWrap.style.gap = '12px';
        var urlSpan = el('span'); urlSpan.style.fontFamily = 'var(--mono)'; urlSpan.style.fontSize = '12px'; urlSpan.style.color = '#888';
        urlSpan.textContent = st.audioUrl || 'No file uploaded';
        var uploadBtn = el('button', 'btn btn--sm', 'UPLOAD MP3');
        var fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'audio/*'; fileIn.hidden = true;
        uploadBtn.addEventListener('click', function () { fileIn.click(); });
        fileIn.addEventListener('change', function () {
          var file = fileIn.files[0]; if (!file) return;
          uploadBtn.textContent = 'UPLOADING…'; uploadBtn.disabled = true;
          uploadFile(file)
            .then(function (data) {
              st.audioUrl = data.url;
              if (!st.duration || st.duration === 3600) {
                // Try to read duration from audio element
                var tmp = new Audio(data.url);
                tmp.onloadedmetadata = function () {
                  st.duration = Math.round(tmp.duration);
                  f4._input.value = fmt(st.duration);
                  setDirty(true);
                };
              }
              urlSpan.textContent = data.original_name;
              uploadBtn.textContent = 'UPLOAD MP3'; uploadBtn.disabled = false;
              setDirty(true); toast('UPLOADED: ' + data.original_name);
            })
            .catch(function (e) { toast('UPLOAD FAILED: ' + e.message); uploadBtn.textContent = 'UPLOAD MP3'; uploadBtn.disabled = false; });
        });
        audioWrap.appendChild(urlSpan); audioWrap.appendChild(uploadBtn); audioWrap.appendChild(fileIn);
        af.appendChild(audioWrap); body.appendChild(af);

        list.appendChild(repeatItem(i, st.title, st.dj, body, function () { C.sets.splice(i, 1); render(); setDirty(true); }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD SET');
    add.addEventListener('click', function () { C.sets.push({ title: 'NEW SET', dj: '', event: '', duration: 3600, audioUrl: '' }); render(); setDirty(true); });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  panels.about = function (root) {
    var ab = C.about;
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 04</div><div class="card__head"><div><h2>About / Manifesto</h2></div></div>';
    var f1 = field('Kicker', ab.kicker); bind(f1._input, ab, 'kicker'); card.appendChild(f1);
    var f2 = field('Big statement', ab.statement, { textarea: true, rows: 2 }); bind(f2._input, ab, 'statement'); f2.style.marginTop = '16px'; card.appendChild(f2);
    var f3 = field('Paragraphs (one per line)', (ab.paragraphs || []).join('\n'), { textarea: true, rows: 6 });
    f3._input.addEventListener('input', function () { ab.paragraphs = f3._input.value.split('\n').filter(function (x) { return x.trim(); }); setDirty(true); });
    f3.style.marginTop = '16px'; card.appendChild(f3);
    var sf = el('div', 'field'); sf.style.marginTop = '16px';
    sf.appendChild(el('label', null, 'STYLES WE PLAY')); ab.styles = ab.styles || [];
    sf.appendChild(chipsEditor(ab.styles, 'Add style…')); card.appendChild(sf);
    root.appendChild(card);

    var scard = el('div', 'card');
    scard.innerHTML = '<div class="card__head"><div><h2>The Sound (Function-One)</h2></div></div>';
    var e1 = field('Heading', ab.equipment.heading); bind(e1._input, ab.equipment, 'heading'); scard.appendChild(e1);
    var e2 = field('Body', ab.equipment.body, { textarea: true, rows: 3 }); bind(e2._input, ab.equipment, 'body'); e2.style.marginTop = '16px'; scard.appendChild(e2);
    root.appendChild(scard);
  };

  panels.settings = function (root) {
    var ccard = el('div', 'card');
    ccard.innerHTML = '<div class="kick">FOOTER</div><div class="card__head"><div><h2>Contacts & Socials</h2></div></div>';
    var g = el('div', 'grid cols-2');
    var c1 = field('General email', C.contacts.email, { mono: true }); bind(c1._input, C.contacts, 'email');
    var c2 = field('Bookings email', C.contacts.bookings, { mono: true }); bind(c2._input, C.contacts, 'bookings');
    g.appendChild(c1); g.appendChild(c2); ccard.appendChild(g);
    var g2 = el('div', 'grid cols-2'); g2.style.marginTop = '18px';
    ['instagram', 'soundcloud', 'telegram', 'tiktok', 'youtube'].forEach(function (k) {
      var f = field(k + ' URL', C.socials[k], { mono: true }); bind(f._input, C.socials, k); g2.appendChild(f);
    });
    ccard.appendChild(g2); root.appendChild(ccard);

    var ncard = el('div', 'card');
    ncard.innerHTML = '<div class="kick">NAVIGATION</div><div class="card__head"><div><h2>Top menu</h2></div></div>';
    var row = el('div'); row.style.cssText = 'display:flex;align-items:center;gap:12px';
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!C.nav.enabled; cb.style.cssText = 'width:18px;height:18px;accent-color:#ff2417';
    cb.addEventListener('change', function () { C.nav.enabled = cb.checked; setDirty(true); });
    row.appendChild(cb); row.appendChild(el('span', null, 'Show top navigation menu')); ncard.appendChild(row);
    var nf = el('div', 'field'); nf.style.marginTop = '16px';
    nf.appendChild(el('label', null, 'MENU ITEMS')); C.nav.items = C.nav.items || [];
    nf.appendChild(chipsEditor(C.nav.items, 'Add menu item…')); ncard.appendChild(nf);
    var bf = field('Brand name', C.brand.name); bind(bf._input, C.brand, 'name'); bf.style.marginTop = '16px'; ncard.appendChild(bf);
    root.appendChild(ncard);
  };

  /* ============================================================
     MEDIA LIBRARY PANEL
     ============================================================ */
  panels.media = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">UPLOADS</div><div class="card__head"><div><h2>Media Library</h2><p>All uploaded files. Click an image to copy its URL. Use the resize tool to re-optimize existing images.</p></div></div>';

    // Filter tabs
    var tabs = el('div'); tabs.style.cssText = 'display:flex;gap:8px;margin-bottom:20px';
    var activeFilter = 'image';
    var grid = el('div', 'media-grid');

    function loadMedia() {
      grid.innerHTML = '<div style="color:#555;font-family:var(--mono);font-size:12px">Loading…</div>';
      apiFetch('/api/media/files?category=' + activeFilter)
        .then(function (r) { return r.json(); })
        .then(function (files) {
          grid.innerHTML = '';
          if (!files.length) {
            grid.innerHTML = '<div style="color:#555;font-family:var(--mono);font-size:12px;padding:20px 0">No files uploaded yet.</div>';
            return;
          }
          files.forEach(function (f) {
            var item = el('div', 'media-item');
            var thumb = el('div', 'media-thumb');
            if (f.category === 'image') {
              thumb.style.backgroundImage = 'url(' + f.url + ')';
            } else if (f.category === 'audio') {
              thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;color:#ff2417"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>';
              thumb.style.cssText += 'display:flex;align-items:center;justify-content:center;background:#111';
            } else {
              thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;color:#ff2417"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
              thumb.style.cssText += 'display:flex;align-items:center;justify-content:center;background:#111';
            }

            var info = el('div', 'media-info');
            var name = el('div', 'media-name'); name.textContent = f.original_name; name.title = f.original_name;
            var size = el('div', 'media-size'); size.textContent = fmtSize(f.size_bytes);

            var actions = el('div', 'media-actions');

            // Copy URL
            var copyBtn = el('button', 'btn btn--sm', 'COPY URL');
            copyBtn.addEventListener('click', function () {
              navigator.clipboard.writeText(f.url).then(function () { toast('URL COPIED'); });
            });
            actions.appendChild(copyBtn);

            // Resize (images only)
            if (f.category === 'image') {
              var resSel = el('select'); resSel.style.cssText = 'background:#111;color:#888;border:1px solid #333;padding:4px 6px;font-family:var(--mono);font-size:10px;cursor:pointer';
              [['gallery','1400px'],['portrait','800px'],['thumbnail','600px']].forEach(function(p){
                var o = el('option'); o.value = p[0]; o.textContent = p[1]; resSel.appendChild(o);
              });
              var resBtn = el('button', 'btn btn--sm', 'RESIZE →');
              resBtn.addEventListener('click', function () {
                resBtn.textContent = '…'; resBtn.disabled = true;
                resizeFile(f.id, resSel.value)
                  .then(function (data) {
                    var saved = data.saved_bytes > 0 ? ' saved ' + fmtSize(data.saved_bytes) : '';
                    toast('RESIZED → ' + fmtSize(data.size_bytes) + (saved ? ' (' + saved + ')' : ''));
                    size.textContent = fmtSize(data.size_bytes);
                    if (f.category === 'image') thumb.style.backgroundImage = 'url(' + data.url + '?' + Date.now() + ')';
                    f.url = data.url; f.filename = data.filename; f.size_bytes = data.size_bytes;
                    resBtn.textContent = 'RESIZE →'; resBtn.disabled = false;
                  })
                  .catch(function (e) { toast('RESIZE FAILED: ' + e.message); resBtn.textContent = 'RESIZE →'; resBtn.disabled = false; });
              });
              actions.appendChild(resSel);
              actions.appendChild(resBtn);
            }

            // Delete
            var delBtn = el('button', 'btn btn--sm btn--danger', '✕');
            delBtn.addEventListener('click', function () {
              if (!confirm('Delete ' + f.original_name + '?')) return;
              deleteFile(f.id).then(function () { item.remove(); toast('DELETED'); });
            });
            actions.appendChild(delBtn);

            info.appendChild(name); info.appendChild(size); info.appendChild(actions);
            item.appendChild(thumb); item.appendChild(info);
            grid.appendChild(item);
          });
        })
        .catch(function () { grid.innerHTML = '<div style="color:#ff2417;font-family:var(--mono);font-size:12px">Failed to load files.</div>'; });
    }

    ['image', 'audio', 'video'].forEach(function (cat) {
      var btn = el('button', 'btn btn--sm' + (cat === activeFilter ? ' btn--primary' : ''));
      btn.textContent = cat.toUpperCase();
      btn.addEventListener('click', function () {
        activeFilter = cat;
        $$('button', tabs).forEach(function (b) { b.classList.remove('btn--primary'); });
        btn.classList.add('btn--primary');
        loadMedia();
      });
      tabs.appendChild(btn);
    });

    // Quick upload
    var uploadCard = el('div', 'card'); uploadCard.style.marginBottom = '20px';
    uploadCard.innerHTML = '<div class="card__head"><div><h2>Quick Upload</h2></div></div>';
    var upRow = el('div'); upRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    var upPreset = el('select'); upPreset.style.cssText = 'background:#111;color:#888;border:1px solid #333;padding:6px 10px;font-family:var(--mono);font-size:11px;cursor:pointer';
    [['gallery','GALLERY (1400px max)'],['portrait','PORTRAIT (800px max)'],['thumbnail','THUMB (600px max)'],['original','ORIGINAL (no resize)']].forEach(function(p){
      var o = el('option'); o.value = p[0]; o.textContent = p[1]; upPreset.appendChild(o);
    });
    var upFile = el('input'); upFile.type = 'file'; upFile.accept = 'image/*,audio/*,video/*'; upFile.hidden = true;
    var upBtn = el('button', 'btn btn--primary', 'CHOOSE FILE');
    upBtn.addEventListener('click', function () { upFile.click(); });
    upFile.addEventListener('change', function () {
      var file = upFile.files[0]; if (!file) return;
      upBtn.textContent = 'UPLOADING…'; upBtn.disabled = true;
      uploadFile(file, upPreset.value)
        .then(function (data) {
          var saved = data.saved_bytes > 0 ? ' (saved ' + fmtSize(data.saved_bytes) + ')' : '';
          toast('UPLOADED ' + fmtSize(data.size_bytes) + saved);
          upBtn.textContent = 'CHOOSE FILE'; upBtn.disabled = false;
          activeFilter = data.category;
          $$('button', tabs).forEach(function (b, i) { b.classList.toggle('btn--primary', ['image','audio','video'][i] === data.category); });
          loadMedia();
        })
        .catch(function (e) { toast('FAILED: ' + e.message); upBtn.textContent = 'CHOOSE FILE'; upBtn.disabled = false; });
    });
    upRow.appendChild(upPreset); upRow.appendChild(upBtn); upRow.appendChild(upFile);
    uploadCard.appendChild(upRow);

    root.appendChild(uploadCard);
    card.appendChild(tabs);
    card.appendChild(grid);
    root.appendChild(card);
    loadMedia();
  };

  /* ============================================================
     ROUTER
     ============================================================ */
  var current = 'dashboard';
  var titles = {
    dashboard: ['Dashboard', 'OVERVIEW'], hero: ['Hero & Countdown', 'BLOCK 01'],
    announce: ['Next Event', 'BLOCK 02'], events: ['Past Events', 'BLOCK 03'],
    djs: ['Residents', 'BLOCK 03'], sets: ['Audio Sets', 'PLAYER'],
    about: ['About', 'BLOCK 04'], settings: ['Contacts & Settings', 'FOOTER'],
    media: ['Media Library', 'UPLOADS']
  };

  function route(name) {
    current = name;
    $$('.navlink').forEach(function (a) { a.classList.toggle('active', a.dataset.go === name); });
    $('#page-title').textContent = titles[name][0];
    $('#page-crumb').textContent = 'BARREL 23 / ' + titles[name][1];
    var root = $('#content'); root.innerHTML = '';
    var panel = el('div', 'panel active'); root.appendChild(panel);
    panels[name](panel);
  }

  $$('.navlink').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); route(a.dataset.go); }); });

  /* Save */
  $('#btn-save').addEventListener('click', function () {
    $('#btn-save').textContent = 'SAVING…';
    saveContent()
      .then(function () {
        setDirty(false); toast('SAVED — LIVE SITE UPDATED');
        $('#btn-save').textContent = 'SAVE CHANGES';
      })
      .catch(function (e) {
        toast('SAVE FAILED: ' + e.message);
        $('#btn-save').textContent = 'SAVE CHANGES';
      });
  });

  /* Export */
  $('#btn-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a'); a.href = url; a.download = 'barrel23-content.json'; a.click();
    URL.revokeObjectURL(url); toast('EXPORTED barrel23-content.json');
  });

  /* Import */
  $('#imp-file').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        C = Object.assign(C, o);
        route(current); setDirty(true); toast('IMPORTED — CLICK SAVE TO APPLY');
      } catch (err) { toast('INVALID JSON'); }
    };
    r.readAsText(file);
  });

  /* Reset */
  $('#btn-reset').addEventListener('click', function () {
    if (confirm('Reset all content to defaults? This cannot be undone.')) {
      apiFetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(function () {
        return loadContent();
      }).then(function (data) {
        C = data; route(current); setDirty(false); toast('RESET TO DEFAULTS');
      }).catch(function (e) { toast('RESET FAILED: ' + e.message); });
    }
  });

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ============================================================
     BOOT
     ============================================================ */
  if (!getToken()) {
    showLogin();
    return;
  }

  loadContent()
    .then(function (data) {
      C = data;
      setDirty(false);
      route('dashboard');
    })
    .catch(function (e) {
      if (e.message !== '401') showLogin('Could not load content: ' + e.message);
    });
})();
