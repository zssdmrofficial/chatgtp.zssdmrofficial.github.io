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

const IMAGE_CHUNK_SIZE = 900000;

async function saveImageChunks(convId, msgId, imageDataUrls) {
  const chunksRef = db
    .collection('conversations')
    .doc(convId)
    .collection('messages')
    .doc(msgId)
    .collection('imageChunks');
  let batch = db.batch();
  let counter = 0;
  for (let imgIdx = 0; imgIdx < imageDataUrls.length; imgIdx++) {
    const dataUrl = imageDataUrls[imgIdx];
    const totalChunks = Math.ceil(dataUrl.length / IMAGE_CHUNK_SIZE);
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * IMAGE_CHUNK_SIZE;
      const chunkData = dataUrl.substring(start, start + IMAGE_CHUNK_SIZE);
      batch.set(chunksRef.doc(`${imgIdx}_${chunkIdx}`), {
        i: imgIdx,
        c: chunkIdx,
        t: totalChunks,
        d: chunkData,
      });
      counter++;
      if (counter === FIRESTORE_BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        counter = 0;
      }
    }
  }
  if (counter > 0) {
    await batch.commit();
  }
}

async function loadImageChunks(convId, msgId) {
  const snap = await db
    .collection('conversations')
    .doc(convId)
    .collection('messages')
    .doc(msgId)
    .collection('imageChunks')
    .get();
  if (snap.empty) return null;
  const map = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (!map.has(d.i)) map.set(d.i, []);
    map.get(d.i).push(d);
  });
  const result = [];
  [...map.keys()]
    .sort((a, b) => a - b)
    .forEach((key) => {
      const chunks = map.get(key).sort((a, b) => a.c - b.c);
      result.push(chunks.map((ch) => ch.d).join(''));
    });
  return result.length > 0 ? result : null;
}

async function deleteImageChunks(convId, msgId) {
  const snap = await db
    .collection('conversations')
    .doc(convId)
    .collection('messages')
    .doc(msgId)
    .collection('imageChunks')
    .get();
  if (snap.empty) return;
  let batch = db.batch();
  let counter = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
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
        imageDataUrls: null,
        hasImages: data.hasImages === true,
      };
    });
    currentConversationId = convId;
    renderHistory();
    const loadPromises = history.map(async (msg) => {
      if (!msg.hasImages || !msg.messageId) return;
      const urls = await loadImageChunks(convId, msg.messageId);
      if (urls) msg.imageDataUrls = urls;
    });
    await Promise.all(loadPromises);
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
  imageDataUrls = null,
) {
  if (!convId) return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const messagesRef = db
      .collection('conversations')
      .doc(convId)
      .collection('messages');
    const docData = {
      role,
      content,
      displayContent: displayContent || content,
      isHtml,
      parts: parts || [{ text: content }],
      userId: user.uid,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (imageDataUrls && imageDataUrls.length > 0) {
      docData.hasImages = true;
    }
    const docRef = await messagesRef.add(docData);

    if (imageDataUrls && imageDataUrls.length > 0) {
      await saveImageChunks(convId, docRef.id, imageDataUrls);
    }

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
