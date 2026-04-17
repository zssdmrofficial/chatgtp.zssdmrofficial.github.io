function showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'custom-modal';

    const messageEl = document.createElement('div');
    messageEl.className = 'custom-modal-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'custom-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-modal-btn cancel-btn';
    cancelBtn.textContent = '取消';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-modal-btn confirm-btn';
    confirmBtn.textContent = '確定';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    modal.appendChild(messageEl);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      modal.classList.add('is-open');
    });

    confirmBtn.focus();

    const close = (result) => {
      document.removeEventListener('keydown', keyHandler);
      document.body.removeChild(overlay);
      resolve(result);
    };

    const keyHandler = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };

    document.addEventListener('keydown', keyHandler);

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

async function deleteAllConversations() {
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再執行此動作', true);
    return;
  }

  const confirmed = await showConfirmModal(
    '確定要刪除「全部」對話紀錄嗎？此動作將永久移除所有對話且無法復原。',
  );
  if (!confirmed) return;

  try {
    setAuthHint('正在刪除全部對話...');
    const convsSnap = await db
      .collection('conversations')
      .where('userId', '==', user.uid)
      .get();

    const total = convsSnap.size;
    let deleted = 0;

    for (const convDoc of convsSnap.docs) {
      const convRef = convDoc.ref;
      const messagesSnap = await convRef.collection('messages').get();

      let batch = db.batch();
      let counter = 0;

      for (const msgDoc of messagesSnap.docs) {
        batch.delete(msgDoc.ref);
        counter++;
        if (counter === FIRESTORE_BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          counter = 0;
        }
      }
      if (counter > 0) {
        await batch.commit();
      }
      await convRef.delete();
      deleted++;
    }

    currentConversationId = null;
    history = [];
    clearChatUI();
    await loadConversations(user.uid);
    setAuthHint(`已成功刪除 ${deleted} 個對話`);
  } catch (e) {
    console.error('刪除全部對話失敗', e);
    setAuthHint('刪除全部對話失敗，請稍後再試', true);
  }
}

