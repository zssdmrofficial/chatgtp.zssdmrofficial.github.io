function setElementVisibility(el, shouldShow) {
  if (!el) return;
  el.style.display = shouldShow ? '' : 'none';
}

function getToolById(id) {
  return PROMPT_TOOLS.find((tool) => tool.id === id);
}

function getToolContent(tool) {
  if (!tool) return '';
  if (typeof tool.content === 'function') {
    const value = tool.content();
    return typeof value === 'string' ? value : '';
  }
  return typeof tool.content === 'string' ? tool.content : '';
}

function getToolIconMarkup(tool) {
  if (!tool) return ATTACHED_DATA_ICON;
  if (typeof tool.icon === 'function') {
    const value = tool.icon();
    return typeof value === 'string' && value.trim()
      ? value
      : ATTACHED_DATA_ICON;
  }
  if (typeof tool.icon === 'string' && tool.icon.trim()) {
    return tool.icon;
  }
  return ATTACHED_DATA_ICON;
}

function updatePromptToolsCounter() {
  if (!promptToolsCounterEl) return;
  const count = activeToolIds.size;
  promptToolsCounterEl.textContent = count ? `已選 ${count} 個` : '未選取';
}

function updatePromptToolBlockVisibility() {
  if (!promptToolsBlockEl) return;
  promptToolsBlockEl.style.display = '';
}

let isAttachedDataAccordionOpen = false;
let isPromptDropdownOpen = false;

function renderPromptTools() {
  if (!promptToolsListEl) return;
  updatePromptToolBlockVisibility();

  const existingDropdown = promptToolsListEl.querySelector('.prompt-dropdown');
  if (existingDropdown) {
    isPromptDropdownOpen = existingDropdown.classList.contains('open');
  }

  promptToolsListEl.innerHTML = '';

  const promptWrapper = document.createElement('div');
  promptWrapper.className = 'prompt-pill-wrapper';

  const promptPill = document.createElement('button');
  promptPill.type = 'button';
  promptPill.className = 'tool-pill prompt-pill';

  const activeCount = activeToolIds.size + (forceSearchNextTurn ? 1 : 0);
  const activeLabel =
    activeCount > 0 ? `附加功能 (${activeCount})` : '附加功能';

  if (activeCount > 0) {
    promptPill.classList.add('active');
  }

  promptPill.innerHTML = `
        <div class="tool-pill-icon">${ATTACH_TOOL_ICON}</div>
        <span class="tool-pill-label">${activeLabel}</span>
        <div class="prompt-pill-chevron">${CHEVRON_DOWN_ICON}</div>
    `;

  promptPill.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = promptWrapper.querySelector('.prompt-dropdown');
    const isOpening = !dropdown.classList.contains('open');
    document
      .querySelectorAll('.thinking-dropdown, .prompt-dropdown')
      .forEach((d) => d.classList.remove('open'));
    if (isOpening) {
      dropdown.classList.add('open');
      isPromptDropdownOpen = true;
    } else {
      isPromptDropdownOpen = false;
    }
  });

  const promptDropdown = document.createElement('div');
  promptDropdown.className = 'prompt-dropdown';
  if (isPromptDropdownOpen) {
    promptDropdown.classList.add('open');
  }

  const searchItem = document.createElement('button');
  searchItem.type = 'button';
  searchItem.className = 'prompt-dropdown-item';
  searchItem.id = 'force-search-pill';
  if (forceSearchNextTurn) {
    searchItem.classList.add('selected');
  }

  searchItem.innerHTML = `
        <div class="tool-pill-icon">${SEARCH_TOOL_ICON}</div>
        <span class="tool-pill-label">${getSearchPillLabel()}</span>
    `;

  searchItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isAwaitingResponse) return;

    if (!currentUser && (!window.auth || !auth.currentUser)) {
      const goToLogin = await showConfirmModal(
        '檢索(搜尋與瀏覽)功能需要登入才能使用，是否前往註冊/登入?',
      );
      if (goToLogin) {
        window.location.href = 'login.html';
      }
      return;
    }

    if (!isSearchEnabled) {
      const openSettings = await showConfirmModal(
        '檢索(搜尋與瀏覽)功能目前已停用，是否前往設定開啟？',
      );
      if (openSettings) {
        showSettingsModal();
      }
      return;
    }
    forceSearchNextTurn = !forceSearchNextTurn;
    updateSearchPillState();
    renderPromptTools();
  });
  promptDropdown.appendChild(searchItem);



  promptWrapper.appendChild(promptPill);
  promptWrapper.appendChild(promptDropdown);
  promptToolsListEl.appendChild(promptWrapper);

  renderThinkingPill();
  updatePromptToolsCounter();
  updateSearchPillState();
}

