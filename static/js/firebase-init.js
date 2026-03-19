const auth = firebase.auth();
const db = firebase.firestore();

try {
  db.settings({
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
    merge: true,
  });
} catch (e) {
  console.warn('無法套用 Firestore 連線設定', e);
}
