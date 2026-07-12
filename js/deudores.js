/* ============================================================
   DEUDORES.JS — Fiados: cada deuda es un registro individual,
   una misma persona (cédula) puede tener varias deudas activas.

   IMPORTANTE: el saldo que manda (la fuente de verdad) es SIEMPRE
   en dólares (saldoUsd). El monto en Bs que se registra es solo
   informativo, tomado con la tasa del día en que se creó la deuda.
   A la hora de cobrar, se cobra en $ y el equivalente en Bs se
   calcula con la tasa del día que esté puesta en el sistema en
   ese momento (no la de cuando se creó la deuda).
   ============================================================ */

const DEUD = {
  // Crea una deuda nueva (puede venir de una venta o registrarse manual).
  // montoBs: lo que se fió ese día en bolívares (informativo).
  // montoUsd: ese mismo monto convertido a $ con la tasa del día de la deuda.
  async crearDeuda({ deudorId, cedula, nombre, fecha, descripcion, nota, montoBs, montoUsd, tasaDelDia, origenVentaId }) {
    const usd = Number(montoUsd) || 0;
    const deuda = {
      cedula: cedula || '',
      nombre: nombre || '',
      fecha: fecha || new Date().toISOString().slice(0, 10),
      descripcion: descripcion || '',
      nota: nota || '',
      montoBs: Number(montoBs) || 0,
      montoUsd: usd,
      tasaDelDia: Number(tasaDelDia) || 0, // tasa vigente cuando se registró esta deuda
      saldoUsd: usd,                        // SALDO REAL, siempre en dólares
      estado: 'activa', // activa | pagada
      abonos: [], // historial de abonos/pagos
      origenVentaId: origenVentaId || null,
    };
    return DB.put('deudores', deuda);
  },

  async listarActivas() {
    const todas = await DB.getAll('deudores');
    return todas.filter(d => d.estado === 'activa');
  },

  async listarTodas() {
    return DB.getAll('deudores');
  },

  // Agrupa las deudas activas por cédula, para el menú "otro fiado / ya existe"
  // y para mostrar el TOTAL adeudado en $ por persona.
  async agrupadoPorCedula() {
    const activas = await this.listarActivas();
    const grupos = {};
    for (const d of activas) {
      const key = d.cedula || d.nombre || 'sin_cedula';
      if (!grupos[key]) grupos[key] = { cedula: d.cedula, nombre: d.nombre, deudas: [], totalUsd: 0 };
      grupos[key].deudas.push(d);
      grupos[key].totalUsd = Number((grupos[key].totalUsd + d.saldoUsd).toFixed(2));
    }
    return Object.values(grupos);
  },

  async buscarPorCedula(cedula) {
    const todas = await this.listarActivas();
    return todas.filter(d => d.cedula === cedula);
  },

  async eliminar(id) {
    return DB.delete('deudores', id);
  },

  // Registra abono o pago completo. tipo: 'abono' | 'pago_completo'.
  // El monto que ingresa el cajero es SIEMPRE en BOLÍVARES (lo que el
  // deudor entrega físicamente). El sistema calcula cuánto es en $ con
  // la tasa del día vigente, y ESO es lo que se resta al saldo (que
  // siempre vive en dólares). Esto también crea un movimiento de caja
  // (entra en el cuadre del día) por el monto Bs completo recibido.
  //
  // Si lo que entrega en Bs alcanza para más de lo que debía, el
  // excedente en Bs se guarda como CRÉDITO A FAVOR de esa persona
  // (ver CREDITOS.js) — nunca en dólares. Ese excedente ya entró a
  // caja hoy como parte de este mismo cobro, así que no se descuenta
  // ni se vuelve a contar cuando la persona use el crédito después.
  async registrarPago(deudaId, { tipo, montoBs, metodo, referencia }) {
    const deuda = await DB.get('deudores', deudaId);
    if (!deuda) return { ok: false, msg: 'Deuda no encontrada.' };

    const tasaActual = await AUTH.getTasaDia();
    if (!tasaActual) return { ok: false, msg: 'Debes colocar la tasa del día antes de cobrar una deuda.' };

    const montoBsRecibido = tipo === 'pago_completo'
      ? Number((deuda.saldoUsd * tasaActual).toFixed(2))
      : Number(montoBs);
    if (!montoBsRecibido || montoBsRecibido <= 0) {
      return { ok: false, msg: 'Coloca el monto del abono en bolívares.' };
    }

    const montoUsdEquivalente = Number((montoBsRecibido / tasaActual).toFixed(2));
    const aplicadoUsd = Math.min(montoUsdEquivalente, deuda.saldoUsd);
    const excedenteBs = Number((montoBsRecibido - aplicadoUsd * tasaActual).toFixed(2));

    deuda.saldoUsd = Number((deuda.saldoUsd - aplicadoUsd).toFixed(2));
    deuda.abonos.push({
      fecha: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 8),
      montoBsRecibido,
      montoUsdAplicado: aplicadoUsd,
      excedenteBs,
      tasaUsada: tasaActual,
      metodo,
      referencia: referencia || '',
      tipo,
    });
    if (deuda.saldoUsd <= 0.005) {
      deuda.estado = 'pagada';
      deuda.saldoUsd = 0;
    }
    await DB.put('deudores', deuda);

    // Si pagó de más, el excedente (en Bs) queda como crédito a su favor.
    if (excedenteBs > 0.01 && window.CREDITOS) {
      await CREDITOS.agregar(deuda.cedula, deuda.nombre, excedenteBs, `Abonó de más a la deuda #${deudaId}`);
    }

    // Movimiento de caja: entra como ingreso del día por el monto Bs COMPLETO
    // recibido (incluyendo lo que haya quedado como crédito, porque ese
    // dinero sí entró a caja hoy).
    const ahora = new Date();
    await DB.put('ventas', {
      tipo: tipo === 'pago_completo' ? 'pago_deuda' : 'abono_deuda',
      fecha: ahora.toISOString().slice(0, 10),
      hora: ahora.toTimeString().slice(0, 8),
      cajero: AUTH.session ? AUTH.session.usuario : 'desconocido',
      tasa: tasaActual,
      items: [],
      totalBs: montoBsRecibido,
      totalUsd: montoUsdEquivalente,
      pagos: [{ metodo, montoBs: montoBsRecibido, referencia: referencia || '' }],
      etiqueta: `${tipo === 'pago_completo' ? 'Pago' : 'Abono'} de deuda — ${deuda.nombre || deuda.cedula}` + (excedenteBs > 0.01 ? ` (incluye ${excedenteBs.toFixed(2)} Bs de crédito a favor)` : ''),
      deudorRelacionado: { deudaId, cedula: deuda.cedula, nombre: deuda.nombre },
    });

    return { ok: true, deuda, excedenteBs };
  },
};

window.DEUD = DEUD;
