const DATABASE_NAME = 'fiosra-document-recovery';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';

function supported() {
  return typeof indexedDB !== 'undefined';
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!supported()) {
      reject(new Error('This browser does not support local document recovery.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local document recovery.'));
  });
}

async function withStore(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local document recovery operation failed.'));
    });
  } finally {
    db.close();
  }
}

export function recoveryKey(sessionId, documentId) {
  return `${sessionId}:${documentId}`;
}

export async function saveDocumentRecovery(snapshot) {
  if (!snapshot?.sessionId || !snapshot?.documentId || !Array.isArray(snapshot.blocks)) return;
  let cleanBlocks;
  try {
    cleanBlocks = JSON.parse(JSON.stringify(snapshot.blocks));
  } catch {
    cleanBlocks = snapshot.blocks.map((b) => ({
      block_id: b.block_id || b.id,
      text: b.text || '',
      type: b.type || 'paragraph',
      role: b.role || 'claim',
    }));
  }
  const record = JSON.parse(JSON.stringify({
    key: String(recoveryKey(snapshot.sessionId, snapshot.documentId)),
    sessionId: String(snapshot.sessionId),
    documentId: String(snapshot.documentId),
    baseRevision: Number(snapshot.baseRevision || 0),
    blocks: cleanBlocks,
    savedAt: new Date().toISOString(),
  }));
  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function loadDocumentRecovery(sessionId, documentId) {
  if (!sessionId || !documentId || !supported()) return null;
  return withStore('readonly', (store) => store.get(recoveryKey(sessionId, documentId)));
}

export async function clearDocumentRecovery(sessionId, documentId) {
  if (!sessionId || !documentId || !supported()) return;
  await withStore('readwrite', (store) => store.delete(recoveryKey(sessionId, documentId)));
}
