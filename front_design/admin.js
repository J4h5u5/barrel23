/* ============================================================
   BARREL 23 — Admin panel logic (functional mockup)
   Reads the same content.js model. Saves to localStorage so the
   live site reflects changes. Export/Import = JSON for your DB.
   ============================================================ */
(function () {
  var C = window.BARREL_loadContent();
  var dirty = false;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- dirty / save ---------- */
  var saveState = $('#savestate');
  function setDirty(d) {
    dirty = d;
    saveState.className = 'savestate ' + (d ? 'dirty' : 'saved');
    saveState.textContent = d ? '● UNSAVED CHANGES' : '✓ ALL SAVED';
  }
  function save() {
    window.BARREL_saveContent(C);
    setDirty(false);
    toast('SAVED — LIVE SITE UPDATED');
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* bind a simple input to a path in C, e.g. bind(input, C.hero, 'eventName') */
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

  function imgField(labelText, value, onChange) {
    var f = el('div', 'field');
    f.appendChild(el('label', null, labelText));
    var wrap = el('div', 'imgpick');
    var prev = el('div', 'imgpick__prev');
    prev.style.backgroundImage = value ? 'url(' + value + ')' : 'none';
    var col = el('div', 'imgpick__col');
    var input = el('input'); input.type = 'text'; input.value = value || ''; input.style.fontFamily = 'var(--mono)'; input.style.fontSize = '13px';
    var hint = el('div', 'hint', 'Path or URL · uploads handled by your backend');
    input.addEventListener('input', function () {
      prev.style.backgroundImage = input.value ? 'url(' + input.value + ')' : 'none';
      onChange(input.value); setDirty(true);
    });
    col.appendChild(input); col.appendChild(hint);
    wrap.appendChild(prev); wrap.appendChild(col);
    f.appendChild(wrap);
    return f;
  }

  /* chips editor (array of strings) */
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

  /* collapsible repeatable item */
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
    del.addEventListener('click', function () { onDelete(); });
    foot.appendChild(del); body.appendChild(foot);
    item.appendChild(bar); item.appendChild(body);
    return item;
  }

  /* ============================ PANELS ============================ */
  var panels = {};

  /* ---- DASHBOARD ---- */
  panels.dashboard = function (root) {
    var stats = el('div', 'stats');
    [['eventName', C.hero.eventName, 'NEXT EVENT', true],
     [C.pastEvents.length, null, 'PAST EVENTS'],
     [C.djs.length, null, 'RESIDENTS'],
     [C.sets.length, null, 'AUDIO SETS']].forEach(function (s, i) {
      var n = i === 0 ? C.hero.eventName : s[0];
      var st = el('div', 'stat', '<div class="n' + (i === 0 ? ' red' : '') + '" style="font-size:' + (i === 0 ? '30px' : '42px') + '">' + n + '</div><div class="l">' + s[2] + '</div>');
      stats.appendChild(st);
    });
    root.appendChild(stats);

    var pl = el('div', 'preview-link');
    pl.innerHTML = '<div><h3>Live site preview</h3><p>Open the public site in a new tab. Changes you save here apply immediately.</p></div>';
    var a = el('a', 'btn btn--primary', 'OPEN SITE ↗'); a.href = 'index.html'; a.target = '_blank';
    pl.appendChild(a);
    root.appendChild(pl);

    var note = el('div', 'card');
    note.innerHTML = '<div class="kick">HOW THIS WORKS</div><div class="card__head" style="margin:8px 0 14px"><h2>Content model</h2></div>';
    note.appendChild(el('div', 'note', 'This admin edits the same content model your backend will serve. ' +
      '<b>Save</b> writes to this browser so you can preview instantly. Use <b>Export JSON</b> to hand a content file to your API, ' +
      'and <b>Import JSON</b> to load one back. Image &amp; video uploads are stubbed here — wire them to your storage on the backend.'));
    root.appendChild(note);
  };

  /* ---- HERO ---- */
  panels.hero = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 01</div><div class="card__head"><div><h2>Hero & Countdown</h2><p>Headline event, target date for the live countdown, and looping background video.</p></div></div>';
    var g = el('div', 'grid cols-2');
    var fName = field('Event name', C.hero.eventName); bind(fName._input, C.hero, 'eventName');
    var fEd = field('Edition / label', C.hero.edition); bind(fEd._input, C.hero, 'edition');
    var fLoc = field('Location', C.hero.location); bind(fLoc._input, C.hero, 'location');
    var fTag = field('Tagline', C.hero.tagline); bind(fTag._input, C.hero, 'tagline');
    g.appendChild(fName); g.appendChild(fEd); g.appendChild(fLoc); g.appendChild(fTag);
    card.appendChild(g);

    var g2 = el('div', 'grid cols-2'); g2.style.marginTop = '18px';
    var fDate = field('Countdown target (date & time)', (C.hero.targetDate || '').slice(0, 16), { type: 'datetime-local' });
    fDate._input.addEventListener('input', function () { C.hero.targetDate = fDate._input.value + ':00'; setDirty(true); });
    g2.appendChild(fDate);
    card.appendChild(g2);

    card.appendChild(el('div', 'note', '<b>Strobe:</b> the live countdown flashes on every change — soft on seconds, stronger on minutes, strongest on hours &amp; days. A motion-reduce fallback is built in.'));
    root.appendChild(card);

    var vcard = el('div', 'card');
    vcard.innerHTML = '<div class="card__head"><div><h2>Background video</h2><p>Looping, muted, autoplay. MP4 recommended.</p></div></div>';
    var fv = imgField('Video file (mp4)', C.hero.video, function (v) { C.hero.video = v; });
    fv.querySelector('.imgpick__prev').style.backgroundImage = 'none';
    fv.querySelector('.imgpick__prev').innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--ink-mute);display:grid;place-items:center;height:100%">MP4</div>';
    vcard.appendChild(fv);
    root.appendChild(vcard);
  };

  /* ---- ANNOUNCE ---- */
  panels.announce = function (root) {
    var a = C.announce;
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 02</div><div class="card__head"><div><h2>Next Event Announcement</h2><p>The headline drop with facts, blurb and the tickets button.</p></div></div>';
    var g = el('div', 'grid cols-2');
    var f1 = field('Kicker', a.kicker); bind(f1._input, a, 'kicker');
    var f2 = field('Event name', a.eventName); bind(f2._input, a, 'eventName');
    var f3 = field('Date', a.date); bind(f3._input, a, 'date');
    var f4 = field('Doors / time', a.doors); bind(f4._input, a, 'doors');
    var f5 = field('City', a.city); bind(f5._input, a, 'city');
    var f6 = field('Venue', a.venue); bind(f6._input, a, 'venue');
    [f1, f2, f3, f4, f5, f6].forEach(function (f) { g.appendChild(f); });
    card.appendChild(g);
    var fb = field('Blurb', a.blurb, { textarea: true, rows: 4 }); bind(fb._input, a, 'blurb');
    fb.style.marginTop = '18px'; card.appendChild(fb);
    var g3 = el('div', 'grid cols-2'); g3.style.marginTop = '18px';
    var ft1 = field('Ticket button label', a.ticketLabel); bind(ft1._input, a, 'ticketLabel');
    var ft2 = field('Ticket URL', a.ticketUrl, { mono: true }); bind(ft2._input, a, 'ticketUrl');
    g3.appendChild(ft1); g3.appendChild(ft2); card.appendChild(g3);
    root.appendChild(card);

    /* line-up */
    var lcard = el('div', 'card');
    lcard.innerHTML = '<div class="card__head"><div><h2>Line-up</h2><p>Artists playing the next event, in order. Tag is optional — e.g. HEADLINE, B2B, LIVE. A “HEADLINE” tag highlights the act in red.</p></div></div>';
    a.lineup = a.lineup || [];
    var fl = field('Section label', a.lineupLabel || 'LINE-UP'); bind(fl._input, a, 'lineupLabel');
    fl.style.maxWidth = '260px'; fl.style.marginBottom = '18px'; lcard.appendChild(fl);
    var llist = el('div', 'lu-list');
    function renderLineup() {
      llist.innerHTML = '';
      a.lineup.forEach(function (act, i) {
        if (typeof act === 'string') { act = { name: act, tag: '' }; a.lineup[i] = act; }
        var row = el('div', 'lu-row');
        var handle = el('span', 'lu-no', (i < 9 ? '0' : '') + (i + 1));
        var nm = el('input', 'lu-in'); nm.type = 'text'; nm.value = act.name || ''; nm.placeholder = 'Artist name';
        nm.addEventListener('input', function () { act.name = nm.value; setDirty(true); });
        var tg = el('input', 'lu-in lu-in--tag'); tg.type = 'text'; tg.value = act.tag || ''; tg.placeholder = 'Tag (optional)';
        tg.addEventListener('input', function () { act.tag = tg.value; setDirty(true); });
        var up = el('button', 'lu-btn', '↑'); up.title = 'Move up';
        up.addEventListener('click', function () { if (i > 0) { a.lineup.splice(i - 1, 0, a.lineup.splice(i, 1)[0]); renderLineup(); setDirty(true); } });
        var dn = el('button', 'lu-btn', '↓'); dn.title = 'Move down';
        dn.addEventListener('click', function () { if (i < a.lineup.length - 1) { a.lineup.splice(i + 1, 0, a.lineup.splice(i, 1)[0]); renderLineup(); setDirty(true); } });
        var del = el('button', 'lu-btn lu-btn--danger', '×'); del.title = 'Remove';
        del.addEventListener('click', function () { a.lineup.splice(i, 1); renderLineup(); setDirty(true); });
        row.appendChild(handle); row.appendChild(nm); row.appendChild(tg);
        row.appendChild(up); row.appendChild(dn); row.appendChild(del);
        llist.appendChild(row);
      });
    }
    renderLineup();
    var addLn = el('button', 'btn btn--sm', '+ ADD ARTIST'); addLn.style.marginTop = '12px';
    addLn.addEventListener('click', function () { a.lineup.push({ name: '', tag: '' }); renderLineup(); setDirty(true); });
    lcard.appendChild(llist); lcard.appendChild(addLn);
    root.appendChild(lcard);

    /* carousel images */
    var icard = el('div', 'card');
    icard.innerHTML = '<div class="card__head"><div><h2>Carousel images</h2><p>Photos that cycle behind the announcement.</p></div></div>';
    var list = el('div');
    function renderImgs() {
      list.innerHTML = '';
      a.images.forEach(function (src, i) {
        var f = imgField('Image ' + (i + 1), src, function (v) { a.images[i] = v; });
        var del = el('button', 'btn btn--sm btn--danger', 'REMOVE'); del.style.marginTop = '8px';
        del.addEventListener('click', function () { a.images.splice(i, 1); renderImgs(); setDirty(true); });
        f.appendChild(del);
        f.style.marginBottom = '16px';
        list.appendChild(f);
      });
    }
    renderImgs();
    var add = el('button', 'btn btn--sm', '+ ADD IMAGE');
    add.addEventListener('click', function () { a.images.push(''); renderImgs(); setDirty(true); });
    icard.appendChild(list); icard.appendChild(add);
    root.appendChild(icard);
  };

  /* ---- PAST EVENTS ---- */
  panels.events = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · ARCHIVE</div><div class="card__head"><div><h2>Past Events</h2><p>Each card shows photo, date, name and lineup.</p></div></div>';
    var list = el('div');
    function render() {
      list.innerHTML = '';
      C.pastEvents.forEach(function (ev, i) {
        var body = el('div');
        var g = el('div', 'grid cols-2');
        var f1 = field('Event name', ev.name); bind(f1._input, ev, 'name');
        var f2 = field('Date', ev.date, { mono: true }); bind(f2._input, ev, 'date');
        var f3 = field('City', ev.city); bind(f3._input, ev, 'city');
        g.appendChild(f1); g.appendChild(f2); g.appendChild(f3);
        body.appendChild(g);
        var img = imgField('Photo', ev.image, function (v) { ev.image = v; }); img.style.marginTop = '16px';
        body.appendChild(img);
        var lu = el('div', 'field'); lu.style.marginTop = '16px';
        lu.appendChild(el('label', null, 'LINEUP'));
        ev.lineup = ev.lineup || [];
        lu.appendChild(chipsEditor(ev.lineup, 'Add DJ…'));
        body.appendChild(lu);
        list.appendChild(repeatItem(i, ev.name + ' — ' + ev.date, (ev.lineup || []).length + ' artists', body, function () {
          C.pastEvents.splice(i, 1); render(); setDirty(true);
        }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD PAST EVENT');
    add.addEventListener('click', function () {
      C.pastEvents.push({ name: 'COVEN', date: '01.01.2026', city: 'DUBAI', image: '', lineup: [] });
      render(); setDirty(true);
    });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  /* ---- DJs ---- */
  panels.djs = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">BLOCK 03 · THE CIRCLE</div><div class="card__head"><div><h2>Residents</h2><p>Portrait, name, role and social links.</p></div></div>';
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
        var img = imgField('Portrait', dj.image, function (v) { dj.image = v; }); img.style.marginTop = '16px';
        body.appendChild(img);
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

  /* ---- SETS ---- */
  panels.sets = function (root) {
    var card = el('div', 'card');
    card.innerHTML = '<div class="kick">MEDIA PLAYER</div><div class="card__head"><div><h2>Audio Sets</h2><p>Recorded sets for the floating player. Duration as MM:SS.</p></div></div>';
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
        g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); g.appendChild(f4);
        body.appendChild(g);
        body.appendChild(el('div', 'note', 'Audio file / stream URL is wired on your backend. The front-end player simulates playback in this mockup.'));
        list.appendChild(repeatItem(i, st.title, st.dj, body, function () { C.sets.splice(i, 1); render(); setDirty(true); }));
      });
    }
    render();
    var add = el('button', 'btn btn--full', '+ ADD SET');
    add.addEventListener('click', function () { C.sets.push({ title: 'NEW SET', dj: '', event: '', duration: 3600 }); render(); setDirty(true); });
    card.appendChild(list); card.appendChild(add);
    root.appendChild(card);
  };

  /* ---- ABOUT ---- */
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
    sf.appendChild(el('label', null, 'STYLES WE PLAY'));
    ab.styles = ab.styles || [];
    sf.appendChild(chipsEditor(ab.styles, 'Add style…'));
    card.appendChild(sf);
    root.appendChild(card);

    var scard = el('div', 'card');
    scard.innerHTML = '<div class="card__head"><div><h2>The Sound (Function-One)</h2></div></div>';
    var e1 = field('Heading', ab.equipment.heading); bind(e1._input, ab.equipment, 'heading'); scard.appendChild(e1);
    var e2 = field('Body', ab.equipment.body, { textarea: true, rows: 3 }); bind(e2._input, ab.equipment, 'body'); e2.style.marginTop = '16px'; scard.appendChild(e2);
    root.appendChild(scard);
  };

  /* ---- CONTACT / SOCIAL / SETTINGS ---- */
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
    ccard.appendChild(g2);
    root.appendChild(ccard);

    var ncard = el('div', 'card');
    ncard.innerHTML = '<div class="kick">NAVIGATION</div><div class="card__head"><div><h2>Top menu</h2><p>Hidden on the live site for now. Toggle to reveal.</p></div></div>';
    var toggle = el('label', 'field');
    var row = el('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '12px';
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!C.nav.enabled; cb.style.width = '18px'; cb.style.height = '18px'; cb.style.accentColor = '#ff2417';
    cb.addEventListener('change', function () { C.nav.enabled = cb.checked; setDirty(true); });
    row.appendChild(cb); row.appendChild(el('span', null, 'Show top navigation menu'));
    ncard.appendChild(row);
    var nf = el('div', 'field'); nf.style.marginTop = '16px';
    nf.appendChild(el('label', null, 'MENU ITEMS'));
    C.nav.items = C.nav.items || [];
    nf.appendChild(chipsEditor(C.nav.items, 'Add menu item…'));
    ncard.appendChild(nf);
    var bf = field('Brand / wordmark name', C.brand.name); bind(bf._input, C.brand, 'name'); bf.style.marginTop = '16px';
    ncard.appendChild(bf);
    root.appendChild(ncard);
  };

  /* ============================ NAV / ROUTER ============================ */
  var current = 'dashboard';
  var titles = {
    dashboard: ['Dashboard', 'OVERVIEW'], hero: ['Hero & Countdown', 'BLOCK 01'],
    announce: ['Next Event', 'BLOCK 02'], events: ['Past Events', 'BLOCK 03'],
    djs: ['Residents', 'BLOCK 03'], sets: ['Audio Sets', 'PLAYER'],
    about: ['About', 'BLOCK 04'], settings: ['Contacts & Settings', 'FOOTER']
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

  /* ---- top actions ---- */
  $('#btn-save').addEventListener('click', save);
  $('#btn-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a'); a.href = url; a.download = 'barrel23-content.json'; a.click();
    URL.revokeObjectURL(url); toast('EXPORTED barrel23-content.json');
  });
  $('#imp-file').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try { var o = JSON.parse(r.result); C = Object.assign(C, o); window.BARREL_saveContent(C); route(current); setDirty(false); toast('IMPORTED — SAVED'); }
      catch (err) { toast('INVALID JSON'); }
    };
    r.readAsText(file);
  });
  $('#btn-reset').addEventListener('click', function () {
    if (confirm('Reset all content to defaults? This clears saved changes in this browser.')) {
      localStorage.removeItem('barrel23_content');
      C = window.BARREL_loadContent(); route(current); setDirty(false); toast('RESET TO DEFAULTS');
    }
  });

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  setDirty(false);
  route('dashboard');
})();