function renderThinkingPill() {
  if (!promptToolsListEl) return;
  const existing = promptToolsListEl.querySelector('.thinking-pill-wrapper');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'thinking-pill-wrapper';

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'tool-pill thinking-pill';

  const levelLabel =
    THINKING_LEVELS.find((l) => l.value === currentThinkingLevel)?.label || '';

  pill.innerHTML = `
        <div class="tool-pill-icon">${THINKING_ICON}</div>
        <span class="tool-pill-label">${levelLabel}</span>
        <div class="thinking-pill-chevron">${CHEVRON_DOWN_ICON}</div>
    `;

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = wrapper.querySelector('.thinking-dropdown');
    const isOpening = !dropdown.classList.contains('open');
    document
      .querySelectorAll('.thinking-dropdown, .prompt-dropdown')
      .forEach((d) => d.classList.remove('open'));
    if (isOpening) {
      dropdown.classList.add('open');
    }
  });

  const dropdown = document.createElement('div');
  dropdown.className = 'thinking-dropdown';

  THINKING_LEVELS.forEach((level) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'thinking-dropdown-item';
    if (currentThinkingLevel === level.value) item.classList.add('selected');

    let iconSvg = '';
    if (level.value === 'MINIMAL') iconSvg = THINKING_ICON_LEVEL_MINIMAL;
    else if (level.value === 'LOW') iconSvg = THINKING_ICON_LEVEL_LOW;
    else if (level.value === 'MEDIUM') iconSvg = THINKING_ICON_LEVEL_MEDIUM;
    else if (level.value === 'HIGH') iconSvg = THINKING_ICON_LEVEL_HIGH;

    item.innerHTML =
      '<div class="tool-pill-icon">' +
      iconSvg +
      '</div><span class="tool-pill-label">' +
      level.label +
      '</span>';
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentThinkingLevel = level.value;
      dropdown.classList.remove('open');
      renderPromptTools();
    });
    dropdown.appendChild(item);
  });

  wrapper.appendChild(pill);
  wrapper.appendChild(dropdown);
  promptToolsListEl.prepend(wrapper);
}

function getSearchPillLabel() {
  return '檢索';
}

function updateSearchPillState() {
  const pill = document.getElementById('force-search-pill');
  if (!pill) return;
  if (!isSearchEnabled && forceSearchNextTurn) {
    forceSearchNextTurn = false;
  }
  const disabled = !isSearchEnabled || isAwaitingResponse;
  pill.disabled = isAwaitingResponse;
  pill.setAttribute('aria-disabled', disabled.toString());
  pill.setAttribute('aria-pressed', forceSearchNextTurn.toString());
  pill.classList.toggle('active', forceSearchNextTurn);
  pill.classList.toggle('selected', forceSearchNextTurn);
  pill.classList.toggle('disabled', isAwaitingResponse);
  pill.classList.toggle('search-disabled', !isSearchEnabled);
  const labelEl = pill.querySelector('.tool-pill-label');
  if (labelEl && labelEl.textContent !== getSearchPillLabel()) {
    labelEl.textContent = getSearchPillLabel();
  }
  if (pill.hasAttribute('title')) {
    pill.removeAttribute('title');
  }
}

function togglePromptTool(id) {
  if (activeToolIds.has(id)) {
    activeToolIds.delete(id);
  } else {
    activeToolIds.add(id);
  }
  renderPromptTools();
}

