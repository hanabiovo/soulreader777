/* ═══════════════════════════════════════
   STORE.JS - IndexedDB 封装
   ═══════════════════════════════════════ */

class Store {
  static dbName = 'SoulReaderDB';
  static version = 2;
  static db = null;

  static async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      
      req.onerror = () => {
        if (typeof App !== 'undefined') App.log('error', 'Store', 'IndexedDB 打开失败', req.error);
        reject(req.error);
      };
      req.onsuccess = () => {
        this.db = req.result;
        if (typeof App !== 'undefined') App.log('info', 'Store', `IndexedDB "${this.dbName}" 已连接`);
        resolve(this.db);
      };
      
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        }
        // v2：分页布局持久化缓存（key = bookId|viewport|typo params）
        if (!db.objectStoreNames.contains('pageCache')) {
          db.createObjectStore('pageCache', { keyPath: 'key' });
        }
      };
    });
  }

  static async getAll(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        App.log('error', 'Store', `getAll("${storeName}") 失败`, req.error);
        reject(req.error);
      };
    });
  }

  static async get(storeName, id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        App.log('error', 'Store', `get("${storeName}", ${id}) 失败`, req.error);
        reject(req.error);
      };
    });
  }

  static async put(storeName, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        App.log('error', 'Store', `put("${storeName}") 失败`, req.error);
        reject(req.error);
      };
    });
  }

  static async delete(storeName, id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        App.log('error', 'Store', `delete("${storeName}", ${id}) 失败`, req.error);
        reject(req.error);
      };
    });
  }

  static async clear(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => {
        App.log('info', 'Store', `clear("${storeName}") 完成`);
        resolve();
      };
      req.onerror = () => {
        App.log('error', 'Store', `clear("${storeName}") 失败`, req.error);
        reject(req.error);
      };
    });
  }

  // 切换数据库（用于旧数据找回）
  static async switchDB(dbName) {
    if (this.db) this.db.close();
    this.dbName = dbName;
    this.db = null;
    await this.init();
  }
}
