function applyUserBubbleShape(textContentEl) {
  if (!textContentEl) return;
  const wrapper = textContentEl.closest('.message-wrapper');
  if (!wrapper || wrapper.dataset.role !== 'user') return;

  const styles = window.getComputedStyle(textContentEl);
  const lineHeight = parseFloat(styles.lineHeight) || 0;
  const paddingTop = parseFloat(styles.paddingTop) || 0;
  const paddingBottom = parseFloat(styles.paddingBottom) || 0;
  if (!lineHeight) return;

  const contentHeight = textContentEl.scrollHeight - paddingTop - paddingBottom;
  const isMultiLine = contentHeight > lineHeight + 1;

  textContentEl.classList.remove('bubble-single-line', 'bubble-multi-line');
  textContentEl.classList.add(
    isMultiLine ? 'bubble-multi-line' : 'bubble-single-line',
  );
}

function refreshAllUserBubbleShapes() {
  if (!chatBoxEl) return;
  const bubbles = chatBoxEl.querySelectorAll(
    '.message-wrapper[data-role="user"] .text-content',
  );
  bubbles.forEach((bubble) => applyUserBubbleShape(bubble));
}

let bubbleShapeRefreshHandle = null;
function scheduleBubbleShapeRefresh() {
  if (bubbleShapeRefreshHandle) return;
  bubbleShapeRefreshHandle = requestAnimationFrame(() => {
    bubbleShapeRefreshHandle = null;
    refreshAllUserBubbleShapes();
  });
}

window.addEventListener('resize', scheduleBubbleShapeRefresh);

function getImageExtensionFromMime(mime) {
  if (!mime || typeof mime !== 'string') return 'png';
  const normalized = mime.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/svg+xml') return 'svg';
  const match = normalized.match(/^image\/([a-z0-9.+-]+)$/);
  if (match) return match[1].split('+')[0];
  return 'png';
}

function getImageExtensionFromUrl(url) {
  if (typeof url !== 'string') return 'png';
  const dataMatch = url.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (dataMatch) {
    return getImageExtensionFromMime(`image/${dataMatch[1]}`);
  }
  const base = url.split('?')[0].split('#')[0];
  const extMatch = base.match(/\.([a-z0-9]+)$/i);
  if (extMatch) return extMatch[1].toLowerCase();
  return 'png';
}

window.checkImageBtnBrightness = function (imgEl) {
  try {
    const container = imgEl.closest('.image-preview');
    if (!container) return;
    const btn = container.querySelector('.image-download-btn');
    if (!btn) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const displayW = imgEl.clientWidth;
    const displayH = imgEl.clientHeight;

    if (displayW === 0 || displayH === 0) return;

    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    if (natW === 0 || natH === 0) return;

    const ratioX = natW / displayW;
    const ratioY = natH / displayH;

    // 按鈕寬高與位置設定
    const btnW = 28;
    const btnH = 28;
    const rightOffset = 8;
    const bottomOffset = 8;

    let srcX = (displayW - rightOffset - btnW) * ratioX;
    let srcY = (displayH - bottomOffset - btnH) * ratioY;
    let srcW = btnW * ratioX;
    let srcH = btnH * ratioY;

    // 防止超出邊界
    srcX = Math.max(0, srcX);
    srcY = Math.max(0, srcY);
    srcW = Math.min(natW - srcX, srcW);
    srcH = Math.min(natH - srcY, srcH);

    if (srcW <= 0 || srcH <= 0) return;

    canvas.width = btnW;
    canvas.height = btnH;

    ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, btnW, btnH);

    const imgData = ctx.getImageData(0, 0, btnW, btnH);
    const data = imgData.data;

    let r = 0,
      g = 0,
      b = 0,
      count = 0;

    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] > 0) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
    }

    if (count > 0) {
      r /= count;
      g /= count;
      b /= count;
    } else {
      return;
    }

    // 計算亮度 (YIQ formula)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    // 如果圖片在該區域較暗，圖示設為白色；若較亮則設為黑色
    if (brightness < 128) {
      btn.style.setProperty('--dyn-icon-color', '#ffffff');
    } else {
      btn.style.setProperty('--dyn-icon-color', '#000000');
    }
  } catch (e) {
    console.warn(
      'Failed to detect brightness (might be CORS), fallback to default:',
      e,
    );
  }
};

