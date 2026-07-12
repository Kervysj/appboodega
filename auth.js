/* ============================================================
   AUTH.JS — Roles, login, claves, reset total del sistema
   ============================================================ */

const CLAVE_RESET_FIJA = 'Adri2712.23536980'; // clave de borrado total, no configurable

const AUTH = {
  session: null, // { usuario, rol }

  async init() {
    // Primera vez: crear configuración y usuarios por defecto
    const admin = await DB.get('usuarios', 'admin');
    if (!admin) {
      await DB.put('usuarios', { usuario: 'admin', clave: 'adri2712', rol: 'admin', activo: true });
      await DB.put('usuarios', { usuario: 'caja1', clave: 'caja1123', rol: 'cajero', activo: true });
    }
    const claveCierre = await DB.get('config', 'claveCierreCaja');
    if (!claveCierre) await DB.put('config', { clave: 'claveCierreCaja', valor: 'adri2712' });
    const tasa = await DB.get('config', 'tasaDia');
    if (!tasa) await DB.put('config', { clave: 'tasaDia', valor: 0, fecha: '' });
  },

  async login(usuario, clave) {
    const u = await DB.get('usuarios', usuario.trim().toLowerCase());
    if (!u || !u.activo) return { ok: false, msg: 'Usuario no encontrado.' };
    if (u.clave !== clave) return { ok: false, msg: 'Clave incorrecta.' };
    this.session = { usuario: u.usuario, rol: u.rol };
    sessionStorage.setItem('bodega_session', JSON.stringify(this.session));
    return { ok: true, rol: u.rol };
  },

  logout() {
    this.session = null;
    sessionStorage.removeItem('bodega_session');
  },

  restoreSession() {
    const raw = sessionStorage.getItem('bodega_session');
    if (raw) this.session = JSON.parse(raw);
    return this.session;
  },

  async cambiarClave(usuario, claveActual, claveNueva) {
    const u = await DB.get('usuarios', usuario);
    if (!u || u.clave !== claveActual) return { ok: false, msg: 'Clave actual incorrecta.' };
    u.clave = claveNueva;
    await DB.put('usuarios', u);
    return { ok: true };
  },

  async crearCajero(usuario, clave) {
    usuario = usuario.trim().toLowerCase();
    const existe = await DB.get('usuarios', usuario);
    if (existe) return { ok: false, msg: 'Ese usuario ya existe.' };
    await DB.put('usuarios', { usuario, clave, rol: 'cajero', activo: true });
    return { ok: true };
  },

  async listarCajeros() {
    const todos = await DB.getAll('usuarios');
    return todos.filter(u => u.rol === 'cajero');
  },

  async listarUsuariosActivos() {
    const todos = await DB.getAll('usuarios');
    return todos.filter(u => u.activo);
  },

  async toggleCajero(usuario, activo) {
    const u = await DB.get('usuarios', usuario);
    if (!u) return;
    u.activo = activo;
    await DB.put('usuarios', u);
  },

  async eliminarCajero(usuario) {
    return DB.delete('usuarios', usuario);
  },

  async claveCierreCajaValida(clave) {
    const c = await DB.get('config', 'claveCierreCaja');
    return c && c.valor === clave;
  },

  async cambiarClaveCierreCaja(nueva) {
    await DB.put('config', { clave: 'claveCierreCaja', valor: nueva });
  },

  async setTasaDia(valor) {
    const hoy = new Date().toISOString().slice(0, 10);
    await DB.put('config', { clave: 'tasaDia', valor: Number(valor), fecha: hoy });
  },

  async getTasaDia() {
    const t = await DB.get('config', 'tasaDia');
    return t ? t.valor : 0;
  },

  // Reset del sistema: exige la clave fija de seguridad.
  // Borra TODO (ventas, deudores/cuentas por cobrar, cuentas por pagar,
  // créditos, cuadres y cajeros), pero:
  //  - deja el usuario "admin" con su clave POR DEFECTO (adri2712)
  //  - deja el inventario con 1 solo producto de referencia (no vacío)
  // Si había un respaldo (Excel maestro o descarga manual), esa copia
  // vive fuera de la base de datos y no se ve afectada por este reset.
  async resetTotal(claveIngresada) {
    if (claveIngresada !== CLAVE_RESET_FIJA) return { ok: false, msg: 'Clave de reset incorrecta.' };

    // Guarda un producto de referencia (el primero que exista) para
    // dejarlo como único registro del inventario tras el reset.
    const productos = await DB.getAll('productos');
    const productoReferencia = productos[0] || {
      codigo: '0001', categoria: 'general', descripcion: 'Producto de ejemplo',
      unidadMedida: 'unidad', cantidadBulto: 1, cantidadPorUnidad: 1,
      precioBulto: 1, porcentajeGanancia: 25, fijoBs: false, montoFijoBs: 0,
      permiteFraccion: false, precioUnidad: 1, precioVentaUnidad: 1.25, precioBs: 0,
    };
    delete productoReferencia.id;

    await DB.clearAll();
    sessionStorage.clear();
    await this.init(); // recrea config básica y (si no existiera) el admin por defecto

    // El admin queda SIEMPRE con la clave por defecto tras un reset,
    // sin importar cuál tuviera configurada antes. Los cajeros (incluido
    // el "caja1" de fábrica) quedan eliminados: solo sobrevive el admin.
    await DB.put('usuarios', { usuario: 'admin', clave: 'adri2712', rol: 'admin', activo: true });
    await DB.delete('usuarios', 'caja1');

    // Inventario: se deja solo 1 registro (no vacío)
    await DB.put('productos', productoReferencia);

    return { ok: true };
  },
};

window.AUTH = AUTH;
