sendButtonEl.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!isAwaitingResponse) {
      sendMessage();
    }
  }
});

inputEl.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  updateSendButtonState();
  adjustChatPadding();
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const module = await import('./python-executor.js');
    pythonExecutorInstance = module.pythonExecutor;
    pythonExecutorInstance
      .init()
      .then(() => {})
      .catch((err) => {});
  } catch (e) {}

  updateAuthUI(currentUser);
  renderHistory();
  initCopyHandler(chatBoxEl);
  renderPromptTools();
  if (attachPhotoBtn) {
    attachPhotoBtn.innerHTML = ATTACH_PHOTO_ICON;
    attachPhotoBtn.addEventListener('click', () => {
      if (attachPhotoBtn.disabled || !attachPhotoInput) return;
      attachPhotoInput.click();
    });
  }
  if (attachPhotoInput) {
    const mimeTypes =
      Array.isArray(GEMINI_IMAGE_MIME_TYPES) && GEMINI_IMAGE_MIME_TYPES.length
        ? GEMINI_IMAGE_MIME_TYPES
        : ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
    attachPhotoInput.accept = mimeTypes.join(',');
    attachPhotoInput.addEventListener('change', () => {
      const file = attachPhotoInput.files?.[0] || null;
      if (!file) {
        setPendingImage(null);
        return;
      }
      if (mimeTypes.includes(file.type)) {
        setPendingImage(file);
      } else {
        setPendingImage(null);
        setAuthHint(`不支援的圖片格式，僅支援：${mimeTypes.join(', ')}`, true);
      }
    });
  }
  if (loginBtn) loginBtn.addEventListener('click', handleSignIn);
  if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
  if (logoutBtn) logoutBtn.addEventListener('click', handleSignOut);
  if (newChatBtn) newChatBtn.addEventListener('click', handleNewChat);
  if (tempChatBtn) {
    tempChatBtn.addEventListener('click', toggleTempChatMode);
    updateTempChatBtnUI();
  }
  const userProfileBtn = document.getElementById('user-profile');
  if (userProfileBtn)
    userProfileBtn.addEventListener('click', showSettingsModal);
  if (mobileMenuBtn)
    mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar());
  if (mobileBackdrop)
    mobileBackdrop.addEventListener('click', closeMobileSidebar);
  updateSendButtonState();
  updateConversationLockUI();
});

window.copyCode = function (btn, code) {
  navigator.clipboard
    .writeText(code)
    .then(() => {
      const originalText = btn.textContent;
      btn.textContent = '已複製！';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    })
    .catch((err) => {
      console.error('Copy failed', err);
    });
};

document.addEventListener('click', (e) => {
  const openDropdowns = document.querySelectorAll(
    '.thinking-dropdown.open, .prompt-dropdown.open',
  );
  openDropdowns.forEach((dropdown) => {
    const wrapper = dropdown.closest(
      '.thinking-pill-wrapper, .prompt-pill-wrapper',
    );
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
});
