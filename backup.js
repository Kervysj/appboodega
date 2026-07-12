/* ============================================================
   BACKUP.JS — Autoguardado cada 1 minuto en UN SOLO Excel maestro
   usando File System Access API (Chrome / Edge).
   Si el navegador no la soporta, cae en modo "backup manual".
   ============================================================ */

const BACKUP = {
  handle: null,
  intervalId: null,
  soportado: 'showSaveFilePicker' in window,

  async elegirArchivoMaestro() {
    if (!this.soportado) return { ok: false, msg: 'Este navegador no soporta guardado automático en archivo. Usa el respaldo manual.' };
    try {
      this.handle = await window.showSaveFilePicker({
        suggestedName: 'bodega_maestro.xlsx',
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      await DB.put('config', { clave: 'fileHandleGuardado', valor: true });
      // Guarda el handle en IndexedDB para recuperarlo la próxima vez (Chrome/Edge lo permiten)
      await DB.put('config', { clave: 'fileHandleObj', handle: this.handle });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: 'No se seleccionó archivo.' };
    }
  },

  async intentarRecuperarHandle() {
    if (!this.soportado) return false;
    try {
      const guardado = await DB.get('config', 'fileHandleObj');
      if (!guardado || !guardado.handle) return false;
      const permiso = await guardado.handle.queryPermission({ mode: 'readwrite' });
      if (permiso === 'granted') {
        this.handle = guardado.handle;
        return true;
      }
      if (permiso === 'prompt') {
        const nuevoPermiso = await guardado.handle.requestPermission({ mode: 'readwrite' });
        if (nuevoPermiso === 'granted') {
          this.handle = guardado.handle;
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  async guardarAhora() {
    if (!this.handle) return { ok: false, msg: 'No hay archivo maestro configurado.' };
    try {
      const dump = await DB.dumpAll();
      const wb = XLSX.utils.book_new();
      for (const storeName of Object.keys(dump)) {
        const rows = dump[storeName];
        const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(sin datos)']]);
        XLSX.utils.book_append_sheet(wb, ws, storeName.slice(0, 31));
      }
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const writable = await this.handle.createWritable();
      await writable.write(wbout);
      await writable.close();
      document.dispatchEvent(new CustomEvent('bodega:autoguardado', { detail: { hora: new Date().toLocaleTimeString('es-VE') } }));
      return { ok: true };
    } catch (e) {
      console.error('Error autoguardando:', e);
      return { ok: false, msg: e.message };
    }
  },

  iniciarAutoguardado(intervaloMs = 60000) {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.guardarAhora(), intervaloMs);
  },

  detenerAutoguardado() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  },
};

window.BACKUP = BACKUP;
