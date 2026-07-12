/* ============================================================
   VENTAS.JS — Punto de venta: carrito, pagos mixtos, fiado
   ============================================================ */

const METODOS_PAGO = [
  { id: 'pago_movil', label: 'Pago móvil', requiereReferencia: true },
  { id: 'punto_venta', label: 'Punto de venta', requiereReferencia: false },
  { id: 'transferencia', label: 'Transferencia', requiereReferencia: true },
  { id: 'dolares_fisico', label: 'Dólares ($) físico', requiereReferencia: false },
  { id: 'efectivo', label: 'Efectivo', requiereReferencia: false },
  { id: 'biopago', label: 'Biopago', requiereReferencia: false },
  { id: 'fiado', label: 'Fiado / Deuda', requiereReferencia: false },
  { id: 'credito_favor', label: 'Crédito a favor del cliente (Bs)', requiereReferencia: false },
];

const VENTAS = {
  carrito: [], // { productoId, codigo, descripcion, cantidad, precioBs, precioUsd }

  limpiarCarrito() { this.carrito = []; },

  agregarProducto(producto, cantidad = 1, modo = 'unidad') {
    const claveLinea = `${producto.id}_${modo}`;
    const existente = this.carrito.find(i => i.claveLinea === claveLinea);
    if (existente) {
      existente.cantidad += cantidad;
      return;
    }
    const esBulto = modo === 'bulto';
    this.carrito.push({
      claveLinea,
      productoId: producto.id,
      codigo: producto.codigo,
      descripcion: producto.descripcion + (esBulto ? ` (${producto.unidadMedida} completo)` : ' (unidad)'),
      unidadMedida: producto.unidadMedida,
      modo,
      cantidad,
      precioBs: esBulto ? producto.precioBsBulto : producto.precioBs,
      precioUsd: esBulto ? producto.precioVentaBulto : producto.precioVentaUnidad,
    });
  },

  quitarProducto(claveLinea) {
    this.carrito = this.carrito.filter(i => i.claveLinea !== claveLinea);
  },

  actualizarCantidad(claveLinea, cantidad) {
    const item = this.carrito.find(i => i.claveLinea === claveLinea);
    if (item) item.cantidad = Math.max(0, cantidad);
  },

  totalBs() {
    return this.carrito.reduce((s, i) => s + i.precioBs * i.cantidad, 0);
  },

  totalUsd() {
    return this.carrito.reduce((s, i) => s + i.precioUsd * i.cantidad, 0);
  },

  // pagos: [{ metodo, montoBs, referencia }]
  validarPagos(pagos) {
    const total = Number(this.totalBs().toFixed(2));
    const sumaPagos = Number(pagos.reduce((s, p) => s + Number(p.montoBs || 0), 0).toFixed(2));
    if (Math.abs(sumaPagos - total) > 0.5) {
      return { ok: false, msg: `Los pagos (Bs ${sumaPagos.toFixed(2)}) no cuadran con el total (Bs ${total.toFixed(2)}).` };
    }
    for (const p of pagos) {
      const def = METODOS_PAGO.find(m => m.id === p.metodo);
      if (def && def.requiereReferencia && !p.referencia) {
        return { ok: false, msg: `El método "${def.label}" requiere número de referencia.` };
      }
      if (p.metodo === 'fiado' && !p.deudorId && !p.cedulaNueva) {
        return { ok: false, msg: 'Debes seleccionar o registrar un deudor para la parte fiada.' };
      }
      if (p.metodo === 'credito_favor' && !p.cedula) {
        return { ok: false, msg: 'Debes seleccionar la persona dueña del crédito a favor.' };
      }
    }
    return { ok: true };
  },

  async registrarVenta(pagos) {
    if (this.carrito.length === 0) return { ok: false, msg: 'El carrito está vacío.' };
    const val = this.validarPagos(pagos);
    if (!val.ok) return val;

    // Verifica que ningún pago con "crédito a favor" supere el saldo disponible
    // de esa persona (puede haber varias filas de la misma persona).
    const totalesCreditoPorCedula = {};
    for (const p of pagos) {
      if (p.metodo === 'credito_favor') {
        totalesCreditoPorCedula[p.cedula] = (totalesCreditoPorCedula[p.cedula] || 0) + Number(p.montoBs || 0);
      }
    }
    for (const cedula of Object.keys(totalesCreditoPorCedula)) {
      const credito = await CREDITOS.obtener(cedula);
      const disponible = credito ? credito.saldoBs : 0;
      if (totalesCreditoPorCedula[cedula] > disponible + 0.01) {
        return { ok: false, msg: `Esa persona solo tiene Bs ${disponible.toFixed(2)} de crédito disponible.` };
      }
    }

    const tasa = await AUTH.getTasaDia();
    const ahora = new Date();
    const venta = {
      tipo: 'venta',
      fecha: ahora.toISOString().slice(0, 10),
      hora: ahora.toTimeString().slice(0, 8),
      cajero: AUTH.session ? AUTH.session.usuario : 'desconocido',
      tasa,
      items: this.carrito.map(i => ({ ...i })),
      totalBs: Number(this.totalBs().toFixed(2)),
      totalUsd: Number(this.totalUsd().toFixed(2)),
      pagos: pagos.map(p => ({ ...p })),
    };
    const id = await DB.put('ventas', venta);

    // Si hay parte pagada con crédito a favor, se descuenta de su saldo.
    // Este monto NO entra al cuadre del día (no se guarda como "pago" real
    // de caja): el dinero ya había entrado el día que se generó el crédito.
    for (const p of pagos) {
      if (p.metodo === 'credito_favor') {
        await CREDITOS.consumir(p.cedula, Number(p.montoBs), `Usado en venta #${id}`);
      }
    }

    // Si hay parte fiada, crear el registro de deuda correspondiente
    for (const p of pagos) {
      if (p.metodo === 'fiado') {
        await DEUD.crearDeuda({
          deudorId: p.deudorId || null,
          cedula: p.cedula || '',
          nombre: p.nombreDeudor || '',
          fecha: venta.fecha,
          descripcion: `Venta #${id}: ` + venta.items.map(i => `${i.descripcion} x${i.cantidad}`).join(', '),
          nota: p.nota || '',
          montoBs: Number(p.montoBs),
          montoUsd: Number((p.montoBs / (tasa || 1)).toFixed(2)),
          tasaDelDia: tasa,
          origenVentaId: id,
        });
      }
    }

    this.limpiarCarrito();
    return { ok: true, ventaId: id, venta };
  },

  async listarVentasDelDia(fecha) {
    const todas = await DB.getAll('ventas');
    return todas.filter(v => v.fecha === fecha);
  },

  async obtenerVenta(id) {
    return DB.get('ventas', id);
  },

  // Edita SOLO la forma en que se pagó una venta ya registrada (no toca productos ni total).
  // Sirve para corregir errores de cobro, ej: se anotó "dólares" pero en realidad fue "efectivo Bs".
  async editarPagos(ventaId, nuevosPagos) {
    const venta = await DB.get('ventas', ventaId);
    if (!venta || venta.tipo !== 'venta') return { ok: false, msg: 'Venta no encontrada.' };

    const total = Number(venta.totalBs.toFixed(2));
    const sumaPagos = Number(nuevosPagos.reduce((s, p) => s + Number(p.montoBs || 0), 0).toFixed(2));
    if (Math.abs(sumaPagos - total) > 0.5) {
      return { ok: false, msg: `Los pagos (Bs ${sumaPagos.toFixed(2)}) no cuadran con el total de la venta (Bs ${total.toFixed(2)}).` };
    }
    for (const p of nuevosPagos) {
      const def = METODOS_PAGO.find(m => m.id === p.metodo);
      if (def && def.requiereReferencia && !p.referencia) {
        return { ok: false, msg: `El método "${def.label}" requiere número de referencia.` };
      }
      if (p.metodo === 'fiado' && !p.deudorId && !p.cedulaNueva && !p.cedula) {
        return { ok: false, msg: 'Debes seleccionar o registrar un deudor para la parte fiada.' };
      }
    }

    // Si la venta original dejó una deuda (fiado) y esa deuda ya tuvo abonos o fue pagada,
    // no se puede reajustar automáticamente: hay que hacerlo manualmente desde "Deudores".
    const todasDeudas = await DB.getAll('deudores');
    const deudasVenta = todasDeudas.filter(d => d.origenVentaId === ventaId);
    const deudasConMovimiento = deudasVenta.filter(d => (d.abonos && d.abonos.length > 0) || d.estado === 'pagada');
    if (deudasConMovimiento.length > 0) {
      return { ok: false, msg: 'No se puede editar: la parte fiada de esta venta ya tiene abonos o fue pagada. Ajusta el saldo desde "Deudores".' };
    }

    // Reemplaza las deudas viejas (sin movimientos) por las que correspondan al pago corregido
    for (const d of deudasVenta) await DB.delete('deudores', d.id);

    const tasa = venta.tasa || (await AUTH.getTasaDia());
    for (const p of nuevosPagos) {
      if (p.metodo === 'fiado') {
        await DEUD.crearDeuda({
          deudorId: p.deudorId || null,
          cedula: p.cedula || '',
          nombre: p.nombreDeudor || '',
          fecha: venta.fecha,
          descripcion: `Venta #${ventaId}: ` + venta.items.map(i => `${i.descripcion} x${i.cantidad}`).join(', '),
          nota: 'Ajustado desde edición de venta',
          montoBs: Number(p.montoBs),
          montoUsd: Number((p.montoBs / (tasa || 1)).toFixed(2)),
          tasaDelDia: tasa,
          origenVentaId: ventaId,
        });
      }
    }

    const ahora = new Date();
    venta.historialPagos = venta.historialPagos || [];
    venta.historialPagos.push({
      fecha: ahora.toISOString().slice(0, 10),
      hora: ahora.toTimeString().slice(0, 8),
      usuario: AUTH.session ? AUTH.session.usuario : 'desconocido',
      pagosAnteriores: venta.pagos,
    });
    venta.pagos = nuevosPagos.map(p => ({ ...p }));
    venta.editada = true;
    await DB.put('ventas', venta);

    return { ok: true, venta };
  },

  METODOS_PAGO,
};

window.VENTAS = VENTAS;
window.METODOS_PAGO = METODOS_PAGO;