function buildToolContextPayload() {
  if (!activeToolIds.size) return '';
  const injectedMarkers = new Set();
  for (const msg of history) {
    const text = msg.parts?.[0]?.text || '';
    if (!text.startsWith('【工具資訊】')) continue;
    for (const tool of PROMPT_TOOLS) {
      const marker = `【${tool.label || tool.id}】`;
      if (text.includes(marker)) {
        injectedMarkers.add(tool.id);
      }
    }
  }
  const sections = [];
  activeToolIds.forEach((id) => {
    if (injectedMarkers.has(id)) return;
    const tool = getToolById(id);
    const content = getToolContent(tool).trim();
    if (!tool || !content) return;
    const label = tool.label || id;
    sections.push(`【${label}】\n${content}`);
  });
  if (!sections.length) return '';
  return sections.join('\n\n');
}

function updateSendButtonState() {
  if (!sendButtonEl || !inputEl) return;
  const hasText = inputEl.value.trim() !== '';
  sendButtonEl.disabled = !isAwaitingResponse && !hasText;
  sendButtonEl.setAttribute('aria-busy', isAwaitingResponse.toString());
  const iconMarkup = isAwaitingResponse
    ? STOP_GENERATION_ICON
    : SEND_ICON_DEFAULT;
  if (sendButtonEl.innerHTML.trim() !== iconMarkup.trim()) {
    sendButtonEl.innerHTML = iconMarkup;
  }
  updateSearchPillState();
  adjustChatPadding();
}

function adjustChatPadding() {
  const inputContainer = document.querySelector('.input-container');
  if (chatBoxEl && inputContainer) {
    const h = inputContainer.offsetHeight;
    chatBoxEl.style.paddingBottom = h + 20 + 'px';
  }
}

function isConversationActionLocked() {
  return isAwaitingResponse || isEditingMessage;
}

function getConversationLockMessage(actionLabel = '操作') {
  if (isAwaitingResponse) {
    return `模型回應中，暫時無法${actionLabel}`;
  }
  if (isEditingMessage) {
    return `編輯訊息期間，暫時無法${actionLabel}`;
  }
  return '';
}

function notifyConversationActionLocked(actionLabel) {
  const msg = getConversationLockMessage(actionLabel);
  if (msg) {
    setAuthHint(msg, true);
  }
}

function updateNewChatButtonState() {
  if (!newChatBtn) return;
  const disabled = !currentUser || isConversationActionLocked();
  newChatBtn.classList.toggle('disabled', disabled);
  newChatBtn.setAttribute('aria-disabled', disabled.toString());
  if (disabled) {
    newChatBtn.setAttribute('disabled', 'true');
  } else {
    newChatBtn.removeAttribute('disabled');
  }
}

function updateConversationItemsState() {
  if (!conversationListEl) return;
  const locked = isConversationActionLocked();
  const items = conversationListEl.querySelectorAll('.history-item');
  items.forEach((item) => {
    item.classList.toggle('disabled', locked);
    item.setAttribute('aria-disabled', locked.toString());
  });
}

function updateEditButtonsState() {
  const shouldDisable = isAwaitingResponse;
  const editButtons = document.querySelectorAll('.edit-message-btn');
  editButtons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = shouldDisable;
    btn.setAttribute('aria-disabled', shouldDisable.toString());
    btn.classList.toggle('disabled', shouldDisable);
  });
  const regenButtons = document.querySelectorAll('.regenerate-message-btn');
  regenButtons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = shouldDisable;
    btn.setAttribute('aria-disabled', shouldDisable.toString());
    btn.classList.toggle('disabled', shouldDisable);
  });
  const copyButtons = document.querySelectorAll('.copy-message-btn');
  copyButtons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = shouldDisable;
    btn.setAttribute('aria-disabled', shouldDisable.toString());
    btn.classList.toggle('disabled', shouldDisable);
  });
}

function updateConversationLockUI() {
  updateNewChatButtonState();
  updateConversationItemsState();
  updateEditButtonsState();
}

function setEditingState(isEditing) {
  const nextState = !!isEditing;
  if (isEditingMessage === nextState) return;
  isEditingMessage = nextState;
  updateConversationLockUI();
}

