async function handleDeleteAccount() {
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再執行此動作', true);
    return;
  }

  const confirmed = await showConfirmModal(
    '確定要刪除帳號嗎？此動作將永久刪除您的帳號及所有對話紀錄，且無法復原。',
  );
  if (!confirmed) return;

  const reauthenticated = await showReauthModal(
    '為了確認您的身份，請輸入密碼以繼續刪除帳號。',
  );
  if (!reauthenticated) return;

  try {
    setAuthHint('正在刪除帳號及所有資料...');

    const convsSnap = await db
      .collection('conversations')
      .where('userId', '==', user.uid)
      .get();

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
    }

    await user.delete();

    currentConversationId = null;
    currentUser = null;
    history = [];
    clearChatUI();
    clearHistoryList();
    setAuthHint('帳號已成功刪除，感謝您的使用。');
  } catch (e) {
    console.error('刪除帳號失敗', e);
    if (e.code === 'auth/requires-recent-login') {
      setAuthHint('安全驗證已過期，請重新登入後再試', true);
    } else {
      setAuthHint('刪除帳號失敗：' + (e.message || '請稍後再試'), true);
    }
  }
}

async function deleteConversation(convId) {
  if (!convId) return;
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再刪除對話', true);
    return;
  }

  const confirmed = await showConfirmModal(
    '確定要刪除這個對話嗎？此動作無法復原。',
  );
  if (!confirmed) return;

  try {
    const convRef = db.collection('conversations').doc(convId);
    const convSnap = await convRef.get();
    const convData = convSnap.data();

    if (!convSnap.exists || convData?.userId !== user.uid) {
      setAuthHint('無法刪除此對話', true);
      return;
    }

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

    if (currentConversationId === convId) {
      currentConversationId = null;
      history = [];
      clearChatUI();
    }

    await loadConversations(user.uid);
    setAuthHint('對話已刪除');
  } catch (e) {
    console.error('刪除對話失敗', e);
    setAuthHint('刪除對話失敗，請稍後再試', true);
  }
}

async function deleteMessagesByIds(convId, messageIds = []) {
  if (!convId || !Array.isArray(messageIds) || !messageIds.length) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    const messagesRef = db
      .collection('conversations')
      .doc(convId)
      .collection('messages');
    let batch = db.batch();
    let counter = 0;

    for (const id of messageIds) {
      if (!id) continue;
      batch.delete(messagesRef.doc(id));
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
  } catch (e) {
    console.error('刪除訊息失敗', e);
  }
}

async function updateConversationTitleIfEmpty(convId, text) {
  if (!convId || !text) return;
  try {
    const docRef = db.collection('conversations').doc(convId);
    const doc = await docRef.get();
    const data = doc.data() || {};
    if (!data.title || data.title === DEFAULT_CHAT_TITLE) {
      const title = text.slice(0, 40);
      await docRef.set({ title }, { merge: true });
    }
  } catch (e) {
    console.warn('更新標題失敗', e);
  }
}

async function generateAndSetConversationTitle(convId, userText, modelText) {
  if (!convId || !userText || !modelText) return;
  const user = auth.currentUser;
  if (!user) return;

  try {
    const docRef = db.collection('conversations').doc(convId);

    const prompt = `請根據以下對話，總結出一個簡短、精確的對話標題（不超過 15 個字），只回傳標題文字，不要有任何多餘的解釋、引號或標點符號。\n\n用戶：${userText}\n\n模型：${modelText}`;
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const data = await callApiWithRetry(requestBody, 3);
    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (part && part.text) {
      let title = part.text.trim();
      title = title.replace(/^["'「『【*(]+|["'」』】*)]+$/g, '').trim();
      if (title) {
        await docRef.update({
          title: title,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        animatingConversationId = convId;
      }
    }
  } catch (e) {
    console.warn('自動生成標題失敗', e);
  }
}

async function handleSignIn() {
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!email || !password) {
    setAuthHint('請輸入 email 與密碼', true);
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    setAuthHint('登入成功');
    clearAuthFields();
    closeMobileSidebar();
  } catch (e) {
    console.error(e);
    setAuthHint(e.message || '登入失敗', true);
  }
}

async function handleSignUp() {
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!email || !password) {
    setAuthHint('請輸入 email 與密碼', true);
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    setAuthHint('註冊並登入成功');
    clearAuthFields();
    closeMobileSidebar();
  } catch (e) {
    console.error(e);
    setAuthHint(e.message || '註冊失敗', true);
  }
}

async function handleSignOut() {
  try {
    await auth.signOut();
    clearChatUI();
    clearHistoryList();
    currentConversationId = null;
    setEditingState(false);
    setAuthHint('已登出');
    clearAuthFields(true);
    closeMobileSidebar();
    window.location.reload();
  } catch (e) {
    console.error(e);
    setAuthHint('登出失敗', true);
  }
}
