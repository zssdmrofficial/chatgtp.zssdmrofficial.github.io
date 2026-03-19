auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  updateUserProfile(user);
  updateAuthUI(user);
  if (user) {
    setAuthHint(`已登入：${user.email}`);

    try {
      const userDoc = await db.collection('userSettings').doc(user.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        if (typeof data.isPythonEnabled !== 'undefined') {
          isPythonEnabled = data.isPythonEnabled;
        }
        if (typeof data.isSearchEnabled !== 'undefined') {
          isSearchEnabled = data.isSearchEnabled;
        } else {
          isSearchEnabled = false;
        }
      } else {
        isPythonEnabled = true;
        isSearchEnabled = false;
      }
    } catch (e) {
      console.warn('讀取使用者設定失敗', e);
    }

    await loadConversations(user.uid);
    updateSearchPillState();
    updateSendButtonState();
  } else {
    setAuthHint('未登入：對話不會被儲存');
    isPythonEnabled = true;
    isSearchEnabled = false;
    forceSearchNextTurn = false;
    isTempChatMode = false;
    if (typeof updateTempChatBtnUI === 'function') updateTempChatBtnUI();
    clearHistoryList();
    currentConversationId = null;
    closeMobileSidebar();
    updateSearchPillState();
    updateSendButtonState();
  }
});
