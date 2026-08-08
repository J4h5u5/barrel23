/* Server-backed mailbox for the BARREL 23 admin. */
window.BARREL_registerMailPanel = function (api) {
  var el = api.el;
  var toast = api.toast;
  var apiFetch = api.apiFetch;
  var rootEl = null;
  var savedListWidth = Number(localStorage.getItem('barrel23_mail_list_width'));
  var state = {
    accounts: [], accountId: null, folders: [], folder: 'INBOX', messages: [], selected: null,
    loading: false, loadingOlder: false, error: '', messageCache: {}, messageTotal: 0, listScroll: {}, listWidth: savedListWidth >= 280 && savedListWidth <= 900 ? savedListWidth : 340
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

  function mailboxScrollKey(accountId, folder) {
    return (accountId || state.accountId || '') + ':' + (folder || state.folder || 'INBOX');
  }

  function rememberListScroll() {
    if (!rootEl) return;
    var list = rootEl.querySelector('.mail-col--list .mail-col__scroll');
    if (list) state.listScroll[list.dataset.mailboxKey || mailboxScrollKey()] = list.scrollTop;
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

  function fileSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
  }

  function attachmentKind(attachment) {
    var type = (attachment.content_type || '').toLowerCase();
    var name = (attachment.filename || '').toLowerCase();
    if (type.indexOf('image/') === 0 || /\.(avif|gif|jpe?g|png|webp)$/i.test(name)) return 'image';
    if (type.indexOf('audio/') === 0 || /\.(aac|flac|m4a|mp3|ogg|opus|wav)$/i.test(name)) return 'audio';
    if (type.indexOf('video/') === 0 || /\.(m4v|mov|mp4|webm)$/i.test(name)) return 'video';
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
    return 'file';
  }

  function attachmentUrl(message, attachment) {
    var id = String(attachment.id);
    message._attachmentUrls = message._attachmentUrls || {};
    message._attachmentRequests = message._attachmentRequests || {};
    if (message._attachmentUrls[id]) return Promise.resolve(message._attachmentUrls[id]);
    if (message._attachmentRequests[id]) return message._attachmentRequests[id];
    var path = '/api/mail/accounts/' + encodeURIComponent(state.accountId) + '/messages/' + encodeURIComponent(message.id) +
      '/attachments/' + encodeURIComponent(attachment.id) + '?folder=' + encodeURIComponent(state.folder);
    message._attachmentRequests[id] = apiFetch(path).then(function (response) {
      if (response.ok) return response.blob();
      return response.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (error) {}
        throw new Error(data.detail || 'Could not load attachment');
      });
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      message._attachmentUrls[id] = url;
      delete message._attachmentRequests[id];
      return url;
    }).catch(function (error) {
      delete message._attachmentRequests[id];
      throw error;
    });
    return message._attachmentRequests[id];
  }

  function appendLinkifiedText(container, value) {
    var text = value || '(No text content)';
    var pattern = /<(https?:\/\/[^<>\s]+)>|\b(?:https?:\/\/|www\.)[^\s<>"']+|\*\*[^*\r\n]+\*\*|\*[^*\r\n]+\*/gi;
    var cursor = 0;
    var match;
    while ((match = pattern.exec(text))) {
      container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      var token = match[0];
      if (token.charAt(0) === '*') {
        var doubleMarker = token.slice(0, 2) === '**';
        var emphasis = document.createElement(doubleMarker ? 'strong' : 'em');
        emphasis.className = doubleMarker ? 'mail-strong' : 'mail-emphasis';
        emphasis.textContent = token.slice(doubleMarker ? 2 : 1, doubleMarker ? -2 : -1);
        container.appendChild(emphasis);
      } else {
        var wrapped = token.charAt(0) === '<';
        var visible = wrapped ? token.slice(1, -1) : token.replace(/[.,;:!?]+$/, '');
        var trailing = wrapped ? '' : token.slice(visible.length);
        var href = visible.indexOf('www.') === 0 ? 'https://' + visible : visible;
        var link = document.createElement('a');
        link.className = 'mail-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = visible;
        container.appendChild(link);
        if (trailing) container.appendChild(document.createTextNode(trailing));
      }
      cursor = pattern.lastIndex;
    }
    container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function openMediaPreview(url, attachment, kind) {
    var backdrop = el('div', 'mail-preview-backdrop');
    var preview = el('div', 'mail-preview');
    var close = el('button', 'mail-preview__close', 'x');
    close.title = 'Close preview';
    close.addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) backdrop.remove(); });
    preview.appendChild(close);
    preview.appendChild(el('div', 'mail-preview__name', esc(attachment.filename)));
    var media = document.createElement(kind === 'image' ? 'img' : kind === 'video' ? 'video' : kind === 'pdf' ? 'iframe' : 'audio');
    media.src = url;
    if (kind !== 'image') media.controls = true;
    if (kind === 'video') media.preload = 'metadata';
    if (kind === 'pdf') {
      media.title = attachment.filename || 'PDF preview';
      media.setAttribute('referrerpolicy', 'no-referrer');
    } else {
      media.alt = attachment.filename || 'Attachment preview';
    }
    preview.appendChild(media);
    backdrop.appendChild(preview);
    document.body.appendChild(backdrop);
  }

  function downloadAttachment(message, attachment) {
    attachmentUrl(message, attachment).then(function (url) {
      var link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }).catch(function (error) { toast(error.message); });
  }

  function renderAttachments(message) {
    var attachments = message.attachments || [];
    if (!attachments.length) return null;
    var section = el('section', 'mail-received-attachments');
    section.appendChild(el('div', 'mail-received-attachments__title', 'ATTACHMENTS · ' + attachments.length));
    var list = el('div', 'mail-received-attachments__list');
    attachments.forEach(function (attachment) {
      var kind = attachmentKind(attachment);
      var item = el('article', 'mail-received-file mail-received-file--' + kind);
      item.innerHTML = '<div class="mail-received-file__type">' + esc(kind.toUpperCase()) + '</div><div class="mail-received-file__info"><strong>' + esc(attachment.filename || 'attachment') + '</strong><span>' + esc(attachment.content_type || 'file') + ' · ' + esc(fileSize(attachment.size)) + '</span></div>';
      var actions = el('div', 'mail-received-file__actions');
      if (kind !== 'file') {
        var previewLabel = kind === 'image' ? 'VIEW' : kind === 'pdf' ? 'VIEW PDF' : 'PLAY';
        var preview = el('button', 'btn btn--sm', previewLabel);
        preview.addEventListener('click', function () {
          preview.disabled = true;
          preview.textContent = 'LOADING...';
          attachmentUrl(message, attachment).then(function (url) {
            openMediaPreview(url, attachment, kind);
          }).catch(function (error) { toast(error.message); }).finally(function () {
            preview.disabled = false;
            preview.textContent = previewLabel;
          });
        });
        actions.appendChild(preview);
      }
      var download = el('button', 'btn btn--ghost btn--sm', 'DOWNLOAD');
      download.addEventListener('click', function () { downloadAttachment(message, attachment); });
      actions.appendChild(download);
      item.appendChild(actions);
      list.appendChild(item);
    });
    section.appendChild(list);
    return section;
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
    state.loadingOlder = false;
    state.error = '';
    state.selected = null;
    renderMailbox();
    var id = encodeURIComponent(state.accountId);
    var includeFolders = refreshFolders === true || !state.folders.length;
    request('/api/mail/accounts/' + id + '/mailbox?folder=' + encodeURIComponent(state.folder) + '&include_folders=' + includeFolders).then(function (mailbox) {
      if (mailbox.folders && mailbox.folders.length) state.folders = mailbox.folders;
      state.folder = mailbox.folder || state.folder;
      state.messages = mailbox.messages || [];
      state.messageTotal = Number(mailbox.message_total) || state.messages.length;
      state.loading = false;
      renderMailbox();
    }).catch(function (error) {
      state.loading = false;
      state.error = error.message;
      renderMailbox();
    });
  }

  function loadOlderMessages() {
    if (state.loading || state.loadingOlder || state.messages.length >= state.messageTotal) return;
    state.loadingOlder = true;
    var accountId = state.accountId;
    var folder = state.folder;
    var offset = state.messages.length;
    renderMailbox();
    request('/api/mail/accounts/' + encodeURIComponent(accountId) + '/mailbox?folder=' + encodeURIComponent(folder) + '&include_folders=false&limit=50&offset=' + offset)
      .then(function (mailbox) {
        if (state.accountId !== accountId || state.folder !== folder) return;
        state.messages = state.messages.concat(mailbox.messages || []);
        state.messageTotal = Number(mailbox.message_total) || state.messages.length;
      }).catch(function (error) {
        if (state.accountId === accountId && state.folder === folder) toast(error.message);
      }).finally(function () {
        if (state.accountId === accountId && state.folder === folder) {
          state.loadingOlder = false;
          renderMailbox();
        }
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
    rememberListScroll();
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
    select.addEventListener('change', function () { rememberListScroll(); state.accountId = select.value; state.folders = []; state.messages = []; loadMailbox(true); });
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
      var count = state.folder === folder.id ? (state.messageTotal || state.messages.length) : '';
      var button = el('button', 'mail-folder' + (state.folder === folder.id ? ' active' : ''), '<span>' + esc(folder.label) + '</span>' + (count !== '' ? '<span class="badge">' + count + '</span>' : ''));
      button.addEventListener('click', function () { if (state.folder !== folder.id) { rememberListScroll(); state.folder = folder.id; loadMailbox(false); } });
      folderList.appendChild(button);
    });
    folders.appendChild(folderList);
    app.appendChild(folders);

    var listColumn = el('div', 'mail-col mail-col--list');
    var currentFolder = state.folders.filter(function (folder) { return folder.id === state.folder; })[0] || { label: 'Mailbox' };
    var loadedCount = state.messages.length;
    var totalLabel = state.messageTotal > loadedCount ? loadedCount + ' / ' + state.messageTotal : loadedCount;
    listColumn.appendChild(el('div', 'mail-col__head', '<h3>' + esc(currentFolder.label) + '</h3><span class="cnt">' + (state.loading ? '...' : totalLabel + ' MSG') + '</span>'));
    var list = el('div', 'mail-col__scroll');
    var listKey = mailboxScrollKey();
    list.dataset.mailboxKey = listKey;
    list.addEventListener('scroll', function () { state.listScroll[listKey] = list.scrollTop; });
    if (state.loading) list.appendChild(el('div', 'mail-loading', 'LOADING MESSAGES'));
    else if (state.error) list.appendChild(el('div', 'mail-empty', esc(state.error)));
    else if (!state.messages.length) list.appendChild(el('div', 'mail-empty', 'NO MESSAGES'));
    else state.messages.forEach(function (message) {
      var counterparty = message.counterparty || message.from || {};
      var sender = counterparty.name || counterparty.email || 'Unknown sender';
      var button = el('button', 'mail-msg' + (message.unread ? ' unread' : '') + (state.selected && state.selected.id === message.id ? ' active' : ''),
        '<div class="mail-msg__top"><span class="mail-msg__from">' + esc(sender) + '</span><span class="mail-msg__time">' + esc(relTime(message.date)) + '</span></div><div class="mail-msg__subject">' + esc(message.subject) + '</div><div class="mail-msg__to">' + esc(counterparty.email || '') + '</div>');
      button.addEventListener('click', function () { readMessage(message); });
      list.appendChild(button);
    });
    if (!state.loading && !state.error && state.messages.length && state.messages.length < state.messageTotal) {
      var older = el('button', 'btn btn--ghost btn--sm mail-load-older', state.loadingOlder ? 'LOADING...' : 'LOAD 50 OLDER');
      older.disabled = state.loadingOlder;
      older.addEventListener('click', loadOlderMessages);
      list.appendChild(older);
    }
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
    window.requestAnimationFrame(function () {
      if (list.isConnected) list.scrollTop = state.listScroll[listKey] || 0;
    });
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
    var wrap = el('div', 'mail-reader');
    var actions = el('div', 'mail-reader__actions');
    var reply = el('button', 'btn btn--primary', 'REPLY');
    reply.addEventListener('click', function () { openCompose({ mode: 'reply', message: message }); });
    var forward = el('button', 'btn', 'FORWARD');
    forward.addEventListener('click', function () { openCompose({ mode: 'forward', message: message }); });
    actions.appendChild(reply); actions.appendChild(forward);
    var topbar = el('div', 'mail-reader__topbar');
    var back = el('button', 'btn btn--ghost btn--sm', 'BACK');
    back.addEventListener('click', function () { state.selected = null; renderMailbox(); });
    topbar.appendChild(back);
    topbar.appendChild(actions);
    wrap.appendChild(topbar);
    var header = el('div');
    header.innerHTML = '<h2 class="mail-reader__subject">' + esc(message.subject) + '</h2>';
    wrap.appendChild(header);
    var thread = el('div', 'mail-thread');
    var blocks = message.thread && message.thread.length ? message.thread : [{ from: message.from || {}, body: message.body || '(No text content)', date: message.date }];
    blocks.forEach(function (block, index) {
      var blockSender = block.from || block;
      var name = blockSender.name || blockSender.email || 'Unknown sender';
      var email = blockSender.email || '';
      var date = block.date ? fullDate(block.date) : (block.date_label || '');
      var item = el('article', 'mail-thread__item' + (index === 0 ? ' current' : ''));
      item.innerHTML = '<div class="mail-thread__head"><div class="mail-avatar">' + esc(initials(name)) + '</div><div class="mail-reader__who"><div class="name">' + esc(name) + '</div><div class="email">' + esc(email) + '</div></div><div class="mail-reader__date">' + esc(date) + '</div></div>';
      var text = el('div', 'mail-thread__body');
      appendLinkifiedText(text, block.body);
      item.appendChild(text);
      thread.appendChild(item);
    });
    wrap.appendChild(thread);
    var attachments = renderAttachments(message);
    if (attachments) wrap.appendChild(attachments);
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
