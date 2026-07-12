/* ============================================================
   CREDITOS.JS — Saldo a favor de un deudor (SIEMPRE en bolívares).

   Se genera cuando un deudor abona/paga una deuda con MÁS bolívares
   de los que hacían falta para saldarla. Ese excedente se guarda
   como crédito a su nombre, en Bs (nunca en dólares).

   Este crédito NO afecta la lógica del cuadre de caja: el día en
   que se generó, el dinero que entró ya se contó como pago normal
   de esa deuda. Cuando el cliente lo usa después para comprar,
   solo el "resto" que sí paga en ese momento entra a caja — el
   crédito aplicado es simplemente un descuento contra algo que ya
   entró a caja otro día, así que no debe sumarse de nuevo.

   ESTADOS:
   - 'activo'     → tiene saldo disponible, se puede usar como pago.
   - 'consumido'  → ya se gastó completo (solo o por una venta) o lo
                    bloqueó un admin manualmente. NO se borra: queda
                    como historia. Deja de aparecer como opción de
                    pago hasta que reciba un crédito nuevo (entonces
                    se reactiva solo). Solo se borra definitivamente
                    con el botón "Eliminar" del historial.
   ============================================================ */

const CREDITOS = {
  async obtener(cedula) {
    if (!cedula) return null;
    return DB.get('creditos', cedula);
  },

  // Créditos ACTIVOS con saldo disponible (para usar como pago en el POS).
  async listarConSaldo() {
    const todos = await DB.getAll('creditos');
    return todos.filter(c => c.estado !== 'consumido' && Number(c.saldoBs) > 0.005);
  },

  // Créditos CONSUMIDOS/BLOQUEADOS — el historial que se conserva hasta que se borren a mano.
  async listarConsumidos() {
    const todos = await DB.getAll('creditos');
    return todos.filter(c => c.estado === 'consumido');
  },

  // Suma un crédito a favor de la persona (por ejemplo, al abonar de más).
  // Si la persona tenía un crédito bloqueado/consumido, se reactiva solo.
  async agregar(cedula, nombre, montoBs, motivo) {
    if (!cedula) return; // el crédito solo aplica a deudores identificados por cédula
    const monto = Number(montoBs) || 0;
    if (monto <= 0) return;
    let c = await DB.get('creditos', cedula);
    if (!c) c = { cedula, nombre: nombre || cedula, saldoBs: 0, historial: [], estado: 'activo' };
    const estabaConsumido = c.estado === 'consumido';
    c.nombre = nombre || c.nombre;
    c.saldoBs = Number((c.saldoBs + monto).toFixed(2));
    c.estado = 'activo';
    c.historial.push({
      fecha: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 8),
      tipo: 'ingreso',
      montoBs: monto,
      motivo: motivo || 'Abono de más a una deuda',
    });
    if (estabaConsumido) {
      c.historial.push({
        fecha: new Date().toISOString().slice(0, 10),
        hora: new Date().toTimeString().slice(0, 8),
        tipo: 'reactivado',
        montoBs: 0,
        motivo: 'Se reactivó automáticamente al recibir un crédito nuevo',
      });
    }
    await DB.put('creditos', c);
    return c;
  },

  // Usa parte (o todo) el crédito de la persona, por ejemplo al comprar de nuevo.
  // Si con esto se agota el saldo, el crédito queda "consumido" (bloqueado),
  // pero el registro y su historial NUNCA se borran solos.
  async consumir(cedula, montoBs, motivo) {
    const c = await DB.get('creditos', cedula);
    if (!c) return { ok: false, msg: 'Esta persona no tiene crédito a favor.' };
    if (c.estado === 'consumido') return { ok: false, msg: 'Ese crédito ya está consumido/bloqueado.' };
    const monto = Number(montoBs) || 0;
    if (monto <= 0 || monto > c.saldoBs + 0.01) return { ok: false, msg: 'El monto supera el crédito disponible.' };
    c.saldoBs = Number((c.saldoBs - monto).toFixed(2));
    c.historial.push({
      fecha: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 8),
      tipo: 'uso',
      montoBs: monto,
      motivo: motivo || 'Usado en una compra',
    });
    if (c.saldoBs <= 0.005) {
      c.saldoBs = 0;
      c.estado = 'consumido';
      c.historial.push({
        fecha: new Date().toISOString().slice(0, 10),
        hora: new Date().toTimeString().slice(0, 8),
        tipo: 'bloqueado',
        montoBs: 0,
        motivo: 'Crédito agotado automáticamente (se usó por completo)',
      });
    }
    await DB.put('creditos', c);
    return { ok: true, credito: c };
  },

  // El admin (o un cajero con la clave del admin) BLOQUEA manualmente el
  // crédito restante de una persona — por ejemplo cuando ya se lo pagaron
  // aparte en efectivo. Ya NO borra nada: solo lo pasa a "consumido" y
  // queda en el historial, para borrarse solo si tú lo decides después.
  async bloquear(cedula, claveAdmin) {
    if (AUTH.session.rol !== 'admin') {
      const admin = await DB.get('usuarios', 'admin');
      if (!admin || admin.clave !== claveAdmin) return { ok: false, msg: 'Clave de administrador incorrecta.' };
    }
    const c = await DB.get('creditos', cedula);
    if (!c) return { ok: false, msg: 'Esta persona no tiene crédito a favor.' };
    c.historial.push({
      fecha: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 8),
      tipo: 'bloqueado',
      montoBs: c.saldoBs,
      motivo: 'Bloqueado manualmente (ya se lo consumieron o cobraron aparte)',
    });
    c.saldoBs = 0;
    c.estado = 'consumido';
    await DB.put('creditos', c);
    return { ok: true };
  },

  // Borra el registro por completo y para siempre — SOLO el administrador
  // puede hacerlo, y SOLO desde el historial de consumidos. No hay forma de
  // que un cajero lo haga, ni siquiera con una clave.
  async eliminar(cedula) {
    if (!AUTH.session || AUTH.session.rol !== 'admin') {
      return { ok: false, msg: 'Solo el administrador puede eliminar créditos del historial.' };
    }
    await DB.delete('creditos', cedula);
    return { ok: true };
  },
};

window.CREDITOS = CREDITOS;