function buildDownloadableImageHtml(src, alt, downloadName) {
  const safeAlt = alt || 'Image preview';
  const safeDownloadName =
    typeof downloadName === 'string'
      ? downloadName.replace(/"/g, '').trim()
      : '';
  const downloadAttr = safeDownloadName
    ? ` download="${safeDownloadName}"`
    : '';
  const iconMarkup = DOWNLOAD_ICON.replace(
    'margin-right:4px;',
    'margin-right:0;',
  );
  return `<div class="image-preview">
    <img src="${src}" alt="${safeAlt}" crossorigin="anonymous" onload="checkImageBtnBrightness(this)">
    <a class="image-download-btn" href="${src}"${downloadAttr} aria-label="下載圖片" title="下載圖片">
      ${iconMarkup}
    </a>
  </div>`;
}

function renderMessage(
  role,
  content,
  isError = false,
  displayContent = null,
  messageIndex = null,
  isHtml = false,
  hideActions = false,
  hideRegen = false,
  hideIcon = false,
) {
  const isUser = role === 'user';
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message-wrapper';
  msgDiv.dataset.role = role;

  const viewText =
    typeof displayContent === 'string' ? displayContent : content;
  const normalizedText = typeof viewText === 'string' ? viewText : '';
  msgDiv.dataset.raw = normalizedText;
  if (typeof messageIndex === 'number' && !Number.isNaN(messageIndex)) {
    msgDiv.dataset.index = String(messageIndex);
  } else {
    delete msgDiv.dataset.index;
  }

  let innerContent = '';
  if (isError) {
    innerContent = `<div style="color: #ef4444;">${escapeHtml(normalizedText)}</div>`;
  } else if (isUser) {
    innerContent = `<p>${escapeHtml(normalizedText).replace(/\n/g, '<br>')}</p>`;
  } else if (isHtml) {
    innerContent = displayContent;
  } else {
    innerContent = markdownToHtml(normalizedText);
  }

  if (typeof innerContent === 'string') {
    innerContent = innerContent.replace(
      /<span>Thinking<\/span>/g,
      '<span>Show Thinking</span>',
    );
  }

  const iconHtml = isUser
    ? ''
    : hideIcon
      ? '<div class="role-icon" style="visibility: hidden; box-shadow: none;"></div>'
      : `<div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>`;

  const editButtonDisabledAttr = isAwaitingResponse
    ? ' disabled aria-disabled="true"'
    : ' aria-disabled="false"';
  const editButtonHtml = isUser
    ? `
            <button type="button" class="edit-message-btn message-action-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="編輯訊息"${editButtonDisabledAttr}>
                <span class="message-action-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    ${MESSAGE_EDIT_ICON}
                </span>
            </button>
        `
    : '';

  const regenerateButtonDisabledAttr = isAwaitingResponse
    ? ' disabled aria-disabled="true"'
    : ' aria-disabled="false"';
  const regenerateButtonHtml =
    !isUser && !hideRegen
      ? `
            <button type="button" class="regenerate-message-btn message-action-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="重新生成"${regenerateButtonDisabledAttr}>
                <span class="message-action-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    ${MESSAGE_REGENERATE_ICON}
                </span>
            </button>
        `
      : '';

  const footerHtml = hideActions
    ? ''
    : `
        <div class="message-footer">
            <button type="button" class="copy-message-btn message-action-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="複製" aria-pressed="false" data-testid="copy-turn-action-button" data-state="closed">
                <span class="copy-button-inner message-action-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    <span class="copy-icon copy-icon-default" aria-hidden="true">${MESSAGE_COPY_ICON}</span>
                    <span class="copy-icon copy-icon-success" aria-hidden="true">${MESSAGE_COPY_SUCCESS_ICON}</span>
                </span>
            </button>
            ${regenerateButtonHtml}
            ${editButtonHtml}
        </div>
    `;

  let imagesHtml = '';
  if (
    isUser &&
    typeof messageIndex === 'number' &&
    typeof history !== 'undefined' &&
    history[messageIndex]
  ) {
    const msg = history[messageIndex];
    const displayUrls =
      Array.isArray(msg.imageDataUrls) && msg.imageDataUrls.length > 0
        ? msg.imageDataUrls
        : null;
    if (displayUrls) {
      const imgTags = displayUrls
        .map((url, idx) => {
          const ext = getImageExtensionFromUrl(url);
          const downloadName = `user-image-${idx + 1}.${ext}`;
          return buildDownloadableImageHtml(
            url,
            `Uploaded Image ${idx + 1}`,
            downloadName,
          );
        })
        .join('');
      imagesHtml = `<div class="user-image-gallery">${imgTags}</div>`;
    } else {
      const imgParts = Array.isArray(msg.parts)
        ? msg.parts.filter((p) => p.inline_data || p.inlineData)
        : [];
      if (imgParts.length > 0) {
        const imgTags = imgParts
          .map((p, idx) => {
            const dataObj = p.inline_data || p.inlineData;
            const mime = dataObj.mime_type || dataObj.mimeType || 'image/jpeg';
            const data = dataObj.data;
            const src = `data:${mime};base64,${data}`;
            const ext = getImageExtensionFromMime(mime);
            const downloadName = `user-image-${idx + 1}.${ext}`;
            return buildDownloadableImageHtml(
              src,
              `Uploaded Image ${idx + 1}`,
              downloadName,
            );
          })
          .join('');
        imagesHtml = `<div class="user-image-gallery">${imgTags}</div>`;
      }
    }
  }

  msgDiv.innerHTML = `
        <div class="message-content">
          ${imagesHtml}    
          ${iconHtml}
          <div class="text-content">${innerContent}</div>
        </div>
        ${footerHtml}
    `;

  chatBoxEl.appendChild(msgDiv);

  if (hideActions) {
    msgDiv.querySelectorAll('.code-header').forEach((el) => el.remove());
  }

  requestAnimationFrame(() => {
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    const textEl = msgDiv.querySelector('.text-content');
    applyUserBubbleShape(textEl);
  });
}

function showLoading() {
  const loadingId = 'loading-' + Date.now();
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message-wrapper';
  msgDiv.id = loadingId;
  msgDiv.innerHTML = `
        <div class="message-content">
            <div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>
            <div class="text-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
  chatBoxEl.appendChild(msgDiv);
  chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  return loadingId;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function renderConversationList(conversations) {
  if (!conversationListEl) return;
  if (!conversations.length) {
    conversationListEl.innerHTML = `<div class="history-empty">尚無對話，點擊「${DEFAULT_CHAT_TITLE}」建立</div>`;
    return;
  }

  conversationListEl.innerHTML = '';
  const locked = isConversationActionLocked();
  conversations.forEach((conv) => {
    const item = document.createElement('div');
    const baseClass =
      'history-item' + (conv.id === currentConversationId ? ' active' : '');
    item.className = baseClass + (locked ? ' disabled' : '');
    item.dataset.id = conv.id;
    item.setAttribute('aria-disabled', locked.toString());

    const title = document.createElement('span');
    title.className = 'history-title';
    const titleText = conv.title || '未命名對話';

    if (conv.id === animatingConversationId) {
      animateTypewriter(title, titleText);
      animatingConversationId = null;
    } else {
      title.textContent = titleText;
    }

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-conv-btn';
    editBtn.title = '重新命名此對話';
    editBtn.innerHTML = `
            ${CHAT_EDIT_ICON}
        `;
    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (item.contains(title)) {
        const currentTitle = conv.title || '未命名對話';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'history-title-input';

        item.replaceChild(input, title);
        input.focus();

        let isSaving = false;
        const saveRename = async () => {
          if (isSaving) return;
          isSaving = true;
          const newTitle = input.value.trim();
          if (item.contains(input)) {
            item.replaceChild(title, input);
          }
          if (newTitle && newTitle !== currentTitle) {
            title.textContent = newTitle;
            await renameConversation(conv.id, newTitle);
          } else {
            title.textContent = currentTitle;
          }
        };

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveRename();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (item.contains(input)) {
              item.replaceChild(title, input);
            }
          }
        });
        input.addEventListener('blur', () => {
          saveRename();
        });
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-conv-btn';
    deleteBtn.title = '刪除此對話';
    deleteBtn.innerHTML = `
            ${CHAT_DELETE_ICON}
        `;
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteConversation(conv.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      if (isConversationActionLocked()) {
        notifyConversationActionLocked('切換對話');
        return;
      }
      if (conv.id === currentConversationId) return;
      const allItems = conversationListEl.querySelectorAll('.history-item');
      allItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      loadMessages(conv.id);
      closeMobileSidebar();
    });

    conversationListEl.appendChild(item);
  });
  updateConversationItemsState();
}

function renderHistory() {
  chatBoxEl.innerHTML = '';
  chatBoxEl.classList.remove('settings-fade-in');
  void chatBoxEl.offsetWidth;
  chatBoxEl.classList.add('settings-fade-in');
  history.forEach((msg, index) => {
    if (msg.role === 'user' && msg.parts[0].text === SYSTEM_INSTRUCTION) return;
    if (msg.isHidden) return;
    const isPythonIndicator =
      typeof msg.displayText === 'string' &&
      msg.displayText.includes('python-analysis-indicator');
    const isThought =
      typeof msg.displayText === 'string' &&
      msg.displayText.includes('thinking-details');
    const isHtml = msg.isHtml === true || isPythonIndicator || isThought;
    const msgText = msg.parts[0].text || '';
    const isSystemCodeResult = msgText.startsWith(
      '(System: Code execution result)',
    );
    const isPythonResult =
      (msgText === '' || isSystemCodeResult) &&
      typeof msg.displayText === 'string' &&
      msg.displayText.includes('Python 執行結果');
    let shouldHideActions = isPythonIndicator || isPythonResult;
    const renderRole = isPythonResult ? 'model' : msg.role;
    const renderText = isPythonResult ? '' : msg.parts[0].text;

    let hideRegen = false;
    if (renderRole === 'model' && !shouldHideActions) {
      let isLastRegenerableInTurn = true;
      for (let i = index + 1; i < history.length; i++) {
        const nextM = history[i];
        const nextT = nextM.parts[0]?.text || '';
        const isRealUser =
          nextM.role === 'user' &&
          !nextT.startsWith('(System: Code execution result)');

        if (isRealUser) {
          break;
        }

        const nextIsPythonIndicator =
          typeof nextM.displayText === 'string' &&
          nextM.displayText.includes('python-analysis-indicator');
        const nextIsSystemCodeResult = nextT.startsWith(
          '(System: Code execution result)',
        );
        const nextIsPythonResult =
          (nextT === '' || nextIsSystemCodeResult) &&
          typeof nextM.displayText === 'string' &&
          nextM.displayText.includes('Python 執行結果');
        const nextShouldHideActions =
          nextIsPythonIndicator || nextIsPythonResult;
        const nextRenderRole = nextIsPythonResult ? 'model' : nextM.role;

        if (nextRenderRole === 'model' && !nextShouldHideActions) {
          isLastRegenerableInTurn = false;
          break;
        }
      }
      if (!isLastRegenerableInTurn) {
        hideRegen = true;
      }
    } else if (renderRole === 'model') {
      hideRegen = true;
    }

    renderMessage(
      renderRole,
      renderText,
      false,
      msg.displayText,
      index,
      isHtml,
      shouldHideActions,
      hideRegen,
      isPythonResult,
    );
  });
}