function setAuthHint(msg) {
  const text = msg || '';
  const color = '#b4b4b4';
  if (authHintEl) {
    authHintEl.textContent = text;
    authHintEl.style.color = color;
  }
}

function clearAuthFields(clearEmail = false) {
  if (authPasswordEl) authPasswordEl.value = '';
  if (clearEmail && authEmailEl) authEmailEl.value = '';
}

function toggleMobileSidebar(forceOpen = null) {
  const shouldOpen =
    forceOpen !== null
      ? forceOpen
      : !document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open', shouldOpen);
}

function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
}

function updateUserProfile(user) {
  if (!userNameEl || !userAvatarEl) return;
  if (user) {
    userNameEl.textContent = user.email || 'User';
    userNameEl.title = user.email || 'User';
    userAvatarEl.textContent = (user.email || 'U').slice(0, 1).toUpperCase();
  } else {
    userNameEl.textContent = 'Guest';
    userNameEl.title = 'Guest';
    userAvatarEl.textContent = 'G';
  }
}

function updateAuthUI(user) {
  const isLoggedIn = !!user;
  setElementVisibility(loginBtn, !isLoggedIn);
  setElementVisibility(signupBtn, !isLoggedIn);
  setElementVisibility(loginPageBtn, !isLoggedIn);
  setElementVisibility(logoutBtn, isLoggedIn);

  if (tempChatBtn) {
    tempChatBtn.style.display = isLoggedIn ? 'flex' : 'none';
  }

  if (authEmailEl) {
    authEmailEl.disabled = isLoggedIn;
    authEmailEl.value = isLoggedIn ? user?.email || '' : '';
  }

  if (authPasswordEl) {
    authPasswordEl.disabled = isLoggedIn;
    authPasswordEl.value = '';
  }
  updateNewChatButtonState();
}

function clearChatUI() {
  chatBoxEl.innerHTML = '';
  history = [];
}

function updateTempChatBtnUI() {
  if (tempChatBannerEl) {
    tempChatBannerEl.style.display = isTempChatMode ? 'block' : 'none';
  }
  if (!tempChatBtn) return;
  if (isTempChatMode) {
    tempChatBtn.innerHTML = TEMP_CHAT_ICON_ENABLE;
    tempChatBtn.classList.add('active');
  } else {
    tempChatBtn.innerHTML = TEMP_CHAT_ICON;
    tempChatBtn.classList.remove('active');
  }
}

async function toggleTempChatMode() {
  if (isConversationActionLocked()) {
    notifyConversationActionLocked('切換對話模式');
    return;
  }
  isTempChatMode = !isTempChatMode;
  updateTempChatBtnUI();

  if (isTempChatMode) {
    clearChatUI();
    currentConversationId = null;
    document
      .querySelectorAll('.history-item')
      .forEach((item) => item.classList.remove('active'));
  } else {
    clearChatUI();
    currentConversationId = null;
    if (currentUser) {
      await loadConversations(currentUser.uid);
    }
  }
}

