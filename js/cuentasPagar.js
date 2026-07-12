/* ============================================================
   CUENTASPAGAR.JS — Lo que la bodega debe a proveedores/terceros.
   Un mismo proveedor puede tener varias facturas (registros).

   El monto que se fía se puede registrar en Bs o en $, pero el
   saldo real (saldoUsd) SIEMPRE queda guardado en dólares. Si se
   registra en Bs, se convierte con la tasa del día al momento de
   crear la cuenta. A la hora de pagar, se cobra en $ y el
   equivalente en Bs se calcula con la tasa vigente en el sistema.
   ============================================================ */

const CXP = {
  // moneda: 'usd' | 'bs'. Si moneda es 'bs', `monto` se recibe en bolívares
  // y se convierte a $ con la tasa del día (tasaDelDia).
  async crear({ fecha, proveedor, factura, descripcion, moneda, monto, tasaDelDia }) {
    moneda = moneda === 'bs' ? 'bs' : 'usd';
    const montoBs = moneda === 'bs' ? Number(monto) || 0 : 0;
    const tasa = Number(tasaDelDia) || 0;
    const montoUsd = moneda === 'bs'
      ? (tasa ? Number((montoBs / tasa).toFixed(2)) : 0)
      : Number(monto) || 0;

    const registro = {
      fecha: fecha || new Date().toISOString().slice(0, 10),
      proveedor,
      factura: factura || '',
      descripcion: descripcion || '',
      monedaOriginal: moneda,
      montoBsOriginal: montoBs,   // informativo, solo si se registró en Bs
      tasaDelDia: tasa,           // tasa vigente cuando se registró (si aplica)
      montoUsd: montoUsd,
      saldoUsd: montoUsd,         // SALDO REAL, siempre en dólares
      estado: 'activa',
      abonos: [],
    };
    return DB.put('cuentasPagar', registro);
  },

  async listarActivas() {
    const todas = await DB.getAll('cuentasPagar');
    return todas.filter(c => c.estado === 'activa');
  },

  async listarTodas() {
    return DB.getAll('cuentasPagar');
  },

  async agrupadoPorProveedor() {
    const activas = await this.listarActivas();
    const grupos = {};
    for (const c of activas) {
      if (!grupos[c.proveedor]) grupos[c.proveedor] = [];
      grupos[c.proveedor].push(c);
    }
    return grupos;
  },

  async eliminar(id) {
    return DB.delete('cuentasPagar', id);
  },

  // Siempre requiere referencia bancaria. El monto se recibe en $;
  // el equivalente en Bs a pagar se calcula con la tasa del día vigente.
  async registrarPago(id, { tipo, montoUsd, referencia }) {
    const cuenta = await DB.get('cuentasPagar', id);
    if (!cuenta) return { ok: false, msg: 'Cuenta no encontrada.' };
    if (!referencia) return { ok: false, msg: 'La referencia bancaria es obligatoria.' };

    const tasaActual = await AUTH.getTasaDia();
    if (!tasaActual) return { ok: false, msg: 'Debes colocar la tasa del día antes de pagar.' };

    const monto = tipo === 'pago_completo' ? cuenta.saldoUsd : Number(montoUsd);
    if (!monto || monto <= 0 || monto > cuenta.saldoUsd + 0.01) {
      return { ok: false, msg: 'Monto inválido para esta cuenta.' };
    }
    const montoBsPagado = Number((monto * tasaActual).toFixed(2));

    cuenta.saldoUsd = Number((cuenta.saldoUsd - monto).toFixed(2));
    cuenta.abonos.push({
      fecha: new Date().toISOString().slice(0, 10),
      montoUsd: monto,
      montoBsPagado,
      tasaUsada: tasaActual,
      referencia,
      tipo,
    });
    if (cuenta.saldoUsd <= 0.005) {
      cuenta.estado = 'pagada';
      cuenta.saldoUsd = 0;
    }
    await DB.put('cuentasPagar', cuenta);
    return { ok: true, cuenta };
  },
};

window.CXP = CXP;
