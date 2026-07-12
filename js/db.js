/* ============================================================
   DB.JS — Motor de almacenamiento offline (IndexedDB)
   Toda la información de la bodega vive aquí: productos, ventas,
   deudores, cuentas por pagar, cuadres, configuración.
   No requiere internet. Sobrevive a cortes de luz porque cada
   operación es una transacción confirmada en disco por el navegador.
   ============================================================ */

const DB_NAME = 'bodega_db';
const DB_VERSION = 2; // subido a 2 para crear el store "creditos" en instalaciones ya existentes

const STORES = [
  { name: 'config', keyPath: 'clave' },                    // clave-valor: tasa, claves, contador etc.
  { name: 'usuarios', keyPath: 'usuario' },                 // admin, caja1, caja2...
  { name: 'productos', keyPath: 'id', autoIncrement: true },
  { name: 'ventas', keyPath: 'id', autoIncrement: true },
  { name: 'deudores', keyPath: 'id', autoIncrement: true }, // cada registro = una deuda individual
  { name: 'cuentasPagar', keyPath: 'id', autoIncrement: true },
  { name: 'cuadres', keyPath: 'id', autoIncrement: true },
  { name: 'creditos', keyPath: 'cedula' },                  // saldo a favor (en Bs) de un deudor que abonó de más
];

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(s => {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, {
            keyPath: s.keyPath,
            autoIncrement: !!s.autoIncrement,
          });
        }
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put(value);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  async get(storeName, key) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },

  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },

  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },

  async clearStore(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  },

  async clearAll() {
    for (const s of STORES) await this.clearStore(s.name);
  },

  // Vuelca TODA la base en un objeto plano, usado para el respaldo Excel
  async dumpAll() {
    const out = {};
    for (const s of STORES) out[s.name] = await this.getAll(s.name);
    return out;
  },
};

window.DB = DB;
window.DB_STORES = STORES;