function showSettingsModal() {
  if (!currentUser && (!window.auth || !auth.currentUser)) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'custom-modal settings-modal';

  modal.innerHTML = `
        <div class="settings-header">
            <h2>設定</h2>
            <button class="settings-close-btn" id="settings-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="settings-container">
            <div class="settings-sidebar">
                <button class="settings-tab active" data-tab="general">一般</button>
                <button class="settings-tab" data-tab="privacy">隱私權</button>
                <button class="settings-tab" data-tab="account">帳號</button>
            </div>
            <div class="settings-content">
                <div class="settings-section active" id="tab-general">
                    <div class="settings-group">
                        <div class="settings-group-title">功能設定</div>
                        <div class="settings-item">
                            <div class="settings-item-info">
                                <div class="settings-item-label">Python 執行工具</div>
                                <div class="settings-item-desc">啟用後AI可執行 Python 程式碼進行數據分析與繪圖。</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="python-toggle" ${isPythonEnabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="settings-item">
                            <div class="settings-item-info">
                                <div class="settings-item-label">搜尋與瀏覽功能</div>
                                <div class="settings-item-desc">啟用後AI可進行網路搜尋並且瀏覽特定網址內容。</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="search-toggle" ${isSearchEnabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="settings-section" id="tab-privacy">
                    <div class="settings-group">
                        <div class="settings-group-title">資料管理</div>
                        <div class="settings-item">
                            <div class="settings-item-info">
                                <div class="settings-item-label">刪除所有對話</div>
                                <div class="settings-item-desc">清除此帳號下的所有對話歷史紀錄。</div>
                            </div>
                            <button class="settings-btn danger" id="delete-all-btn" ${!conversationListEl || conversationListEl.querySelectorAll('.history-item').length === 0 ? 'disabled' : ''}>刪除全部</button>
                        </div>
                    </div>
                </div>
                <div class="settings-section" id="tab-account">
                    <div class="settings-group">
                        <div class="settings-group-title">帳號安全</div>
                        <div class="settings-item">
                            <div class="settings-item-info">
                                <div class="settings-item-label">變更密碼</div>
                                <div class="settings-item-desc">修改您的登入密碼。</div>
                            </div>
                            <button class="settings-btn danger" id="change-password-btn">變更密碼</button>
                        </div>
                        <div class="settings-item">
                            <div class="settings-item-info">
                                <div class="settings-item-label">刪除帳號</div>
                                <div class="settings-item-desc">永久刪除您的帳號及所有相關資料。</div>
                            </div>
                            <button class="settings-btn danger" id="delete-account-btn">刪除帳號</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    modal.classList.add('is-open');
  });

  const close = () => {
    document.body.removeChild(overlay);
  };

  overlay.querySelector('#settings-close').onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const tabs = overlay.querySelectorAll('.settings-tab');
  const sections = overlay.querySelectorAll('.settings-section');
  tabs.forEach((tab) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));
      tab.classList.add('active');
      overlay.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
    };
  });

  overlay.querySelector('#python-toggle').onchange = async (e) => {
    isPythonEnabled = e.target.checked;
    if (currentUser) {
      try {
        await db.collection('userSettings').doc(currentUser.uid).set(
          {
            isPythonEnabled: isPythonEnabled,
          },
          { merge: true },
        );
      } catch (err) {
        console.error('儲存 Python 設定失敗', err);
      }
    }
    setAuthHint(`Python 執行工具已${isPythonEnabled ? '啟用' : '停用'}`);
  };

  overlay.querySelector('#search-toggle').onchange = async (e) => {
    isSearchEnabled = e.target.checked;
    if (!isSearchEnabled) {
      forceSearchNextTurn = false;
      if (typeof renderPromptTools === 'function') renderPromptTools();
    }
    if (currentUser) {
      try {
        await db.collection('userSettings').doc(currentUser.uid).set(
          {
            isSearchEnabled: isSearchEnabled,
          },
          { merge: true },
        );
      } catch (err) {
        console.error('儲存搜尋設定失敗', err);
      }
    }
    updateSearchPillState();
    setAuthHint(`搜尋功能已${isSearchEnabled ? '啟用' : '停用'}`);
  };

  overlay.querySelector('#delete-all-btn').onclick = async () => {
    close();
    await deleteAllConversations();
  };

  overlay.querySelector('#change-password-btn').onclick = () => {
    close();
    showChangePasswordModal();
  };

  overlay.querySelector('#delete-account-btn').onclick = async () => {
    close();
    await handleDeleteAccount();
  };
}

function showChangePasswordModal() {
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再變更密碼', true);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'custom-modal password-modal';

  modal.innerHTML = `
        <div class="password-modal-title">變更密碼</div>
        <div class="password-modal-field">
            <label for="pwd-old">目前密碼</label>
            <input type="password" id="pwd-old" placeholder="請輸入目前密碼" autocomplete="current-password">
        </div>
        <div class="password-modal-field">
            <label for="pwd-new">新密碼</label>
            <input type="password" id="pwd-new" placeholder="請輸入新密碼" autocomplete="new-password">
        </div>
        <div class="password-modal-field">
            <label for="pwd-confirm">確認新密碼</label>
            <input type="password" id="pwd-confirm" placeholder="請再次輸入新密碼" autocomplete="new-password">
        </div>
        <div class="password-modal-error" id="pwd-error"></div>
        <div class="password-modal-actions">
            <button class="custom-modal-btn cancel-btn" id="pwd-cancel">取消</button>
            <button class="custom-modal-btn confirm-btn" id="pwd-submit">確認變更</button>
        </div>
    `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    modal.classList.add('is-open');
  });

  const oldPwdEl = overlay.querySelector('#pwd-old');
  const newPwdEl = overlay.querySelector('#pwd-new');
  const confirmPwdEl = overlay.querySelector('#pwd-confirm');
  const errorEl = overlay.querySelector('#pwd-error');
  const cancelBtn = overlay.querySelector('#pwd-cancel');
  const submitBtn = overlay.querySelector('#pwd-submit');

  oldPwdEl.focus();

  const close = () => {
    document.removeEventListener('keydown', keyHandler);
    document.body.removeChild(overlay);
  };

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', keyHandler);

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  submitBtn.addEventListener('click', async () => {
    const oldPwd = oldPwdEl.value;
    const newPwd = newPwdEl.value;
    const confirmPwd = confirmPwdEl.value;

    errorEl.textContent = '';

    if (!oldPwd) {
      errorEl.textContent = '請輸入目前密碼';
      oldPwdEl.focus();
      return;
    }
    if (!newPwd) {
      errorEl.textContent = '請輸入新密碼';
      newPwdEl.focus();
      return;
    }
    if (newPwd !== confirmPwd) {
      errorEl.textContent = '新密碼與確認密碼不一致';
      confirmPwdEl.focus();
      return;
    }
    if (oldPwd === newPwd) {
      errorEl.textContent = '新密碼不能與目前密碼相同';
      newPwdEl.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '處理中...';

    try {
      const credential = firebase.auth.EmailAuthProvider.credential(
        user.email,
        oldPwd,
      );
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPwd);
      close();
      setAuthHint('密碼變更成功！');
    } catch (e) {
      console.error('變更密碼失敗', e);
      if (
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/invalid-credential'
      ) {
        errorEl.textContent = '目前密碼不正確';
        oldPwdEl.focus();
      } else if (e.code === 'auth/weak-password') {
        errorEl.textContent = '新密碼強度不足，請使用更複雜的密碼';
        newPwdEl.focus();
      } else if (e.code === 'auth/too-many-requests') {
        errorEl.textContent = '嘗試次數過多，請稍後再試';
      } else {
        errorEl.textContent = e.message || '變更密碼失敗，請稍後再試';
      }
      submitBtn.disabled = false;
      submitBtn.textContent = '確認變更';
    }
  });
}

function showReauthModal(message) {
  return new Promise((resolve) => {
    const user = auth.currentUser;
    if (!user) {
      resolve(false);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'custom-modal reauth-modal';

    modal.innerHTML = `
            <div class="reauth-modal-title">身份驗證</div>
            <div class="reauth-modal-desc">${message}</div>
            <div class="password-modal-field">
                <label for="reauth-pwd">請輸入您的密碼</label>
                <input type="password" id="reauth-pwd" placeholder="密碼" autocomplete="current-password">
            </div>
            <div class="password-modal-error" id="reauth-error"></div>
            <div class="password-modal-actions">
                <button class="custom-modal-btn cancel-btn" id="reauth-cancel">取消</button>
                <button class="custom-modal-btn confirm-btn" id="reauth-submit">驗證</button>
            </div>
        `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      modal.classList.add('is-open');
    });

    const pwdEl = overlay.querySelector('#reauth-pwd');
    const errorEl = overlay.querySelector('#reauth-error');
    const cancelBtn = overlay.querySelector('#reauth-cancel');
    const submitBtn = overlay.querySelector('#reauth-submit');

    pwdEl.focus();

    const close = (result) => {
      document.removeEventListener('keydown', keyHandler);
      document.body.removeChild(overlay);
      resolve(result);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    document.addEventListener('keydown', keyHandler);

    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    submitBtn.addEventListener('click', async () => {
      const pwd = pwdEl.value;
      if (!pwd) {
        errorEl.textContent = '請輸入密碼';
        pwdEl.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '驗證中...';

      try {
        const credential = firebase.auth.EmailAuthProvider.credential(
          user.email,
          pwd,
        );
        await user.reauthenticateWithCredential(credential);
        close(true);
      } catch (e) {
        console.error('身份驗證失敗', e);
        if (
          e.code === 'auth/wrong-password' ||
          e.code === 'auth/invalid-credential'
        ) {
          errorEl.textContent = '密碼不正確';
        } else if (e.code === 'auth/too-many-requests') {
          errorEl.textContent = '嘗試次數過多，請稍後再試';
        } else {
          errorEl.textContent = e.message || '驗證失敗，請稍後再試';
        }
        submitBtn.disabled = false;
        submitBtn.textContent = '驗證';
        pwdEl.focus();
      }
    });
  });
}