function clearHistoryList() {
  if (!conversationListEl) return;
  conversationListEl.innerHTML =
    '<div class="history-empty">登入後會顯示您的對話</div>';
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToHtml(mdText) {
  if (typeof mdText !== 'string') return '';

  const latexBlocks = [];
  let textToProcess = mdText;

  textToProcess = textToProcess.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (match, formula) => {
      const id = `:::LATEX_BLOCK_${latexBlocks.length}:::`;
      latexBlocks.push({ id, formula, isBlock: true });
      return id;
    },
  );
  textToProcess = textToProcess.replace(
    /\\\[([\s\S]+?)\\\]/g,
    (match, formula) => {
      const id = `:::LATEX_BLOCK_${latexBlocks.length}:::`;
      latexBlocks.push({ id, formula, isBlock: true });
      return id;
    },
  );

  textToProcess = textToProcess.replace(
    /\$([^\s\$](?:[^\$]*[^\s\$])?)\$/g,
    (match, formula) => {
      const id = `:::LATEX_INLINE_${latexBlocks.length}:::`;
      latexBlocks.push({ id, formula, isBlock: false });
      return id;
    },
  );
  textToProcess = textToProcess.replace(
    /\\\(([\s\S]+?)\\\)/g,
    (match, formula) => {
      const id = `:::LATEX_INLINE_${latexBlocks.length}:::`;
      latexBlocks.push({ id, formula, isBlock: false });
      return id;
    },
  );

  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined') {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
        return code;
      },
      langPrefix: 'hljs language-',
    });

    let html = marked.parse(textToProcess);

    latexBlocks.forEach((item) => {
      try {
        const rendered =
          typeof katex !== 'undefined'
            ? katex.renderToString(item.formula, {
                displayMode: item.isBlock,
                throwOnError: false,
              })
            : item.isBlock
              ? `$$${item.formula}$$`
              : `$${item.formula}$`;
        html = html.replace(item.id, rendered);
      } catch (e) {
        console.error('KaTeX rendering error:', e);
        html = html.replace(item.id, item.formula);
      }
    });

    const div = document.createElement('div');
    div.innerHTML = html;

    const preBlocks = div.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      const code = pre.querySelector('code');
      let lang = 'text';
      if (code && code.className) {
        const match = code.className.match(/language-([a-zA-Z0-9-]+)/);
        if (match) lang = match[1];
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'code-container';

      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
                <span>${lang}</span>
                <button type="button" class="copy-button" aria-label="複製程式碼">
                    <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                    <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPY_SUCCESS_ICON}</span>
                </button>
            `;

      const newPre = pre.cloneNode(true);

      wrapper.appendChild(header);
      wrapper.appendChild(newPre);

      pre.parentNode.replaceChild(wrapper, pre);
    });

    const children = Array.from(div.childNodes);
    let i = 0;
    while (i < children.length) {
      const node = children[i];
      const isImageNode = (n) => {
        if (n.nodeType !== 1) return false;
        if (n.tagName === 'IMG') return true;
        if (n.tagName === 'P') {
          const imgs = n.querySelectorAll('img');
          if (imgs.length === 0) return false;
          const nonImgContent = Array.from(n.childNodes).filter(
            (c) =>
              !(c.nodeType === 1 && c.tagName === 'IMG') &&
              !(c.nodeType === 3 && c.textContent.trim() === ''),
          );
          return nonImgContent.length === 0;
        }
        return false;
      };

      if (isImageNode(node)) {
        const imageNodes = [node];
        let j = i + 1;
        while (j < children.length) {
          const next = children[j];
          if (next.nodeType === 3 && next.textContent.trim() === '') {
            j++;
            continue;
          }
          if (isImageNode(next)) {
            imageNodes.push(next);
            j++;
          } else {
            break;
          }
        }

        if (imageNodes.length >= 2) {
          const gallery = document.createElement('div');
          gallery.className = 'image-gallery';
          node.parentNode.insertBefore(gallery, node);
          imageNodes.forEach((imgNode) => {
            if (imgNode.tagName === 'P') {
              const imgs = imgNode.querySelectorAll('img');
              imgs.forEach((img) => gallery.appendChild(img));
              imgNode.remove();
            } else {
              gallery.appendChild(imgNode);
            }
          });
          const newChildren = Array.from(div.childNodes);
          i = newChildren.indexOf(gallery) + 1;
          children.length = 0;
          children.push(...newChildren);
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    return div.innerHTML;
  }

  return escapeHtml(mdText);
}

function setMessageCopyButtonState(button, state = 'default') {
  if (!button) return;
  const originalLabel =
    button.dataset.originalLabel || button.getAttribute('aria-label') || '複製';
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = originalLabel;
  }

  if (state === 'copied') {
    button.classList.remove('copy-error');
    button.classList.add('copy-success');
    button.setAttribute('aria-label', '已複製');
    button.setAttribute('aria-pressed', 'true');
    button.dataset.state = 'open';
    return;
  }

  if (state === 'error') {
    button.classList.remove('copy-success');
    button.classList.add('copy-error');
    button.setAttribute('aria-label', '複製失敗');
    button.setAttribute('aria-pressed', 'false');
    button.dataset.state = 'error';
    return;
  }

  button.classList.remove('copy-error', 'copy-success');
  button.setAttribute('aria-label', originalLabel);
  button.setAttribute('aria-pressed', 'false');
  button.dataset.state = 'closed';
}

function flashMessageCopyState(button, state) {
  if (!button) return;
  setMessageCopyButtonState(button, state);
  if (state === 'default') return;
  if (button._copyTimer) {
    clearTimeout(button._copyTimer);
  }
  button._copyTimer = setTimeout(() => {
    setMessageCopyButtonState(button, 'default');
    button._copyTimer = null;
  }, MESSAGE_COPY_FEEDBACK_DURATION);
}

function initCopyHandler(element) {
  if (!element) return;
  element.addEventListener('click', async (ev) => {
    const codeBtn = ev.target.closest('.copy-button');
    if (codeBtn) {
      const container =
        codeBtn.closest('.code-container') ||
        codeBtn.closest('.python-analysis-indicator');
      const codeEl = container?.querySelector('code');
      const textToCopy = codeEl ? codeEl.innerText : '';

      try {
        await navigator.clipboard.writeText(textToCopy);
        codeBtn.classList.add('copied');
        setTimeout(() => codeBtn.classList.remove('copied'), 2000);
      } catch (err) {
        console.error('Copy failed', err);
      }
      return;
    }

    const messageBtn = ev.target.closest('.copy-message-btn');
    if (messageBtn) {
      const wrapper = messageBtn.closest('.message-wrapper');
      const datasetValue = wrapper?.dataset.raw || '';
      const fallbackValue =
        wrapper?.querySelector('.text-content')?.innerText || '';
      const textToCopy = datasetValue || fallbackValue;

      if (!textToCopy) {
        flashMessageCopyState(messageBtn, 'error');
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        flashMessageCopyState(messageBtn, 'copied');
      } catch (err) {
        console.error('複製訊息失敗', err);
        flashMessageCopyState(messageBtn, 'error');
      }
      return;
    }

    const regenBtn = ev.target.closest('.regenerate-message-btn');
    if (regenBtn) {
      if (isAwaitingResponse) return;
      const wrapper = regenBtn.closest('.message-wrapper');
      const indexStr = wrapper?.dataset.index;
      const regenIndex = Number(indexStr);
      if (
        !Number.isFinite(regenIndex) ||
        regenIndex < 0 ||
        regenIndex >= history.length
      )
        return;
      const targetMessage = history[regenIndex];
      if (!targetMessage || targetMessage.role !== 'model') return;
      await regenerateMessage(regenIndex);
      return;
    }

    const editBtn = ev.target.closest('.edit-message-btn');
    if (!editBtn) return;
    if (isAwaitingResponse) {
      return;
    }

    const wrapper = editBtn.closest('.message-wrapper');
    const indexStr = wrapper?.dataset.index;
    const editIndex = Number(indexStr);
    if (
      !Number.isFinite(editIndex) ||
      editIndex < 0 ||
      editIndex >= history.length
    )
      return;

    const targetMessage = history[editIndex];
    if (!targetMessage || targetMessage.role !== 'user') return;

    const textToEdit =
      targetMessage.displayText || targetMessage.parts?.[0]?.text || '';

    const messagesToRemove = history.slice(editIndex);
    history = history.slice(0, editIndex);
    renderHistory();
    setEditingState(true);

    const idsToDelete = messagesToRemove
      .map((msg) => msg?.messageId)
      .filter((id) => typeof id === 'string' && id.length > 0);

    if (idsToDelete.length && currentConversationId) {
      await deleteMessagesByIds(currentConversationId, idsToDelete);
    }

    inputEl.value = textToEdit;
    inputEl.style.height = 'auto';
    inputEl.style.height = inputEl.scrollHeight + 'px';
    inputEl.focus();
    const pos = inputEl.value.length;
    inputEl.setSelectionRange(pos, pos);
    updateSendButtonState();
  });
}
