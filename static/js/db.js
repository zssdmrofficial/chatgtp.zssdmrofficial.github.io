async function loadConversations(uid) {
  if (!uid) {
    clearHistoryList();
    return;
  }
  try {
    const snap = await db
      .collection('conversations')
      .where('userId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .get();
    const conversations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderConversationList(conversations);
    if (!currentConversationId && conversations.length) {
      loadMessages(conversations[0].id);
    }
  } catch (e) {
    console.error('載入對話列表失敗', e);
    setAuthHint('載入對話列表失敗，請稍後再試', true);
  }
}

async function findUnusedNewChat(uid) {
  if (!uid) return null;
  try {
    const snap = await db
      .collection('conversations')
      .where('userId', '==', uid)
      .where('title', '==', DEFAULT_CHAT_TITLE)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const messagesSnap = await doc.ref.collection('messages').limit(1).get();
    if (!messagesSnap.empty) return null;

    return doc.id;
  } catch (e) {
    console.warn('查詢未使用的對話失敗', e);
    return null;
  }
}

async function createConversation(title = DEFAULT_CHAT_TITLE) {
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再建立對話', true);
    return null;
  }
  try {
    if (title === DEFAULT_CHAT_TITLE) {
      const existingDraftId = await findUnusedNewChat(user.uid);
      if (existingDraftId) {
        currentConversationId = existingDraftId;
        await loadMessages(existingDraftId);
        setAuthHint(`請先使用已建立的${DEFAULT_CHAT_TITLE}`);
        return existingDraftId;
      }
    }

    if (isCreatingConversation) {
      setAuthHint('正在建立對話，請稍候');
      return currentConversationId;
    }
    isCreatingConversation = true;

    const doc = await db.collection('conversations').add({
      userId: user.uid,
      title,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentConversationId = doc.id;
    history = [];
    renderHistory();
    await loadConversations(user.uid);
    return doc.id;
  } catch (e) {
    console.error('建立對話失敗', e);
    setAuthHint('建立對話失敗，請稍後再試', true);
    return null;
  } finally {
    isCreatingConversation = false;
  }
}

async function handleNewChat() {
  if (isTempChatMode) {
    isTempChatMode = false;
    if (typeof updateTempChatBtnUI === 'function') updateTempChatBtnUI();
  }
  if (!currentUser) {
    setAuthHint('請先登入再建立對話', true);
    return;
  }
  if (isConversationActionLocked()) {
    notifyConversationActionLocked('建立新對話');
    return;
  }
  await createConversation(DEFAULT_CHAT_TITLE);
}

async function loadMessages(convId) {
  if (!convId) return;
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再讀取對話', true);
    return;
  }
  if (isTempChatMode) {
    isTempChatMode = false;
    if (typeof updateTempChatBtnUI === 'function') updateTempChatBtnUI();
  }
  try {
    const snap = await db
      .collection('conversations')
      .doc(convId)
      .collection('messages')
      .orderBy('ts', 'asc')
      .get();
    history = snap.docs.map((d) => {
      const data = d.data();
      const content = data.content || '';
      const displayText = data.displayContent || content;
      return {
        role: data.role,
        parts: data.parts || [{ text: content }],
        displayText,
        messageId: d.id,
        isHtml: data.isHtml === true,
      };
    });
    currentConversationId = convId;
    renderHistory();
    await loadConversations(user.uid);
  } catch (e) {
    console.error('載入訊息失敗', e);
    setAuthHint('載入訊息失敗，請稍後再試', true);
  }
}

async function addMessage(
  convId,
  role,
  content,
  displayContent = null,
  isHtml = false,
  parts = null,
) {
  if (!convId) return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const messagesRef = db
      .collection('conversations')
      .doc(convId)
      .collection('messages');
    const docRef = await messagesRef.add({
      role,
      content,
      displayContent: displayContent || content,
      isHtml,
      parts: parts || [{ text: content }],
      userId: user.uid,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('conversations').doc(convId).update({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  } catch (e) {
    console.error('寫入訊息失敗', e);
    return null;
  }
}

async function renameConversation(convId, newTitle) {
  if (!convId || !newTitle || newTitle.trim() === '') return;
  const user = auth.currentUser;
  if (!user) {
    setAuthHint('請先登入再重新命名對話', true);
    return;
  }

  try {
    const docRef = db.collection('conversations').doc(convId);
    const docSnap = await docRef.get();
    const data = docSnap.data();

    if (!docSnap.exists || data?.userId !== user.uid) {
      setAuthHint('無法重新命名此對話', true);
      return;
    }

    await docRef.update({
      title: newTitle.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await loadConversations(user.uid);
    setAuthHint('對話已重新命名');
  } catch (e) {
    console.error('重新命名對話失敗', e);
    setAuthHint('重新命名對話失敗，請稍後再試', true);
  }
}
