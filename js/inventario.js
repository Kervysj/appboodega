/* ============================================================
   INVENTARIO.JS — Productos, plantilla Excel con fórmulas,
   importación/edición, precios fijos en Bs.
   ============================================================ */

const UNIDADES = ['unidad', 'docena', 'cartón', 'kg', 'litro'];

const INV = {
  // Calcula precio unidad ($), precio de venta ($) y precio en Bs.
  // Si el producto permite venta fraccionada (ej: huevo por cartón y por unidad
  // suelta), también calcula el precio del bulto completo.
  calcular(p, tasa) {
    const precioUnidad = p.cantidadPorUnidad > 0 ? p.precioBulto / p.cantidadPorUnidad : 0;
    const precioVentaUnidad = precioUnidad * (1 + (p.porcentajeGanancia || 0) / 100);
    let precioBs;
    if (p.fijoBs) {
      precioBs = p.montoFijoBs || 0;
    } else {
      precioBs = precioVentaUnidad * (tasa || 0);
    }
    const resultado = {
      precioUnidad: Number(precioUnidad.toFixed(4)),
      precioVentaUnidad: Number(precioVentaUnidad.toFixed(4)),
      precioBs: Number(precioBs.toFixed(2)),
    };
    if (p.permiteFraccion) {
      // Precio de venta del bulto/cartón completo = precio unidad suelta x cantidad que trae
      const precioVentaBulto = precioVentaUnidad * (p.cantidadPorUnidad || 1);
      const precioBsBulto = p.fijoBs ? (p.montoFijoBs || 0) : precioVentaBulto * (tasa || 0);
      resultado.precioVentaBulto = Number(precioVentaBulto.toFixed(4));
      resultado.precioBsBulto = Number(precioBsBulto.toFixed(2));
    }
    return resultado;
  },

  async listar() {
    return DB.getAll('productos');
  },

  async buscar(texto) {
    const todos = await this.listar();
    if (!texto) return todos;
    const t = texto.toLowerCase();
    return todos.filter(p =>
      (p.descripcion || '').toLowerCase().includes(t) ||
      (p.codigo || '').toLowerCase().includes(t) ||
      (p.categoria || '').toLowerCase().includes(t)
    );
  },

  async buscarPorCodigo(codigo) {
    const todos = await this.listar();
    return todos.find(p => (p.codigo || '').toLowerCase() === (codigo || '').toLowerCase());
  },

  async guardar(producto) {
    // Si trae id, edita; si no, crea nuevo
    return DB.put('productos', producto);
  },

  async eliminar(id) {
    return DB.delete('productos', id);
  },

  // ---------- GENERADOR DE PLANTILLA EXCEL CON FÓRMULAS ----------
  generarPlantilla() {
    const headers = [
      'codigo', 'categoria', 'descripcion', 'unidad_medida',
      'cantidad_bulto', 'cantidad_por_unidad',
      'precio_bulto_$', 'precio_unidad_$ (auto)',
      '%_ganancia', 'precio_venta_unidad_$ (auto)',
      'fijar_en_bs (SI/NO)', 'monto_fijo_bs',
      'precio_bs (auto)', 'vende_por_unidad_suelta (SI/NO)',
    ];
    const filaEjemplo = [
      '0001', 'granos', 'Arroz 1kg', 'unidad',
      12, 1,
      6, null,
      25, null,
      'NO', '',
      null, 'NO',
    ];

    const wsData = [headers, filaEjemplo];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Fórmulas para la fila 2 (fila de ejemplo) — se pueden arrastrar hacia abajo
    // Columnas: A codigo,B categoria,C descripcion,D unidad,E cant_bulto,F cant_x_unidad,
    // G precio_bulto,H precio_unidad,I %ganancia,J precio_venta,K fijar_bs,L monto_fijo,M precio_bs
    for (let row = 2; row <= 500; row++) {
      ws[`H${row}`] = { t: 'n', f: `IF(F${row}=0,0,G${row}/F${row})` };
      ws[`J${row}`] = { t: 'n', f: `H${row}*(1+I${row}/100)` };
      ws[`M${row}`] = { t: 'n', f: `IF(UPPER(K${row})="SI",L${row},J${row}*$P$1)` };
    }
    // Celda P1: tasa del día, el usuario la coloca una sola vez y todas las filas la usan
    ws['O1'] = { t: 's', v: 'Tasa del día (Bs por $):' };
    ws['P1'] = { t: 'n', v: 0 };
    ws['!ref'] = 'A1:P500';

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `plantilla_inventario_${this._fechaArchivo()}.xlsx`);
  },

  // ---------- IMPORTAR EXCEL LLENO ----------
  async importarArchivo(file) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellFormula: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let importados = 0;
    const tasa = await AUTH.getTasaDia();

    for (const r of rows) {
      const codigo = String(r['codigo'] || '').trim();
      const descripcion = String(r['descripcion'] || '').trim();
      if (!codigo || !descripcion) continue;

      const fijoBs = String(r['fijar_en_bs (SI/NO)'] || '').toUpperCase() === 'SI';
      const producto = {
        codigo,
        categoria: String(r['categoria'] || ''),
        descripcion,
        unidadMedida: String(r['unidad_medida'] || 'unidad'),
        cantidadBulto: Number(r['cantidad_bulto']) || 0,
        cantidadPorUnidad: Number(r['cantidad_por_unidad']) || 1,
        precioBulto: Number(r['precio_bulto_$']) || 0,
        porcentajeGanancia: Number(r['%_ganancia']) || 0,
        fijoBs,
        montoFijoBs: Number(r['monto_fijo_bs']) || 0,
        permiteFraccion: String(r['vende_por_unidad_suelta (SI/NO)'] || '').toUpperCase() === 'SI',
      };
      const calc = this.calcular(producto, tasa);
      Object.assign(producto, calc);

      const existente = await this.buscarPorCodigo(codigo);
      if (existente) producto.id = existente.id;
      await this.guardar(producto);
      importados++;
    }
    return importados;
  },

  // ---------- RESPALDO GENERAL EN EXCEL (todas las tablas) ----------
  async exportarRespaldoCompleto() {
    const dump = await DB.dumpAll();
    const wb = XLSX.utils.book_new();
    for (const storeName of Object.keys(dump)) {
      const rows = dump[storeName];
      const ws = rows.length
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([['(sin datos)']]);
      XLSX.utils.book_append_sheet(wb, ws, storeName.slice(0, 31));
    }
    XLSX.writeFile(wb, `respaldo_bodega_${this._fechaArchivo()}.xlsx`);
  },

  _fechaArchivo() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  },
};

window.INV = INV;
