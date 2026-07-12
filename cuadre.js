/* ============================================================
   CUADRE.JS — Cuadre de caja parcial y final, cierre del día,
   exportación a PDF con todos los detalles.
   ============================================================ */

const CUADRE = {
  async movimientosDelDia(fecha) {
    const todos = await DB.getAll('ventas');
    return todos.filter(v => v.fecha === fecha);
  },

  // Suma todos los pagos de todos los movimientos, agrupados por método
  async resumenPorMetodo(fecha) {
    const movimientos = await this.movimientosDelDia(fecha);
    const resumen = {};
    METODOS_PAGO.forEach(m => { if (m.id !== 'fiado' && m.id !== 'credito_favor') resumen[m.id] = { label: m.label, total: 0, detalle: [] }; });

    for (const mov of movimientos) {
      for (const p of (mov.pagos || [])) {
        if (p.metodo === 'fiado' || p.metodo === 'credito_favor') continue; // ni lo fiado ni el crédito usado son dinero nuevo en caja hoy
        if (!resumen[p.metodo]) resumen[p.metodo] = { label: p.metodo, total: 0, detalle: [] };
        resumen[p.metodo].total += Number(p.montoBs || 0);
        resumen[p.metodo].detalle.push({
          monto: Number(p.montoBs || 0),
          referencia: p.referencia || '',
          hora: mov.hora,
          etiqueta: mov.etiqueta || (mov.tipo === 'venta' ? 'Venta' : mov.tipo),
        });
      }
    }
    return resumen;
  },

  async totalGeneralBs(fecha) {
    const resumen = await this.resumenPorMetodo(fecha);
    return Object.values(resumen).reduce((s, r) => s + r.total, 0);
  },

  // Cuadre parcial: solo montos totales, visual, sin detalle de referencias
  async cuadreParcial(fecha) {
    const resumen = await this.resumenPorMetodo(fecha);
    const out = {};
    for (const key of Object.keys(resumen)) out[key] = { label: resumen[key].label, total: resumen[key].total };
    return out;
  },

  // Cuadre final: todo el detalle, referencias, y guarda el registro de cierre
  async cuadreFinal(fecha) {
    const resumen = await this.resumenPorMetodo(fecha);
    const tasa = await AUTH.getTasaDia();
    const totalBs = Object.values(resumen).reduce((s, r) => s + r.total, 0);
    return { fecha, tasa, resumen, totalBs, totalUsd: tasa ? Number((totalBs / tasa).toFixed(2)) : 0 };
  },

  async finalizarDia(fecha, claveCierre) {
    const valida = await AUTH.claveCierreCajaValida(claveCierre);
    if (!valida) return { ok: false, msg: 'Clave de cierre incorrecta.' };

    const cierre = await this.cuadreFinal(fecha);
    cierre.cerradoPor = AUTH.session ? AUTH.session.usuario : 'desconocido';
    cierre.fechaHoraCierre = new Date().toISOString();
    const id = await DB.put('cuadres', cierre);
    return { ok: true, id, cierre };
  },

  // ---------- EXPORTAR PDF DETALLADO ----------
  async exportarPDF(fecha) {
    const cierre = await this.cuadreFinal(fecha);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Cuadre de Caja', 14, 16);
    doc.setFontSize(10);
    doc.text(`Fecha: ${cierre.fecha}    Tasa del día: ${cierre.tasa} Bs/$`, 14, 23);
    doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, 14, 28);

    let y = 36;
    for (const key of Object.keys(cierre.resumen)) {
      const r = cierre.resumen[key];
      if (r.total <= 0 && r.detalle.length === 0) continue;
      doc.setFontSize(12);
      doc.text(`${r.label}: Bs ${r.total.toFixed(2)}`, 14, y);
      y += 4;
      if (r.detalle.length) {
        doc.autoTable({
          startY: y,
          head: [['Hora', 'Monto Bs', 'Referencia', 'Detalle']],
          body: r.detalle.map(d => [d.hora, d.monto.toFixed(2), d.referencia || '-', d.etiqueta]),
          styles: { fontSize: 8 },
          margin: { left: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
      } else {
        y += 6;
      }
    }

    doc.setFontSize(13);
    doc.text(`TOTAL GENERAL: Bs ${cierre.totalBs.toFixed(2)}  (~ $${cierre.totalUsd.toFixed(2)})`, 14, y + 4);

    doc.save(`cuadre_caja_${fecha}.pdf`);
  },
};

window.CUADRE = CUADRE;
