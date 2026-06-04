/* ============================================================
   BARREL 23 — Admin panel (API-backed)
   ============================================================ */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (t) { return (t == null ? '' : String(t)).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }); };

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
    item.draggable = true;
    var bar = el('div', 'item__bar');
    bar.innerHTML = '<span class="drag-handle" title="Drag to reorder">⠿</span><span class="idx">' + (idx < 9 ? '0' : '') + (idx + 1) + '</span>' +
      '<span class="ttl">' + title + '</span><span class="sub">' + (sub || '') + '</span>' +
      '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    bar.addEventListener('click', function (e) { if (!e.target.classList.contains('drag-handle')) item.classList.toggle('open'); });
    var body = el('div', 'item__body');
    body.appendChild(bodyEl);
    var foot = el('div', 'item__foot');
    var del = el('button', 'btn btn--sm btn--danger', 'DELETE');
    del.addEventListener('click', onDelete);
    var save = el('button', 'btn btn--sm btn--primary', 'SAVE');
    save.addEventListener('click', function () {
      save.textContent = '…'; save.disabled = true;
      saveContent().then(function () {
        setDirty(false); toast('SAVED'); save.textContent = 'SAVE'; save.disabled = false;
      }).catch(function (e) {
        toast('SAVE FAILED: ' + e.message); save.textContent = 'SAVE'; save.disabled = false;
      });
    });
    foot.appendChild(del); foot.appendChild(save); body.appendChild(foot);
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
      [C.djs.length, 'RESIDENTS & ARTISTS', false],
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

  function openArchiveModal(a) {
    var overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px';
    var box = el('div');
    box.style.cssText = 'background:#111;border:1px solid #333;padding:32px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;font-family:var(--mono)';

    var selectedPhoto = a.images && a.images.length ? a.images[0] : '';

    box.innerHTML = '<div style="color:var(--red);font-size:11px;letter-spacing:3px;margin-bottom:20px">ARCHIVE EVENT</div>' +
      '<h2 style="margin:0 0 6px;font-size:22px">' + esc(a.eventName) + '</h2>' +
      '<div style="color:#888;font-size:12px;margin-bottom:24px">' + esc(a.date) + ' — ' + esc(a.city) + '</div>';

    /* photo picker */
    var photoSection = el('div'); photoSection.style.marginBottom = '24px';
    photoSection.innerHTML = '<div style="color:#666;letter-spacing:2px;font-size:10px;margin-bottom:10px">ARCHIVE PHOTO</div>';

    var photoPreview = el('div');
    photoPreview.style.cssText = 'width:100%;aspect-ratio:16/9;background:#0a0a0a center/cover no-repeat;border:1px solid #333;margin-bottom:10px';
    if (selectedPhoto) photoPreview.style.backgroundImage = 'url(' + selectedPhoto + ')';

    /* carousel thumbnails */
    var thumbs = el('div'); thumbs.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px';
    (a.images || []).forEach(function (src) {
      var t = el('div');
      t.style.cssText = 'width:72px;height:48px;background:#0a0a0a center/cover no-repeat;border:2px solid ' + (src === selectedPhoto ? 'var(--red)' : '#333') + ';cursor:pointer;flex-shrink:0';
      t.style.backgroundImage = 'url(' + src + ')';
      t.addEventListener('click', function () {
        selectedPhoto = src;
        photoPreview.style.backgroundImage = 'url(' + src + ')';
        Array.from(thumbs.children).forEach(function (c) { c.style.borderColor = '#333'; });
        t.style.borderColor = 'var(--red)';
        urlInput.value = '';
      });
      thumbs.appendChild(t);
    });

    /* manual URL input + browse button */
    var urlWrap = el('div'); urlWrap.style.cssText = 'display:flex;gap:6px;align-items:center';
    var urlInput = el('input'); urlInput.type = 'text'; urlInput.placeholder = 'Or paste image URL…';
    urlInput.style.cssText = 'flex:1;background:#0a0a0a;border:1px solid #333;color:#fff;padding:8px 10px;font-family:inherit;font-size:12px;outline:none';
    urlInput.addEventListener('input', function () {
      if (urlInput.value) { selectedPhoto = urlInput.value; photoPreview.style.backgroundImage = 'url(' + urlInput.value + ')'; }
    });
    var browseBtn = el('button', 'btn btn--sm', 'BROWSE');
    var browseFile = el('input'); browseFile.type = 'file'; browseFile.accept = 'image/*'; browseFile.hidden = true;
    browseBtn.addEventListener('click', function () { browseFile.click(); });
    browseFile.addEventListener('change', function () {
      var file = browseFile.files[0]; if (!file) return;
      browseBtn.textContent = '…'; browseBtn.disabled = true;
      uploadFile(file, 'gallery')
        .then(function (data) {
          selectedPhoto = data.url;
          urlInput.value = data.url;
          photoPreview.style.backgroundImage = 'url(' + data.url + ')';
          Array.from(thumbs.children).forEach(function (c) { c.style.borderColor = '#333'; });
          browseBtn.textContent = 'BROWSE'; browseBtn.disabled = false;
          toast('UPLOADED ' + fmtSize(data.size_bytes));
        })
        .catch(function (e) { toast('UPLOAD FAILED: ' + e.message); browseBtn.textContent = 'BROWSE'; browseBtn.disabled = false; });
    });
    urlWrap.appendChild(urlInput); urlWrap.appendChild(browseBtn); urlWrap.appendChild(browseFile);

    photoSection.appendChild(photoPreview);
    if ((a.images || []).length) photoSection.appendChild(thumbs);
    photoSection.appendChild(urlWrap);
    box.appendChild(photoSection);

    /* lineup editor */
    var luData = (a.lineup || []).map(function (act) { return typeof act === 'string' ? act : act.name; }).filter(Boolean);
    var luSection = el('div'); luSection.style.marginBottom = '24px';
    luSection.appendChild(el('div', null, '<div style="color:#666;letter-spacing:2px;font-size:10px;margin-bottom:10px">LINE-UP</div>'));
    luSection.appendChild(chipsEditor(luData, 'Add artist…'));
    box.appendChild(luSection);

    /* buttons */
    var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;margin-top:8px';
    var cancelBtn = el('button', 'btn btn--sm', 'CANCEL');
    var confirmBtn = el('button', 'btn btn--sm', 'ARCHIVE & RESET TO TBA');
    confirmBtn.style.background = 'var(--red)';
    cancelBtn.addEventListener('click', function () { document.body.removeChild(overlay); });
    confirmBtn.addEventListener('click', function () {
      var entry = {
        name: a.eventName,
        date: a.date,
        city: a.city,
        image: selectedPhoto,
        lineup: luData
      };
      C.pastEvents.unshift(entry);
      /* reset next event to TBA */
      a.announced = false;
      a.eventName = ''; a.date = ''; a.doors = ''; a.city = ''; a.venue = ''; a.blurb = '';
      a.lineup = []; a.images = [];
      document.body.removeChild(overlay);
      setDirty(true);
      setTimeout(function () { route('announce'); }, 0);
    });
    btnRow.appendChild(cancelBtn); btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
  }

  panels.announce = function (root) {
    var a = C.announce;
    if (typeof a.announced === 'undefined') a.announced = true;
    a.tba = a.tba || { headline: 'TBA', status: 'TO BE ANNOUNCED', blurb: '', ctaLabel: 'GET THE DROP', ctaUrl: '#' };

    /* archive action card */
    var archCard = el('div', 'card');
    archCard.innerHTML = '<div class="kick">ARCHIVE</div><div class="card__head"><div><h2>Archive current event</h2><p>Saves the current event to the top of Past Events and resets Next Event to TBA state.</p></div></div>';
    var archBtn = el('button', 'btn', '⬇ MOVE TO ARCHIVE');
    archBtn.style.marginTop = '16px';
    archBtn.addEventListener('click', function () { openArchiveModal(a); });
    archCard.appendChild(archBtn);
    root.appendChild(archCard);

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

  /* -------- lineup editor with DJ-picker -------- */
  function lineupEditor(lineup) {
    var wrap = el('div');

    /* existing entries */
    var chips = el('div', 'chips');
    function renderChips() {
      chips.innerHTML = '';
      lineup.forEach(function (entry, i) {
        var name = typeof entry === 'string' ? entry : (entry.name || '');
        var role = typeof entry === 'object' ? (entry.role || '') : '';
        var c = el('span', 'chip');
        c.innerHTML = '<span>' + esc(name) + (role ? ' <em style="color:#888;font-style:normal">· ' + esc(role) + '</em>' : '') + '</span>';
        var b = el('button', null, '×');
        b.addEventListener('click', function () { lineup.splice(i, 1); renderChips(); setDirty(true); });
        c.appendChild(b); chips.appendChild(c);
      });
    }
    renderChips();

    /* add row */
    var addRow = el('div'); addRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:4px';

    /* custom DJ picker */
    var pickerWrap = el('div'); pickerWrap.style.cssText = 'position:relative';
    var pickerBtn = el('button');
    pickerBtn.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:space-between;background:#0a0a0a;border:1px solid #333;color:#888;padding:9px 12px;font-family:var(--mono);font-size:13px;text-align:left;cursor:pointer';
    pickerBtn.innerHTML = '<span id="picker-label">Select from residents & artists…</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

    var dropdown = el('div');
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#111;border:1px solid #444;border-top:none;z-index:50;max-height:220px;overflow-y:auto;display:none';

    var djList = (C.djs || []);
    var selectedDJ = null;

    function buildDropdown() {
      dropdown.innerHTML = '';
      djList = (C.djs || []);
      if (!djList.length) {
        var empty = el('div'); empty.style.cssText = 'padding:12px;color:#555;font-family:var(--mono);font-size:12px';
        empty.textContent = 'No residents & artists yet'; dropdown.appendChild(empty); return;
      }
      djList.forEach(function (dj) {
        var item = el('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid #222;transition:background .15s';
        item.innerHTML =
          (dj.image ? '<div style="width:32px;height:32px;border-radius:2px;background:#000 center/cover no-repeat;flex-shrink:0" style="background-image:url(' + esc(dj.image) + ')"></div>' :
           '<div style="width:32px;height:32px;border-radius:2px;background:#222;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#555;font-size:14px">♪</div>') +
          '<div><div style="font-family:var(--mono);font-size:13px;color:#fff">' + esc(dj.name) + '</div>' +
          '<div style="font-family:var(--mono);font-size:10px;color:var(--red);letter-spacing:.2em">' + esc(dj.role || '') + '</div></div>';
        if (dj.image) item.children[0].style.backgroundImage = 'url(' + esc(dj.image) + ')';
        item.addEventListener('mouseenter', function () { item.style.background = '#1a1a1a'; });
        item.addEventListener('mouseleave', function () { item.style.background = ''; });
        item.addEventListener('click', function () {
          selectedDJ = dj;
          pickerBtn.querySelector('span').style.color = '#fff';
          pickerBtn.querySelector('span').textContent = dj.name + (dj.role ? ' · ' + dj.role : '');
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
      });
    }
    buildDropdown();

    pickerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function () { dropdown.style.display = 'none'; });
    pickerWrap.appendChild(pickerBtn); pickerWrap.appendChild(dropdown);

    /* manual name input */
    var nameInp = el('input'); nameInp.type = 'text'; nameInp.placeholder = 'Or type artist name manually…';
    nameInp.style.cssText = 'width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #333;color:#fff;padding:9px 12px;font-family:var(--mono);font-size:13px;outline:none';

    var roleInp = el('input'); roleInp.type = 'text'; roleInp.placeholder = 'Role (optional, e.g. HEADLINER)';
    roleInp.style.cssText = 'width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #333;color:#fff;padding:9px 12px;font-family:var(--mono);font-size:13px;outline:none';

    var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:8px';
    var addBtn = el('button', 'btn btn--sm', 'ADD');
    addBtn.style.flex = '1';

    function doAdd() {
      var name = (selectedDJ ? selectedDJ.name : nameInp.value.trim());
      if (!name) return;
      var role = roleInp.value.trim() || (selectedDJ ? (selectedDJ.role || '') : '');
      lineup.push(role ? { name: name, role: role } : name);
      nameInp.value = ''; roleInp.value = '';
      selectedDJ = null;
      pickerBtn.querySelector('span').textContent = 'Select from residents & artists…';
      pickerBtn.querySelector('span').style.color = '';
      renderChips(); setDirty(true);
    }
    addBtn.addEventListener('click', doAdd);
    nameInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

    /* new DJ button */
    var newDjBtn = el('button', 'btn btn--sm', '+ NEW DJ');
    newDjBtn.addEventListener('click', function () { openNewDJModal(function (dj) {
      /* add to lineup automatically */
      lineup.push({ name: dj.name, role: dj.role || 'GUEST' });
      buildDropdown();
      renderChips(); setDirty(true);
    }); });

    btnRow.appendChild(addBtn); btnRow.appendChild(newDjBtn);
    addRow.appendChild(pickerWrap);
    addRow.appendChild(nameInp);
    addRow.appendChild(roleInp);
    addRow.appendChild(btnRow);
    wrap.appendChild(chips); wrap.appendChild(addRow);
    return wrap;
  }

  /* -------- New DJ modal (create DJ + add to C.djs) -------- */
  function openNewDJModal(onCreated) {
    var overlay = el('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px';
    var box = el('div');
    box.style.cssText = 'background:#111;border:1px solid #333;padding:32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;font-family:var(--mono)';
    box.innerHTML = '<div style="color:var(--red);font-size:11px;letter-spacing:3px;margin-bottom:20px">NEW DJ / ARTIST</div>';

    var dj = { name: '', role: 'GUEST', image: '', socials: {} };

    var g = el('div', 'grid cols-2');
    var fn = field('Name', ''); fn._input.addEventListener('input', function () { dj.name = fn._input.value; });
    var fr = field('Role / Status', 'GUEST'); fr._input.addEventListener('input', function () { dj.role = fr._input.value; }); dj.role = 'GUEST';
    g.appendChild(fn); g.appendChild(fr);
    box.appendChild(g);

    var imgF = mediaField('Photo', '', 'image/*', function (v) { dj.image = v; }, 'portrait');
    imgF.style.marginTop = '16px';
    box.appendChild(imgF);

    var socLabel = el('div'); socLabel.style.cssText = 'color:#666;font-size:10px;letter-spacing:2px;margin:18px 0 10px';
    socLabel.textContent = 'SOCIAL LINKS';
    box.appendChild(socLabel);
    var sg = el('div', 'grid cols-2');
    ['instagram', 'soundcloud', 'telegram', 'tiktok', 'youtube'].forEach(function (k) {
      var sf = field(k.charAt(0).toUpperCase() + k.slice(1), '');
      sf._input.placeholder = 'URL…';
      sf._input.style.fontFamily = 'var(--mono)'; sf._input.style.fontSize = '12px';
      sf._input.addEventListener('input', function () { dj.socials[k] = sf._input.value; });
      sg.appendChild(sf);
    });
    box.appendChild(sg);

    var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;margin-top:24px';
    var cancelBtn = el('button', 'btn btn--sm', 'CANCEL');
    var confirmBtn = el('button', 'btn btn--sm', 'CREATE DJ');
    confirmBtn.style.background = 'var(--red)';

    cancelBtn.addEventListener('click', function () { document.body.removeChild(overlay); });
    confirmBtn.addEventListener('click', function () {
      if (!dj.name.trim()) { toast('NAME REQUIRED'); return; }
      dj.name = dj.name.trim();
      C.djs.push(dj);
      document.body.removeChild(overlay);
      setDirty(true);
      /* save immediately so DJ is in DB */
      saveContent().then(function () {
        toast('DJ SAVED: ' + dj.name);
        setDirty(false);
        if (onCreated) onCreated(dj);
      }).catch(function (e) { toast('SAVE FAILED: ' + e.message); if (onCreated) onCreated(dj); });
    });

    btnRow.appendChild(cancelBtn); btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
    fn._input.focus();
  }

  /* -------- gallery editor (multi-photo) -------- */
  function galleryEditor(gallery) {
    var wrap = el('div');
    var grid = el('div'); grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px';

    function renderGrid() {
      grid.innerHTML = '';
      gallery.forEach(function (src, i) {
        var thumb = el('div');
        thumb.style.cssText = 'position:relative;width:80px;height:60px;background:#0a0a0a center/cover no-repeat;border:1px solid #333;flex-shrink:0';
        thumb.style.backgroundImage = 'url(' + src + ')';
        var del = el('button');
        del.textContent = '×'; del.style.cssText = 'position:absolute;top:2px;right:2px;background:var(--red);color:#fff;border:none;width:18px;height:18px;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center';
        del.addEventListener('click', function () { gallery.splice(i, 1); renderGrid(); setDirty(true); });
        thumb.appendChild(del); grid.appendChild(thumb);
      });
    }
    renderGrid();

    /* add by URL */
    var urlRow = el('div'); urlRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
    var urlInp = el('input'); urlInp.type = 'text'; urlInp.placeholder = 'Paste image URL…';
    urlInp.style.cssText = 'flex:1;background:#0a0a0a;border:1px solid #333;color:#fff;padding:7px 10px;font-family:var(--mono);font-size:12px;outline:none';
    var addUrlBtn = el('button', 'btn btn--sm', 'ADD URL');
    addUrlBtn.addEventListener('click', function () {
      var v = urlInp.value.trim(); if (!v) return;
      gallery.push(v); urlInp.value = ''; renderGrid(); setDirty(true);
    });
    urlRow.appendChild(urlInp); urlRow.appendChild(addUrlBtn);

    /* upload from disk (multiple) */
    var uploadRow = el('div'); uploadRow.style.cssText = 'display:flex;gap:6px;align-items:center';
    var uploadBtn = el('button', 'btn btn--sm', 'UPLOAD PHOTOS');
    var fileInp = el('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.hidden = true;
    var progress = el('span'); progress.style.cssText = 'font-family:var(--mono);font-size:11px;color:#888';
    uploadBtn.addEventListener('click', function () { fileInp.click(); });
    fileInp.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInp.files); if (!files.length) return;
      var done = 0;
      uploadBtn.disabled = true; progress.textContent = '0 / ' + files.length;
      files.forEach(function (file) {
        uploadFile(file, 'gallery').then(function (data) {
          gallery.push(data.url); done++;
          progress.textContent = done + ' / ' + files.length;
          if (done === files.length) { uploadBtn.disabled = false; progress.textContent = ''; renderGrid(); setDirty(true); }
        }).catch(function (e) {
          done++; toast('UPLOAD FAILED: ' + e.message);
          if (done === files.length) { uploadBtn.disabled = false; progress.textContent = ''; }
        });
      });
    });
    uploadRow.appendChild(uploadBtn); uploadRow.appendChild(fileInp); uploadRow.appendChild(progress);

    wrap.appendChild(grid); wrap.appendChild(urlRow); wrap.appendChild(uploadRow);
    return wrap;
  }

  function slugify(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('ev-' + Date.now());
  }

  function parseDateStr(s) { var p = (s || '').split('.'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(0); }

  function makeSortable(listEl, arr, onReorder) {
    var dragged = null;
    listEl.addEventListener('dragstart', function (e) {
      dragged = e.target.closest('.item');
      if (dragged) { setTimeout(function () { dragged.style.opacity = '.4'; }, 0); }
    });
    listEl.addEventListener('dragend', function () {
      if (dragged) { dragged.style.opacity = ''; dragged = null; }
      listEl.querySelectorAll('.item').forEach(function (el) { el.classList.remove('drag-over'); });
    });
    listEl.addEventListener('dragover', function (e) {
      e.preventDefault();
      var target = e.target.closest('.item');
      if (!target || target === dragged) return;
      listEl.querySelectorAll('.item').forEach(function (el) { el.classList.remove('drag-over'); });
      target.classList.add('drag-over');
      var items = Array.prototype.slice.call(listEl.querySelectorAll('.item'));
      var fromIdx = items.indexOf(dragged);
      var toIdx = items.indexOf(target);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      var moved = arr.splice(fromIdx, 1)[0];
      arr.splice(toIdx, 0, moved);
      if (fromIdx < toIdx) listEl.insertBefore(dragged, target.nextSibling);
      else listEl.insertBefore(dragged, target);
      setDirty(true);
    });
  }

  panels.events = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · ARCHIVE</div><div class="card__head"><div><h2>Past Events</h2><p>Last 5 events are shown on the main page. All events are accessible via /archive.html.</p></div></div>';
    var list = el('div');
    function render() {
      list.innerHTML = '';
      C.pastEvents.forEach(function (ev, i) {
        /* ensure required fields */
        if (!ev.id) ev.id = slugify(ev.name + '-' + ev.date);
        ev.lineup = ev.lineup || [];
        ev.gallery = ev.gallery || [];

        var body = el('div');

        /* row 1: name, date, city, venue */
        var g = el('div', 'grid cols-2');
        var f1 = field('Event name', ev.name); bind(f1._input, ev, 'name');
        var f2 = field('Date', ev.date, { mono: true, placeholder: 'DD.MM.YYYY' }); bind(f2._input, ev, 'date');
        var f3 = field('City', ev.city); bind(f3._input, ev, 'city');
        var f4 = field('Venue', ev.venue); bind(f4._input, ev, 'venue');
        var f5 = field('Doors / time', ev.doors, { mono: true }); bind(f5._input, ev, 'doors');
        var f6 = field('URL slug (auto)', ev.id, { mono: true }); bind(f6._input, ev, 'id');
        g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); g.appendChild(f4); g.appendChild(f5); g.appendChild(f6);
        body.appendChild(g);

        /* description */
        var desc = field('Description', ev.description || '', { textarea: true, rows: 3 });
        desc.style.marginTop = '16px';
        bind(desc._input, ev, 'description');
        body.appendChild(desc);

        /* cover photo */
        var img = mediaField('Cover photo', ev.image, 'image/*', function (v) { ev.image = v; }, 'gallery');
        img.style.marginTop = '16px'; body.appendChild(img);

        /* lineup */
        var luWrap = el('div', 'field'); luWrap.style.marginTop = '16px';
        luWrap.appendChild(el('label', null, 'LINE-UP'));
        luWrap.appendChild(lineupEditor(ev.lineup));
        body.appendChild(luWrap);

        /* gallery */
        var galWrap = el('div', 'field'); galWrap.style.marginTop = '16px';
        galWrap.appendChild(el('label', null, 'GALLERY (' + ev.gallery.length + ' photos)'));
        galWrap.appendChild(galleryEditor(ev.gallery));
        body.appendChild(galWrap);

        list.appendChild(repeatItem(i, ev.name + ' — ' + ev.date, (ev.lineup || []).length + ' artists', body, function () {
          C.pastEvents.splice(i, 1); render(); setDirty(true);
        }));
      });
    }
    render();
    makeSortable(list, C.pastEvents, render);

    var toolbar = el('div'); toolbar.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    var sortBtn = el('button', 'btn btn--sm btn--ghost', '↓ SORT BY DATE');
    sortBtn.addEventListener('click', function () {
      C.pastEvents.sort(function (a, b) { return parseDateStr(b.date) - parseDateStr(a.date); });
      render(); setDirty(true); toast('SORTED BY DATE');
    });
    toolbar.appendChild(sortBtn);

    var add = el('button', 'btn btn--full', '+ ADD PAST EVENT');
    add.addEventListener('click', function () {
      var ev = { id: '', name: 'COVEN', date: '', city: 'DUBAI', venue: '', doors: '', description: '', image: '', lineup: [], gallery: [] };
      ev.id = slugify(ev.name + '-' + Date.now());
      C.pastEvents.push(ev); render(); setDirty(true);
    });
    card.appendChild(toolbar); card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  panels.djs = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · THE CIRCLE</div><div class="card__head"><div><h2>Residents & Artists</h2></div></div>';
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
        ['instagram', 'soundcloud', 'telegram', 'tiktok', 'youtube'].forEach(function (k) {
          var sf = field(k.charAt(0).toUpperCase() + k.slice(1) + ' URL', dj.socials[k] || '', { mono: true });
          bind(sf._input, dj.socials, k); g2.appendChild(sf);
        });
        body.appendChild(g2);
        list.appendChild(repeatItem(i, dj.name, dj.role, body, function () { C.djs.splice(i, 1); render(); setDirty(true); }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD RESIDENT');
    add.addEventListener('click', function () { C.djs.push({ name: 'NEW DJ', role: 'RESIDENT', image: '', socials: { instagram: '#', soundcloud: '#' } }); render(); setDirty(true); });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  /* editable field with a suggest-dropdown populated from a list */
  function suggestField(labelText, value, getSuggestions, obj, key) {
    var f = el('div', 'field');
    f.appendChild(el('label', null, labelText));
    var wrap = el('div'); wrap.style.cssText = 'position:relative;display:flex;gap:0';

    var inp = el('input'); inp.type = 'text'; inp.value = value || '';
    inp.style.cssText = 'flex:1;border-right:none;border-radius:0';
    inp.addEventListener('input', function () { obj[key] = inp.value; setDirty(true); });

    var toggleBtn = el('button');
    toggleBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    toggleBtn.style.cssText = 'background:#0a0a0a;border:1px solid #333;border-left:none;padding:0 10px;color:#888;cursor:pointer;flex-shrink:0';

    var dropdown = el('div');
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#111;border:1px solid #444;border-top:none;z-index:50;max-height:200px;overflow-y:auto;display:none';

    function buildDropdown() {
      dropdown.innerHTML = '';
      var items = getSuggestions();
      if (!items.length) {
        var none = el('div'); none.style.cssText = 'padding:10px 12px;color:#555;font-family:var(--mono);font-size:12px';
        none.textContent = 'No suggestions'; dropdown.appendChild(none); return;
      }
      items.forEach(function (text) {
        var item = el('div'); item.textContent = text;
        item.style.cssText = 'padding:9px 12px;cursor:pointer;font-family:var(--mono);font-size:13px;border-bottom:1px solid #222;transition:background .15s';
        item.addEventListener('mouseenter', function () { item.style.background = '#1a1a1a'; });
        item.addEventListener('mouseleave', function () { item.style.background = ''; });
        item.addEventListener('click', function () {
          inp.value = text; obj[key] = text; setDirty(true);
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
      });
    }

    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      buildDropdown();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function () { dropdown.style.display = 'none'; });

    wrap.appendChild(inp); wrap.appendChild(toggleBtn); wrap.appendChild(dropdown);
    f.appendChild(wrap);
    f._input = inp;
    return f;
  }

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
        var f2 = suggestField('DJ', st.dj, function () { return (C.djs || []).map(function (d) { return d.name; }).filter(Boolean); }, st, 'dj');
        var f3 = suggestField('Event', st.event, function () { return (C.pastEvents || []).map(function (e) { return e.name; }).filter(Boolean); }, st, 'event');
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

    var bcard = el('div', 'card');
    bcard.innerHTML = '<div class="kick">BRAND</div><div class="card__head"><div><h2>Logo & Wordmark</h2><p>Paths to logo files (e.g. <code>/assets/logo.png</code> or uploaded URL).</p></div></div>';
    bcard.appendChild(mediaField('Logo', C.brand.logo, 'image/*', function (v) { C.brand.logo = v; }, 'thumbnail'));
    bcard.appendChild(mediaField('Wordmark', C.brand.wordmark, 'image/*', function (v) { C.brand.wordmark = v; }, 'thumbnail'));
    root.appendChild(bcard);
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
    djs: ['Residents & Artists', 'BLOCK 03'], sets: ['Audio Sets', 'PLAYER'],
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
