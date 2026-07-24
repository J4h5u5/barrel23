/* Server-backed mailbox for the BARREL 23 admin. */
window.BARREL_registerMailPanel = function (api) {
  var el = api.el;
  var toast = api.toast;
  var apiFetch = api.apiFetch;
  var rootEl = null;
  var savedListWidth = Number(localStorage.getItem('barrel23_mail_list_width'));
  var state = {
    accounts: [], accountId: null, folders: [], folder: 'INBOX', messages: [], selected: null,
    loading: false, error: '', messageCache: {}, listWidth: savedListWidth >= 280 && savedListWidth <= 900 ? savedListWidth : 340
  };

  function esc(value) {
    return (value == null ? '' : String(value)).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function request(path, options) {
    options = options || {};
    return apiFetch(path, options).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (error) {}
        if (!response.ok) throw new Error(data.detail || 'Mail request failed');
        return data;
      });
    });
  }

  function account() {
    return state.accounts.filter(function (item) { return item.id === state.accountId; })[0] || null;
  }

  function initials(value) {
    var parts = (value || '?').trim().split(/\s+/);
    return ((parts[0][0] || '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function relTime(iso) {
    if (!iso) return '';
    var seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seconds < 60) return 'now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function fullDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderLoading(text) {
    rootEl.innerHTML = '<div class="mail-loading">' + esc(text || 'LOADING MAILBOX') + '</div>';
  }

  function loadAccounts() {
    renderLoading('LOADING MAILBOXES');
    request('/api/mail/accounts').then(function (data) {
      state.accounts = data.accounts || [];
      if (!state.accounts.length) { renderNoMailbox(); return; }
      var selectedStillExists = state.accounts.some(function (item) { return item.id === state.accountId && !item.broken; });
      if (!selectedStillExists) {
        var defaultAccount = state.accounts.filter(function (item) { return item.is_default && !item.broken; })[0];
        state.accountId = (defaultAccount || state.accounts.filter(function (item) { return !item.broken; })[0]).id;
      }
      loadMailbox();
    }).catch(function (error) { renderError(error.message); });
  }

  function loadMailbox(refreshFolders) {
    state.loading = true;
    state.error = '';
    state.selected = null;
    renderMailbox();
    var id = encodeURIComponent(state.accountId);
    var includeFolders = refreshFolders === true || !state.folders.length;
    request('/api/mail/accounts/' + id + '/mailbox?folder=' + encodeURIComponent(state.folder) + '&include_folders=' + includeFolders).then(function (mailbox) {
      if (mailbox.folders && mailbox.folders.length) state.folders = mailbox.folders;
      state.folder = mailbox.folder || state.folder;
      state.messages = mailbox.messages || [];
      state.loading = false;
      renderMailbox();
    }).catch(function (error) {
      state.loading = false;
      state.error = error.message;
      renderMailbox();
    });
  }

  function renderError(message) {
    rootEl.innerHTML = '';
    var card = el('div', 'card mail-setup');
    card.innerHTML = '<div class="kick">MAILBOX</div><div class="card__head"><div><h2>Mailbox unavailable</h2><p>' + esc(message) + '</p></div></div>';
    var retry = el('button', 'btn btn--primary', 'RETRY');
    retry.addEventListener('click', loadAccounts);
    card.appendChild(retry);
    rootEl.appendChild(card);
  }

  function renderNoMailbox() {
    rootEl.innerHTML = '';
    var card = el('div', 'card mail-setup');
    card.innerHTML = '<div class="kick">MAILBOX</div><div class="card__head"><div><h2>No mailbox configured</h2><p>Set the default mailbox in the server environment, or add another mailbox below. Passwords are stored only on the server.</p></div></div>';
    var add = el('button', 'btn btn--primary', '+ ADD MAILBOX');
    add.addEventListener('click', renderAccountForm);
    card.appendChild(add);
    rootEl.appendChild(card);
  }

  function renderMailbox() {
    var active = account();
    if (!active) { renderNoMailbox(); return; }
    rootEl.innerHTML = '';
    var toolbar = el('div', 'mail-toolbar');
    var select = el('select', 'mail-select');
    state.accounts.forEach(function (item) {
      var option = el('option');
      option.value = item.id;
      option.textContent = item.display_name + ' <' + item.email + '>' + (item.is_default ? ' (DEFAULT)' : '') + (item.broken ? ' (UNAVAILABLE)' : '');
      option.disabled = !!item.broken;
      option.selected = item.id === state.accountId;
      select.appendChild(option);
    });
    select.addEventListener('change', function () { state.accountId = select.value; state.folders = []; state.messages = []; loadMailbox(true); });
    toolbar.appendChild(select);
    var test = el('button', 'btn btn--sm', 'TEST CONNECTION');
    test.disabled = state.loading;
    test.addEventListener('click', function () {
      test.disabled = true; test.textContent = 'TESTING...';
      request('/api/mail/accounts/' + encodeURIComponent(state.accountId) + '/test', { method: 'POST' })
        .then(function () { toast('MAILBOX CONNECTED'); })
        .catch(function (error) { toast(error.message); })
        .finally(function () { test.disabled = false; test.textContent = 'TEST CONNECTION'; });
    });
    toolbar.appendChild(test);
    var spacer = el('span', 'spacer'); toolbar.appendChild(spacer);
    var add = el('button', 'btn btn--primary btn--sm', '+ ADD MAILBOX');
    add.addEventListener('click', renderAccountForm);
    toolbar.appendChild(add);
    rootEl.appendChild(toolbar);

    var app = el('div', 'mail-app' + (state.selected ? ' reading' : ''));
    app.style.setProperty('--mail-list-width', state.listWidth + 'px');
    var folders = el('div', 'mail-col mail-col--folders');
    var accountCard = el('div', 'mail-account');
    accountCard.innerHTML = '<div class="mail-account__email">' + esc(active.email) + '</div><div class="mail-account__host">IMAP ' + esc(active.imap_host || '') + ':' + esc(active.imap_port || '') + '</div>';
    folders.appendChild(accountCard);
    var compose = el('button', 'btn btn--primary mail-compose', 'COMPOSE');
    compose.disabled = state.loading;
    compose.addEventListener('click', function () { openCompose(); });
    folders.appendChild(compose);
    var folderList = el('div', 'mail-col__scroll');
    (state.folders || []).forEach(function (folder) {
      var count = state.folder === folder.id ? state.messages.length : '';
      var button = el('button', 'mail-folder' + (state.folder === folder.id ? ' active' : ''), '<span>' + esc(folder.label) + '</span>' + (count !== '' ? '<span class="badge">' + count + '</span>' : ''));
      button.addEventListener('click', function () { if (state.folder !== folder.id) { state.folder = folder.id; loadMailbox(false); } });
      folderList.appendChild(button);
    });
    folders.appendChild(folderList);
    app.appendChild(folders);

    var listColumn = el('div', 'mail-col mail-col--list');
    var currentFolder = state.folders.filter(function (folder) { return folder.id === state.folder; })[0] || { label: 'Mailbox' };
    listColumn.appendChild(el('div', 'mail-col__head', '<h3>' + esc(currentFolder.label) + '</h3><span class="cnt">' + (state.loading ? '...' : state.messages.length + ' MSG') + '</span>'));
    var list = el('div', 'mail-col__scroll');
    if (state.loading) list.appendChild(el('div', 'mail-loading', 'LOADING MESSAGES'));
    else if (state.error) list.appendChild(el('div', 'mail-empty', esc(state.error)));
    else if (!state.messages.length) list.appendChild(el('div', 'mail-empty', 'NO MESSAGES'));
    else state.messages.forEach(function (message) {
      var sender = message.from && (message.from.name || message.from.email) || 'Unknown sender';
      var button = el('button', 'mail-msg' + (message.unread ? ' unread' : '') + (state.selected && state.selected.id === message.id ? ' active' : ''),
        '<div class="mail-msg__top"><span class="mail-msg__from">' + esc(sender) + '</span><span class="mail-msg__time">' + esc(relTime(message.date)) + '</span></div><div class="mail-msg__subject">' + esc(message.subject) + '</div><div class="mail-msg__to">' + esc(message.to || (message.from && message.from.email) || '') + '</div>');
      button.addEventListener('click', function () { readMessage(message); });
      list.appendChild(button);
    });
    listColumn.appendChild(list);
    app.appendChild(listColumn);

    var splitter = el('div', 'mail-splitter');
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-label', 'Resize message list');
    setupSplitter(app, splitter);
    app.appendChild(splitter);

    var reader = el('div', 'mail-col mail-col--reader');
    renderReader(reader);
    app.appendChild(reader);
    rootEl.appendChild(app);
  }

  function setupSplitter(app, splitter) {
    splitter.addEventListener('pointerdown', function (event) {
      if (window.innerWidth <= 1100) return;
      event.preventDefault();
      splitter.classList.add('dragging');
      var rect = app.getBoundingClientRect();
      var folderWidth = 200;
      var splitterWidth = 12;
      var minimumReaderWidth = 520;

      function move(pointerEvent) {
        var maximum = Math.max(280, app.clientWidth - folderWidth - splitterWidth - minimumReaderWidth);
        state.listWidth = Math.min(maximum, Math.max(280, pointerEvent.clientX - rect.left - folderWidth));
        app.style.setProperty('--mail-list-width', state.listWidth + 'px');
      }

      function stop() {
        splitter.classList.remove('dragging');
        localStorage.setItem('barrel23_mail_list_width', String(Math.round(state.listWidth)));
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
      }

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop);
    });
  }

  function renderReader(reader) {
    var message = state.selected;
    if (!message) {
      reader.innerHTML = '<div class="mail-reader-empty">SELECT A MESSAGE TO READ</div>';
      return;
    }
    if (!message.body && state.loadingMessage) {
      reader.innerHTML = '<div class="mail-reader-empty">LOADING MESSAGE</div>';
      return;
    }
    var sender = message.from || {};
    var wrap = el('div', 'mail-reader');
    var back = el('button', 'btn btn--ghost btn--sm', 'BACK');
    back.style.marginBottom = '16px';
    back.addEventListener('click', function () { state.selected = null; renderMailbox(); });
    wrap.appendChild(back);
    var header = el('div');
    header.innerHTML = '<h2 class="mail-reader__subject">' + esc(message.subject) + '</h2><div class="mail-reader__meta"><div class="mail-avatar">' + esc(initials(sender.name || sender.email)) + '</div><div class="mail-reader__who"><div class="name">' + esc(sender.name || sender.email || 'Unknown sender') + '</div><div class="email">' + esc(sender.email || '') + '</div></div><div class="mail-reader__date">' + esc(fullDate(message.date)) + '</div></div>';
    wrap.appendChild(header);
    var body = el('div', 'mail-reader__body');
    body.textContent = message.body || '(No text content)';
    wrap.appendChild(body);
    var actions = el('div', 'mail-reader__actions');
    var reply = el('button', 'btn btn--primary', 'REPLY');
    reply.addEventListener('click', function () { openCompose({ mode: 'reply', message: message }); });
    var forward = el('button', 'btn', 'FORWARD');
    forward.addEventListener('click', function () { openCompose({ mode: 'forward', message: message }); });
    actions.appendChild(reply); actions.appendChild(forward);
    wrap.appendChild(actions);
    reader.appendChild(wrap);
  }

  function readMessage(summary) {
    var cacheKey = state.accountId + ':' + state.folder + ':' + summary.id;
    if (state.messageCache[cacheKey]) {
      state.selected = state.messageCache[cacheKey];
      state.loadingMessage = false;
      renderMailbox();
      return;
    }
    state.selected = summary;
    state.loadingMessage = true;
    renderMailbox();
    request('/api/mail/accounts/' + encodeURIComponent(state.accountId) + '/messages/' + encodeURIComponent(summary.id) + '?folder=' + encodeURIComponent(state.folder))
      .then(function (message) { state.messageCache[cacheKey] = message; state.selected = message; state.loadingMessage = false; renderMailbox(); })
      .catch(function (error) { state.loadingMessage = false; toast(error.message); renderMailbox(); });
  }

  function renderAccountForm() {
    rootEl.innerHTML = '';
    var card = el('div', 'card mail-setup');
    card.innerHTML = '<div class="kick">NEW MAILBOX</div><div class="card__head"><div><h2>Add another mailbox</h2><p>The connection is checked before saving. Its password is encrypted on the server and is never saved in your browser.</p></div></div>';
    var values = { display_name: '', email: '', password: '', imap_host: 'imap.purelymail.com', imap_port: 993, imap_security: 'ssl_tls', smtp_host: 'smtp.purelymail.com', smtp_port: 465, smtp_security: 'ssl_tls' };
    function input(label, key, options) {
      options = options || {};
      var field = el('div', 'field' + (options.mono ? ' field--mono' : ''));
      field.appendChild(el('label', null, label));
      var node = el('input'); node.type = options.type || 'text'; node.value = values[key];
      if (options.placeholder) node.placeholder = options.placeholder;
      node.addEventListener('input', function () { values[key] = node.type === 'number' ? Number(node.value) : node.value; });
      field.appendChild(node);
      return field;
    }
    var first = el('div', 'grid cols-2');
    first.appendChild(input('Display name', 'display_name', { placeholder: 'BARREL 23' }));
    first.appendChild(input('Email address', 'email', { type: 'email', mono: true, placeholder: 'you@barrel23.com' }));
    card.appendChild(first);
    card.appendChild(input('Password / app password', 'password', { type: 'password', mono: true, placeholder: 'Stored encrypted on the server' }));
    var imap = el('div', 'card'); imap.style.marginTop = '18px'; imap.innerHTML = '<div class="card__head"><div><h2>Incoming mail (IMAP)</h2></div></div>';
    var imapGrid = el('div', 'grid cols-3'); imapGrid.appendChild(input('Host', 'imap_host', { mono: true })); imapGrid.appendChild(input('Port', 'imap_port', { type: 'number', mono: true }));
    var imapSecurity = selectField('Security', 'imap_security'); imapGrid.appendChild(imapSecurity); imap.appendChild(imapGrid);
    var smtp = el('div', 'card'); smtp.style.marginTop = '18px'; smtp.innerHTML = '<div class="card__head"><div><h2>Outgoing mail (SMTP)</h2></div></div>';
    var smtpGrid = el('div', 'grid cols-3'); smtpGrid.appendChild(input('Host', 'smtp_host', { mono: true })); smtpGrid.appendChild(input('Port', 'smtp_port', { type: 'number', mono: true }));
    var smtpSecurity = selectField('Security', 'smtp_security'); smtpGrid.appendChild(smtpSecurity); smtp.appendChild(smtpGrid);
    var actions = el('div'); actions.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:18px';
    var save = el('button', 'btn btn--primary', 'VERIFY & ADD MAILBOX');
    save.addEventListener('click', function () {
      save.disabled = true; save.textContent = 'VERIFYING...';
      request('/api/mail/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
        .then(function (newAccount) { state.accounts.push(newAccount); state.accountId = newAccount.id; state.folder = 'INBOX'; toast('MAILBOX ADDED'); loadMailbox(); })
        .catch(function (error) { toast(error.message); save.disabled = false; save.textContent = 'VERIFY & ADD MAILBOX'; });
    });
    var cancel = el('button', 'btn', 'CANCEL');
    cancel.addEventListener('click', function () { state.accounts.length ? renderMailbox() : renderNoMailbox(); });
    actions.appendChild(save); actions.appendChild(cancel);
    rootEl.appendChild(card); rootEl.appendChild(imap); rootEl.appendChild(smtp); rootEl.appendChild(actions);

    function selectField(label, key) {
      var field = el('div', 'field'); field.appendChild(el('label', null, label));
      var node = el('select'); [['ssl_tls', 'SSL/TLS'], ['starttls', 'STARTTLS']].forEach(function (option) { var item = el('option'); item.value = option[0]; item.textContent = option[1]; node.appendChild(item); });
      node.value = values[key]; node.addEventListener('change', function () { values[key] = node.value; }); field.appendChild(node); return field;
    }
  }

  function openCompose(options) {
    options = options || {};
    var message = options.message || null;
    var active = account();
    var to = '', subject = '', body = '';
    if (options.mode === 'reply' && message) {
      to = message.from && message.from.email || '';
      subject = /^re:/i.test(message.subject || '') ? message.subject : 'Re: ' + (message.subject || '');
      body = '\n\n--- On ' + fullDate(message.date) + ', ' + ((message.from && message.from.name) || '') + ' wrote:\n' + (message.body || '').replace(/^/gm, '> ');
    }
    if (options.mode === 'forward' && message) {
      subject = /^fwd:/i.test(message.subject || '') ? message.subject : 'Fwd: ' + (message.subject || '');
      body = '\n\n--- Forwarded message ---\nFrom: ' + ((message.from && message.from.email) || '') + '\nSubject: ' + (message.subject || '') + '\n\n' + (message.body || '');
    }
    var backdrop = el('div', 'mail-modal-backdrop');
    var modal = el('div', 'mail-modal');
    modal.innerHTML =
      '<div class="mail-modal__bar"><h3>' + (options.mode === 'reply' ? 'Reply' : options.mode === 'forward' ? 'Forward' : 'New message') + '</h3><button class="mail-modal__close" title="Close">x</button></div>' +
      '<div class="mail-compose-fields"><div class="mail-compose-row"><label>FROM</label><input readonly value="' + esc((active.display_name || '') + ' <' + active.email + '>') + '"></div><div class="mail-compose-row"><label>TO</label><input class="mail-to" placeholder="recipient@email.com" value="' + esc(to) + '"></div><div class="mail-compose-row"><label>SUBJECT</label><input class="mail-subject" placeholder="Subject" value="' + esc(subject) + '"></div></div>' +
      '<div class="mail-compose-toolbar"><button class="mail-format-btn" data-command="bold" title="Bold"><b>B</b></button><button class="mail-format-btn" data-command="italic" title="Italic"><i>I</i></button><button class="mail-format-btn" data-command="underline" title="Underline"><u>U</u></button><button class="mail-format-btn" data-command="insertUnorderedList" title="Bulleted list">LIST</button><button class="mail-format-btn" data-action="link" title="Add link">LINK</button><button class="mail-format-btn" data-action="attach" title="Attach files">ATTACH</button><input class="mail-attachment-input" type="file" multiple></div>' +
      '<div class="mail-attachments"></div><div class="mail-compose-body" contenteditable="true" data-placeholder="Write your message..."></div>' +
      '<div class="mail-modal__foot"><button class="btn btn--primary mail-send">SEND</button><span class="spacer"></span><span class="mail-via">SMTP ' + esc(active.smtp_host || '') + ':' + esc(active.smtp_port || '') + '</span></div>';
    var editor = modal.querySelector('.mail-compose-body');
    editor.textContent = body;
    var attachments = [];

    function renderAttachments() {
      var list = modal.querySelector('.mail-attachments');
      list.innerHTML = '';
      attachments.forEach(function (file, index) {
        var item = el('div', 'mail-attachment');
        item.innerHTML = '<span>' + esc(file.name) + ' (' + Math.ceil(file.size / 1024) + ' KB)</span>';
        var remove = el('button', null, 'x');
        remove.title = 'Remove attachment';
        remove.addEventListener('click', function () { attachments.splice(index, 1); renderAttachments(); });
        item.appendChild(remove);
        list.appendChild(item);
      });
    }

    modal.querySelector('.mail-compose-toolbar').addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var action = button.dataset.action;
      if (action === 'attach') {
        modal.querySelector('.mail-attachment-input').click();
        return;
      }
      editor.focus();
      if (action === 'link') {
        var href = window.prompt('Link URL');
        if (href) document.execCommand('createLink', false, href);
        return;
      }
      if (button.dataset.command) document.execCommand(button.dataset.command, false, null);
    });
    modal.querySelector('.mail-attachment-input').addEventListener('change', function (event) {
      var files = Array.prototype.slice.call(event.target.files || []);
      if (attachments.length + files.length > 10) { toast('ATTACH UP TO 10 FILES'); return; }
      attachments = attachments.concat(files);
      event.target.value = '';
      renderAttachments();
    });
    function close() { backdrop.classList.remove('open'); setTimeout(function () { backdrop.remove(); }, 200); }
    modal.querySelector('.mail-modal__close').addEventListener('click', close);
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) close(); });
    modal.querySelector('.mail-send').addEventListener('click', function (event) {
      var button = event.currentTarget;
      var payload = new FormData();
      payload.append('to', modal.querySelector('.mail-to').value.trim());
      payload.append('subject', modal.querySelector('.mail-subject').value.trim());
      payload.append('body_text', editor.innerText);
      payload.append('body_html', editor.innerHTML);
      attachments.forEach(function (file) { payload.append('attachments', file, file.name); });
      button.disabled = true; button.textContent = 'SENDING...';
      request('/api/mail/accounts/' + encodeURIComponent(state.accountId) + '/send', { method: 'POST', body: payload })
        .then(function (result) { close(); toast(result.saved_to_sent ? 'MESSAGE SENT' : 'MESSAGE SENT (NOT SAVED TO SENT)'); if ((state.folder || '').toLowerCase().indexOf('sent') !== -1) loadMailbox(); })
        .catch(function (error) { toast(error.message); button.disabled = false; button.textContent = 'SEND'; });
    });
    backdrop.appendChild(modal); document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('open'); (options.mode === 'reply' ? editor : modal.querySelector('.mail-to')).focus(); });
  }

  return function (root) { rootEl = root; loadAccounts(); };
};
