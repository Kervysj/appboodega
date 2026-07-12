/* ============================================================
   APP.JS — Login, navegación y renderizado de todas las pantallas
   ============================================================ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function formatBs(n) { return 'Bs ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatUsd(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }

function toast(msg, esError = false) {
  const el = $('#toast');
  el.textContent = (esError ? '⚠ ' : '✓ ') + msg;
  el.classList.remove('hidden');
  el.classList.toggle('error-toast', esError);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3200);
}
function toastGuardadoExito(texto = 'Guardado con éxito') { toast(texto, false); }

function abrirModal(id) { $('#' + id).classList.remove('hidden'); }
function cerrarModal(id) { $('#' + id).classList.add('hidden'); }
function abrirModalGenerico(html) { $('#modal-generico-cuerpo').innerHTML = html; abrirModal('modal-generico'); }
function cerrarModalGenerico() { cerrarModal('modal-generico'); }

document.addEventListener('click', (e) => {
  const cerrar = e.target.closest('[data-cerrar-modal]');
  if (cerrar) cerrarModal(cerrar.dataset.cerrarModal);
});

/* ============================================================
   MENÚS POR ROL
   ============================================================ */
const MENUS = {
  admin: [
    { id: 'inventario', label: 'Inventario' },
    { id: 'ventas', label: 'Ventas (POS)' },
    { id: 'cajeros', label: 'Cajeros' },
    { id: 'deudores', label: 'Deudores / Fiados' },
    { id: 'cuentaspagar', label: 'Cuentas por pagar' },
    { id: 'cuadre', label: 'Cuadre de caja' },
    { id: 'respaldo', label: 'Respaldo y autoguardado' },
  ],
  cajero: [
    { id: 'ventas', label: 'Ventas (POS)' },
    { id: 'deudores', label: 'Deudores / Fiados' },
    { id: 'cuadre', label: 'Cuadre de caja' },
  ],
};

let vistaActual = null;

function construirMenu() {
  const rol = AUTH.session.rol;
  const nav = $('#menu-nav');
  nav.innerHTML = '';
  MENUS[rol].forEach((item, i) => {
    const b = document.createElement('button');
    b.textContent = item.label;
    b.dataset.vista = item.id;
    if (i === 0) b.classList.add('activo');
    b.addEventListener('click', () => navegarA(item.id));
    nav.appendChild(b);
  });
  navegarA(MENUS[rol][0].id);
}

function navegarA(id) {
  vistaActual = id;
  $$('#menu-nav button').forEach(b => b.classList.toggle('activo', b.dataset.vista === id));
  const render = { inventario: renderInventario, ventas: renderVentas, cajeros: renderCajeros,
    deudores: renderDeudores, cuentaspagar: renderCuentasPagar, cuadre: renderCuadre, respaldo: renderRespaldo }[id];
  if (render) render();
}

/* ============================================================
   INIT / LOGIN / RESET
   ============================================================ */
async function iniciarApp() {
  await AUTH.init();
  const sesion = AUTH.restoreSession();
  if (sesion) { mostrarShell(); } else { mostrarLogin(); }

  const okHandle = await BACKUP.intentarRecuperarHandle();
  if (okHandle) { BACKUP.iniciarAutoguardado(); marcarAutoguardadoOk(); }
}

async function mostrarLogin() {
  $('#pantalla-login').classList.add('activa');
  $('#pantalla-app').classList.remove('activa');
  const usuarios = await AUTH.listarUsuariosActivos();
  const select = $('#login-usuario');
  select.innerHTML = usuarios.map(u => `<option value="${u.usuario}">${u.usuario} (${u.rol})</option>`).join('')
    || '<option value="">No hay usuarios — usa "Restablecer sistema"</option>';
}

async function mostrarShell() {
  $('#pantalla-login').classList.remove('activa');
  $('#pantalla-app').classList.add('activa');
  $('#sidebar-usuario').textContent = `${AUTH.session.usuario} (${AUTH.session.rol})`;
  $('#input-tasa').value = await AUTH.getTasaDia();
  construirMenu();
  await mostrarRecordatorioTasa();
}

// Cartel que aparece cada vez que se entra a cualquier rol, recordando
// verificar/actualizar la tasa del día antes de facturar o fiar.
async function mostrarRecordatorioTasa() {
  const tasaCfg = await DB.get('config', 'tasaDia');
  const tasa = tasaCfg ? tasaCfg.valor : 0;
  $('#rt-tasa-actual').textContent = tasa ? formatBs(tasa).replace('Bs', 'Bs') + ' por $1' : 'No configurada';
  $('#rt-tasa-fecha').textContent = tasaCfg && tasaCfg.fecha ? `(guardada el ${tasaCfg.fecha})` : '';
  $('#rt-input-tasa').value = tasa || '';
  abrirModal('modal-tasa-recordatorio');
}

$('#rt-btn-guardar-tasa').addEventListener('click', async () => {
  const val = $('#rt-input-tasa').value;
  if (!val || Number(val) <= 0) return toast('Coloca una tasa válida.', true);
  await AUTH.setTasaDia(val);
  $('#input-tasa').value = val;
  cerrarModal('modal-tasa-recordatorio');
  toastGuardadoExito('Tasa del día actualizada');
});

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('#login-usuario').value;
  const clave = $('#login-clave').value;
  const res = await AUTH.login(usuario, clave);
  const err = $('#login-error');
  if (!res.ok) {
    err.textContent = res.msg;
    err.classList.remove('hidden');
    $('#login-clave').value = '';
    $('#login-clave').focus();
    return;
  }
  err.classList.add('hidden');
  $('#form-login').reset();
  mostrarShell();
});

$('#btn-abrir-reset').addEventListener('click', () => abrirModal('modal-reset'));
$('#btn-confirmar-reset').addEventListener('click', async () => {
  const clave = $('#reset-clave').value;
  const res = await AUTH.resetTotal(clave);
  const err = $('#reset-error');
  if (!res.ok) { err.textContent = res.msg; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  cerrarModal('modal-reset');
  $('#reset-clave').value = '';
  toast('Sistema restablecido por completo.');
  mostrarLogin();
});

$('#btn-logout').addEventListener('click', () => { AUTH.logout(); mostrarLogin(); });

$('#btn-guardar-tasa').addEventListener('click', async () => {
  const val = $('#input-tasa').value;
  if (!val || Number(val) <= 0) return toast('Coloca una tasa válida.', true);
  await AUTH.setTasaDia(val);
  toastGuardadoExito('Tasa del día guardada');
});

document.addEventListener('bodega:autoguardado', (e) => marcarAutoguardadoOk(e.detail.hora));
function marcarAutoguardadoOk(hora) {
  const el = $('#autoguardado-estado');
  el.textContent = `● Autoguardado activo${hora ? ' — ' + hora : ''}`;
  el.classList.add('ok');
}

/* ============================================================
   INVENTARIO
   ============================================================ */
async function renderInventario() {
  const productos = await INV.listar();
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Inventario</h1>
    <p class="subtitulo">Genera la plantilla, impórtala llena, o agrega/edita productos manualmente.</p>
    <div class="card">
      <div class="fila-acciones">
        <button class="btn btn-secundario" id="btn-generar-plantilla">⬇ Generar plantilla Excel</button>
        <label class="btn btn-secundario" style="cursor:pointer;">⬆ Importar Excel
          <input type="file" id="input-importar" accept=".xlsx,.xls" class="hidden">
        </label>
        <button class="btn btn-primary" id="btn-nuevo-producto">+ Nuevo producto</button>
      </div>
      <input type="text" id="buscador-inventario" placeholder="Buscar por código, descripción o categoría..." style="width:100%;padding:10px;border:1px solid var(--linea);border-radius:6px;margin-bottom:14px;">
      <table>
        <thead><tr><th>Código</th><th>Descripción</th><th>Categoría</th><th>Unidad</th><th>Ganancia</th><th>Precio $</th><th>Precio Bs</th><th>Fijo Bs</th><th>Por unidad suelta</th><th></th></tr></thead>
        <tbody id="tabla-inventario"></tbody>
      </table>
    </div>`;

  function pintar(lista) {
    $('#tabla-inventario').innerHTML = lista.map(p => `
      <tr>
        <td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.categoria || '-'}</td>
        <td>${p.unidadMedida}</td><td class="num">${p.porcentajeGanancia}%</td>
        <td class="num">${formatUsd(p.precioVentaUnidad)}</td>
        <td class="num">${formatBs(p.precioBs)}</td>
        <td>${p.fijoBs ? '<span class="badge badge-ambar">Fijo</span>' : '-'}</td>
        <td>${p.permiteFraccion ? `<span class="badge badge-verde">Sí (${formatBs(p.precioBsBulto)}/${p.unidadMedida})</span>` : '-'}</td>
        <td><button class="btn btn-mini btn-secundario" data-editar="${p.id}">Editar</button>
            <button class="btn btn-mini btn-peligro" data-eliminar="${p.id}">Eliminar</button></td>
      </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;color:var(--tinta-suave)">Sin productos aún.</td></tr>';
  }
  pintar(productos);

  $('#buscador-inventario').addEventListener('input', async (e) => pintar(await INV.buscar(e.target.value)));
  $('#btn-generar-plantilla').addEventListener('click', () => { INV.generarPlantilla(); toast('Plantilla descargada.'); });
  $('#btn-nuevo-producto').addEventListener('click', () => abrirFormularioProducto(null));
  $('#input-importar').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const n = await INV.importarArchivo(file);
    toastGuardadoExito(`${n} producto(s) importado(s) con éxito`);
    renderInventario();
  });
  $('#tabla-inventario').addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar]');
    const eliminar = e.target.closest('[data-eliminar]');
    if (editar) {
      const p = productos.find(x => x.id == editar.dataset.editar);
      abrirFormularioProducto(p);
    }
    if (eliminar) {
      if (confirm('¿Eliminar este producto del inventario?')) {
        await INV.eliminar(Number(eliminar.dataset.eliminar));
        toastGuardadoExito('Producto eliminado');
        renderInventario();
      }
    }
  });
}

function abrirFormularioProducto(p) {
  const tasaActual = Number($('#input-tasa').value) || 0;
  abrirModalGenerico(`
    <h2>${p ? 'Editar producto' : 'Nuevo producto'}</h2>
    <div class="grid-2">
      <div class="campo"><label>Código</label><input id="f-codigo" value="${p ? p.codigo : ''}"></div>
      <div class="campo"><label>Categoría (opcional)</label><input id="f-categoria" value="${p ? (p.categoria || '') : ''}"></div>
    </div>
    <div class="campo"><label>Descripción</label><input id="f-descripcion" value="${p ? p.descripcion : ''}"></div>
    <div class="grid-3">
      <div class="campo"><label>Unidad de medida (del bulto/cartón)</label>
        <select id="f-unidad">${UNIDADES.map(u => `<option ${p && p.unidadMedida === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
      </div>
      <div class="campo"><label>Cant. por bulto</label><input type="number" id="f-cantbulto" value="${p ? p.cantidadBulto : 1}"></div>
      <div class="campo"><label># de unidades sueltas que trae el bulto</label><input type="number" id="f-cantunidad" value="${p ? p.cantidadPorUnidad : 1}"></div>
    </div>
    <div class="grid-2">
      <div class="campo"><label>Precio del bulto ($)</label><input type="number" step="0.01" id="f-preciobulto" value="${p ? p.precioBulto : ''}"></div>
      <div class="campo"><label>% de ganancia</label><input type="number" step="0.01" id="f-ganancia" value="${p ? p.porcentajeGanancia : 25}"></div>
    </div>
    <div class="checkbox-linea">
      <input type="checkbox" id="f-fraccion" ${p && p.permiteFraccion ? 'checked' : ''}>
      <label style="margin:0;text-transform:none;">También se vende suelto por unidad (ej: huevo por cartón Y por unidad individual)</label>
    </div>
    <div class="checkbox-linea">
      <input type="checkbox" id="f-fijobs" ${p && p.fijoBs ? 'checked' : ''}>
      <label style="margin:0;text-transform:none;">Fijar precio en Bs (no sube con la tasa)</label>
    </div>
    <div class="campo" id="wrap-montofijo" style="${p && p.fijoBs ? '' : 'display:none;'}">
      <label>Monto fijo en Bs</label><input type="number" step="0.01" id="f-montofijo" value="${p ? p.montoFijoBs : ''}">
    </div>
    <div class="card" style="background:var(--verde-claro);border:none;">
      <strong>Vista previa (tasa actual: ${tasaActual}):</strong>
      <div id="preview-precios" style="font-family:var(--fuente-mono);margin-top:6px;"></div>
    </div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-producto">Guardar</button>
    </div>
  `);

  function leerFormulario() {
    const base = {
      codigo: $('#f-codigo').value.trim(),
      categoria: $('#f-categoria').value.trim(),
      descripcion: $('#f-descripcion').value.trim(),
      unidadMedida: $('#f-unidad').value,
      cantidadBulto: Number($('#f-cantbulto').value) || 0,
      cantidadPorUnidad: Number($('#f-cantunidad').value) || 1,
      precioBulto: Number($('#f-preciobulto').value) || 0,
      porcentajeGanancia: Number($('#f-ganancia').value) || 0,
      fijoBs: $('#f-fijobs').checked,
      montoFijoBs: Number($('#f-montofijo').value) || 0,
      permiteFraccion: $('#f-fraccion').checked,
    };
    if (p && p.id !== undefined) base.id = p.id; // solo se incluye "id" al EDITAR, nunca al crear
    return base;
  }
  function actualizarPreview() {
    const datos = leerFormulario();
    const calc = INV.calcular(datos, tasaActual);
    let html = `Precio unidad suelta: ${formatUsd(calc.precioVentaUnidad)} (<strong>${formatBs(calc.precioBs)}</strong>)`;
    if (datos.permiteFraccion) {
      html += `<br>Precio ${datos.unidadMedida} completo: ${formatUsd(calc.precioVentaBulto)} (<strong>${formatBs(calc.precioBsBulto)}</strong>)`;
    }
    $('#preview-precios').innerHTML = html;
  }
  $('#modal-generico-cuerpo').addEventListener('input', actualizarPreview);
  $('#f-fijobs').addEventListener('change', (e) => { $('#wrap-montofijo').style.display = e.target.checked ? '' : 'none'; actualizarPreview(); });
  actualizarPreview();

  $('#btn-guardar-producto').addEventListener('click', async () => {
    const datos = leerFormulario();
    if (!datos.codigo || !datos.descripcion) return toast('Código y descripción son obligatorios.', true);
    const calc = INV.calcular(datos, tasaActual);
    Object.assign(datos, calc);
    await INV.guardar(datos);
    cerrarModalGenerico();
    toastGuardadoExito('Producto guardado con éxito');
    renderInventario();
  });
}

/* ============================================================
   VENTAS (POS)
   ============================================================ */
async function renderVentas() {
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Ventas</h1>
    <p class="subtitulo">Busca el producto y arma la compra.</p>
    <div class="pos-layout">
      <div class="card">
        <div class="buscador-inteligente">
          <input type="text" id="buscador-ventas" placeholder="🔍 Buscar producto por nombre o código...">
          <div id="resultados-buscador" class="resultados-buscador hidden"></div>
        </div>
      </div>
      <div class="card">
        <h3>Carrito</h3>
        <div id="lista-carrito"></div>
        <div class="carrito-total"><span>Total</span><span id="total-bs">${formatBs(0)}</span></div>
        <div style="text-align:right;color:var(--tinta-suave);font-family:var(--fuente-mono);" id="total-usd">${formatUsd(0)}</div>
        <button class="btn btn-primary btn-block" id="btn-finalizar-compra">Finalizar compra</button>
      </div>
    </div>

    <div class="card">
      <h3>Ventas de hoy</h3>
      <p class="subtitulo" style="margin-bottom:12px;">Revisa lo cobrado y corrige el método de pago si hubo un error, ej: se anotó "dólares" y en realidad fue efectivo en Bs.</p>
      <div id="lista-ventas-dia">Cargando…</div>
    </div>`;

  const buscador = $('#buscador-ventas');
  const resultadosDiv = $('#resultados-buscador');
  buscador.addEventListener('input', async () => {
    const texto = buscador.value.trim();
    if (!texto) { resultadosDiv.classList.add('hidden'); return; }
    const resultados = await INV.buscar(texto);
    const opciones = [];
    resultados.slice(0, 8).forEach(p => {
      opciones.push({ id: p.id, modo: 'unidad', label: `${p.descripcion} <small style="color:var(--tinta-suave)">(${p.codigo}) — unidad suelta</small>`, precio: p.precioBs });
      if (p.permiteFraccion) {
        opciones.push({ id: p.id, modo: 'bulto', label: `${p.descripcion} <small style="color:var(--tinta-suave)">(${p.codigo}) — ${p.unidadMedida} completo</small>`, precio: p.precioBsBulto });
      }
    });
    resultadosDiv.innerHTML = opciones.map(o =>
      `<div class="resultado-item" data-id="${o.id}" data-modo="${o.modo}"><span>${o.label}</span><span class="num">${formatBs(o.precio)}</span></div>`
    ).join('') || '<div class="resultado-item">Sin resultados</div>';
    resultadosDiv.classList.remove('hidden');
  });
  resultadosDiv.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const productos = await INV.listar();
    const p = productos.find(x => x.id == item.dataset.id);
    VENTAS.agregarProducto(p, 1, item.dataset.modo);
    buscador.value = '';
    resultadosDiv.classList.add('hidden');
    pintarCarrito();
  });

  function pintarCarrito() {
    const cont2 = $('#lista-carrito');
    cont2.innerHTML = VENTAS.carrito.map(i => `
      <div class="carrito-linea">
        <span>${i.descripcion}</span>
        <input type="number" min="0" step="0.01" class="cantidad-input" value="${i.cantidad}" data-clave="${i.claveLinea}">
        <span class="num">${formatBs(i.precioBs * i.cantidad)}</span>
        <button class="btn btn-mini btn-peligro" data-quitar="${i.claveLinea}">✕</button>
      </div>`).join('') || '<p style="color:var(--tinta-suave)">Carrito vacío.</p>';
    $('#total-bs').textContent = formatBs(VENTAS.totalBs());
    $('#total-usd').textContent = '≈ ' + formatUsd(VENTAS.totalUsd());
  }
  $('#lista-carrito').addEventListener('input', (e) => {
    if (e.target.classList.contains('cantidad-input')) {
      VENTAS.actualizarCantidad(e.target.dataset.clave, Number(e.target.value));
      pintarCarrito();
    }
  });
  $('#lista-carrito').addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) { VENTAS.quitarProducto(quitar.dataset.quitar); pintarCarrito(); }
  });
  $('#btn-finalizar-compra').addEventListener('click', () => abrirModalPago());
  pintarCarrito();

  $('#lista-ventas-dia').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-editar-venta]');
    if (btn) abrirModalEditarPagos(Number(btn.dataset.editarVenta));
  });
  await pintarVentasDelDia();
}

async function pintarVentasDelDia() {
  const cont = $('#lista-ventas-dia');
  if (!cont) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const ventas = (await VENTAS.listarVentasDelDia(hoy))
    .filter(v => v.tipo === 'venta')
    .sort((a, b) => (b.hora || '').localeCompare(a.hora || '') || (b.id - a.id));

  if (ventas.length === 0) {
    cont.innerHTML = '<p style="color:var(--tinta-suave)">Todavía no hay ventas registradas hoy.</p>';
    return;
  }

  cont.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Hora</th><th>Productos</th><th>Total</th><th>Pagado con</th><th></th></tr></thead>
      <tbody>
        ${ventas.map(v => `
          <tr>
            <td>#${v.id}${v.editada ? ' <span class="badge badge-ambar">editada</span>' : ''}</td>
            <td>${v.hora ? v.hora.slice(0, 5) : ''}</td>
            <td>${v.items.map(i => `${i.descripcion} x${i.cantidad}`).join(', ') || '—'}</td>
            <td class="num">${formatBs(v.totalBs)}</td>
            <td>${(v.pagos || []).map(p => {
              const def = METODOS_PAGO.find(m => m.id === p.metodo);
              return `<span class="badge badge-verde">${def ? def.label : p.metodo}: ${formatBs(p.montoBs)}</span>`;
            }).join(' ')}</td>
            <td><button class="btn btn-mini btn-secundario" data-editar-venta="${v.id}">Editar pago</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function abrirModalEditarPagos(ventaId) {
  const venta = await VENTAS.obtenerVenta(ventaId);
  if (!venta) return toast('Venta no encontrada.', true);
  const deudores = await DEUD.agrupadoPorCedula();
  const resumenItems = venta.items.map(i => `${i.descripcion} x${i.cantidad}`).join(', ') || '—';

  abrirModalGenerico(`
    <h2>Editar cómo se cobró — Venta #${venta.id}</h2>
    <p style="color:var(--tinta-suave);font-size:13px;">${resumenItems}</p>
    <p>Total de la venta: <strong>${formatBs(venta.totalBs)}</strong> (≈ ${formatUsd(venta.totalUsd)}) — el total no cambia, solo la forma de pago.</p>
    <div id="lista-pagos-editar"></div>
    <button class="btn btn-secundario btn-mini" id="btn-agregar-pago-editar">+ Agregar método de pago</button>
    <div id="pago-error-editar" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-confirmar-edicion-pago">Guardar corrección</button>
    </div>
  `);

  const listaPagos = $('#lista-pagos-editar');

  function actualizarVisibilidadFila(div, pago) {
    const metodo = $('.pago-metodo', div).value;
    const def = METODOS_PAGO.find(m => m.id === metodo);
    $('.pago-referencia', div).classList.toggle('hidden', !def.requiereReferencia);
    const esFiado = metodo === 'fiado';
    $('.pago-fiado', div).classList.toggle('hidden', !esFiado);
  }
  // Muestra/oculta cédula y nombre según lo que YA esté elegido en el select
  // de deudor (por defecto "-- Nuevo deudor --"), sin depender de un evento
  // "change" que el usuario nunca dispara si deja la opción por defecto.
  function sincronizarNuevoDeudor(div) {
    const sel = $('.pago-deudor-select', div);
    if (!sel) return;
    const esNuevo = !sel.value;
    $('.pago-cedula-nueva', div).classList.toggle('hidden', !esNuevo);
    $('.pago-nombre-nuevo', div).classList.toggle('hidden', !esNuevo);
  }

  function filaPago(pago) {
    const div = document.createElement('div');
    div.className = 'metodo-pago-fila';
    div.innerHTML = `
      <select class="pago-metodo">${METODOS_PAGO.map(m => `<option value="${m.id}" ${pago && pago.metodo === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
      <input type="number" step="0.01" class="pago-monto" placeholder="Monto Bs" style="width:110px;" value="${pago ? pago.montoBs : ''}">
      <input type="text" class="pago-referencia hidden" placeholder="Referencia" value="${pago && pago.referencia ? pago.referencia : ''}">
      <div class="pago-fiado hidden" style="display:flex;gap:6px;">
        <select class="pago-deudor-select"><option value="">-- Nuevo deudor --</option>${deudores.map(d => `<option value="${d.cedula}" ${pago && pago.cedula === d.cedula && !pago.cedulaNueva ? 'selected' : ''}>${d.nombre || d.cedula}</option>`).join('')}</select>
        <input type="text" class="pago-cedula-nueva hidden" placeholder="Cédula" value="${pago && pago.cedulaNueva ? pago.cedula || '' : ''}">
        <input type="text" class="pago-nombre-nuevo hidden" placeholder="Nombre" value="${pago && pago.cedulaNueva ? pago.nombreDeudor || '' : ''}">
      </div>
      <button class="btn btn-mini btn-peligro" data-quitar-pago>✕</button>`;
    listaPagos.appendChild(div);
    actualizarVisibilidadFila(div, pago);
    sincronizarNuevoDeudor(div);
  }

  listaPagos.addEventListener('change', (e) => {
    if (e.target.classList.contains('pago-metodo')) {
      actualizarVisibilidadFila(e.target.closest('.metodo-pago-fila'));
      sincronizarNuevoDeudor(e.target.closest('.metodo-pago-fila'));
    }
    if (e.target.classList.contains('pago-deudor-select')) {
      sincronizarNuevoDeudor(e.target.closest('.metodo-pago-fila'));
    }
  });
  listaPagos.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar-pago]');
    if (q) q.closest('.metodo-pago-fila').remove();
  });
  $('#btn-agregar-pago-editar').addEventListener('click', () => filaPago());

  (venta.pagos && venta.pagos.length ? venta.pagos : [{ metodo: 'efectivo', montoBs: venta.totalBs }]).forEach(p => filaPago(p));

  $('#btn-confirmar-edicion-pago').addEventListener('click', async () => {
    const filas = $$('.metodo-pago-fila', listaPagos);
    const pagos = filas.map(f => {
      const metodo = $('.pago-metodo', f).value;
      const pago = { metodo, montoBs: Number($('.pago-monto', f).value) || 0, referencia: $('.pago-referencia', f).value.trim() };
      if (metodo === 'fiado') {
        const cedulaSel = $('.pago-deudor-select', f).value;
        if (cedulaSel) {
          const d = deudores.find(x => x.cedula === cedulaSel);
          pago.deudorId = true; pago.cedula = cedulaSel; pago.nombreDeudor = d ? d.nombre : cedulaSel;
        } else {
          pago.cedula = $('.pago-cedula-nueva', f).value.trim();
          pago.nombreDeudor = $('.pago-nombre-nuevo', f).value.trim();
          pago.cedulaNueva = true;
        }
      }
      return pago;
    });
    const res = await VENTAS.editarPagos(venta.id, pagos);
    const err = $('#pago-error-editar');
    if (!res.ok) { err.textContent = res.msg; err.classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito('Pago corregido con éxito');
    renderVentas();
  });
}

async function abrirModalPago() {
  if (VENTAS.carrito.length === 0) return toast('El carrito está vacío.', true);
  const totalBs = VENTAS.totalBs();
  const deudores = await DEUD.agrupadoPorCedula();
  const creditos = await CREDITOS.listarConSaldo();

  abrirModalGenerico(`
    <h2>Finalizar compra</h2>
    <p>Total a pagar: <strong>${formatBs(totalBs)}</strong> (≈ ${formatUsd(VENTAS.totalUsd())})</p>
    <div id="lista-pagos"></div>
    <button class="btn btn-secundario btn-mini" id="btn-agregar-pago">+ Agregar método de pago</button>
    <div id="resumen-pago" style="margin-top:10px;font-size:14px;"></div>
    <div id="pago-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-confirmar-venta">Registrar venta</button>
    </div>
  `);

  const listaPagos = $('#lista-pagos');
  function filaPago(prefill) {
    const div = document.createElement('div');
    div.className = 'metodo-pago-fila';
    div.innerHTML = `
      <select class="pago-metodo">${METODOS_PAGO.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}</select>
      <input type="number" step="0.01" class="pago-monto" placeholder="Monto Bs" style="width:110px;">
      <input type="text" class="pago-referencia hidden" placeholder="Referencia">
      <div class="pago-fiado hidden" style="display:flex;gap:6px;">
        <select class="pago-deudor-select"><option value="">-- Nuevo deudor --</option>${deudores.map(d => `<option value="${d.cedula}">${d.nombre || d.cedula}</option>`).join('')}</select>
        <input type="text" class="pago-cedula-nueva hidden" placeholder="Cédula">
        <input type="text" class="pago-nombre-nuevo hidden" placeholder="Nombre">
      </div>
      <div class="pago-credito hidden" style="display:flex;gap:6px;align-items:center;">
        <select class="pago-credito-select">
          <option value="">-- Elige quién tiene crédito --</option>
          ${creditos.map(c => `<option value="${c.cedula}" data-disponible="${c.saldoBs}">${c.nombre || c.cedula} (Bs ${c.saldoBs.toFixed(2)} disp.)</option>`).join('')}
        </select>
        <span class="pago-credito-disponible" style="font-size:12px;color:var(--tinta-suave);"></span>
      </div>
      <button class="btn btn-mini btn-peligro" data-quitar-pago>✕</button>`;
    listaPagos.appendChild(div);
    actualizarVisibilidadFila(div);
    sincronizarNuevoDeudor(div);
  }
  function actualizarVisibilidadFila(div) {
    const metodo = $('.pago-metodo', div).value;
    const def = METODOS_PAGO.find(m => m.id === metodo);
    $('.pago-referencia', div).classList.toggle('hidden', !def.requiereReferencia);
    $('.pago-fiado', div).classList.toggle('hidden', metodo !== 'fiado');
    $('.pago-credito', div).classList.toggle('hidden', metodo !== 'credito_favor');
  }
  // Muestra/oculta los campos de cédula y nombre según lo que YA esté elegido
  // en el select de deudor (por defecto "-- Nuevo deudor --"), sin depender
  // de que el usuario dispare un evento "change" a propósito.
  function sincronizarNuevoDeudor(div) {
    const sel = $('.pago-deudor-select', div);
    if (!sel) return;
    const esNuevo = !sel.value;
    $('.pago-cedula-nueva', div).classList.toggle('hidden', !esNuevo);
    $('.pago-nombre-nuevo', div).classList.toggle('hidden', !esNuevo);
  }
  // Resumen en vivo: cuánto se ha asignado vs. cuánto falta cobrar del total.
  function actualizarResumen() {
    const filas = $$('.metodo-pago-fila', listaPagos);
    const asignado = Number(filas.reduce((s, f) => s + (Number($('.pago-monto', f).value) || 0), 0).toFixed(2));
    const falta = Number((totalBs - asignado).toFixed(2));
    const resumen = $('#resumen-pago');
    if (Math.abs(falta) < 0.5) {
      resumen.innerHTML = `<span style="color:#1f7a3d;">Pagos completos: coinciden con el total a pagar.</span>`;
    } else if (falta > 0) {
      resumen.innerHTML = `<span style="color:#a3262c;"><strong>Falta cobrar ahora: ${formatBs(falta)}</strong> (agrega otro método de pago por ese monto).</span>`;
    } else {
      resumen.innerHTML = `<span style="color:#a3262c;">Los pagos superan el total por ${formatBs(Math.abs(falta))}.</span>`;
    }
  }
  listaPagos.addEventListener('change', (e) => {
    if (e.target.classList.contains('pago-metodo')) {
      actualizarVisibilidadFila(e.target.closest('.metodo-pago-fila'));
      sincronizarNuevoDeudor(e.target.closest('.metodo-pago-fila'));
    }
    if (e.target.classList.contains('pago-deudor-select')) {
      sincronizarNuevoDeudor(e.target.closest('.metodo-pago-fila'));
    }
    if (e.target.classList.contains('pago-credito-select')) {
      const fila = e.target.closest('.metodo-pago-fila');
      const opt = e.target.selectedOptions[0];
      const disp = opt && opt.dataset.disponible ? Number(opt.dataset.disponible) : 0;
      $('.pago-credito-disponible', fila).textContent = e.target.value ? `Disponible: Bs ${disp.toFixed(2)}` : '';
      if (e.target.value) {
        // Cobrar ahora con crédito = lo menor entre lo disponible y lo que
        // falta cubrir del total (sin contar lo ya asignado en otras filas).
        const otras = $$('.metodo-pago-fila', listaPagos).filter(x => x !== fila);
        const asignadoOtras = otras.reduce((s, x) => s + (Number($('.pago-monto', x).value) || 0), 0);
        const restante = Math.max(0, Number((totalBs - asignadoOtras).toFixed(2)));
        const aplicar = Number(Math.min(disp, restante).toFixed(2));
        $('.pago-monto', fila).value = aplicar.toFixed(2);
      }
    }
    actualizarResumen();
  });
  listaPagos.addEventListener('input', (e) => {
    if (e.target.classList.contains('pago-monto')) actualizarResumen();
  });
  listaPagos.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar-pago]');
    if (q) { q.closest('.metodo-pago-fila').remove(); actualizarResumen(); }
  });
  $('#btn-agregar-pago').addEventListener('click', () => { filaPago(); actualizarResumen(); });
  filaPago(); // primera fila por defecto
  $('.pago-monto', listaPagos).value = totalBs.toFixed(2);
  actualizarResumen();

  $('#btn-confirmar-venta').addEventListener('click', async () => {
    const filas = $$('.metodo-pago-fila', listaPagos);
    const pagos = filas.map(f => {
      const metodo = $('.pago-metodo', f).value;
      const pago = { metodo, montoBs: Number($('.pago-monto', f).value) || 0, referencia: $('.pago-referencia', f).value.trim() };
      if (metodo === 'fiado') {
        const cedulaSel = $('.pago-deudor-select', f).value;
        if (cedulaSel) {
          const d = deudores.find(x => x.cedula === cedulaSel);
          pago.deudorId = true; pago.cedula = cedulaSel; pago.nombreDeudor = d ? d.nombre : cedulaSel;
        } else {
          pago.cedula = $('.pago-cedula-nueva', f).value.trim();
          pago.nombreDeudor = $('.pago-nombre-nuevo', f).value.trim();
          pago.cedulaNueva = true;
        }
      }
      if (metodo === 'credito_favor') {
        pago.cedula = $('.pago-credito-select', f).value;
      }
      return pago;
    });
    const res = await VENTAS.registrarVenta(pagos);
    const err = $('#pago-error');
    if (!res.ok) { err.textContent = res.msg; err.classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito('Venta registrada con éxito');
    renderVentas();
  });
}


/* ============================================================
   DEUDORES / FIADOS
   ============================================================ */
function diasDesde(fechaISO) {
  if (!fechaISO) return 0;
  const inicio = new Date(fechaISO + 'T00:00:00');
  const hoy = new Date(hoyISO() + 'T00:00:00');
  return Math.max(0, Math.round((hoy - inicio) / 86400000));
}

async function renderDeudores() {
  const esAdmin = AUTH.session.rol === 'admin';
  const activas = await DEUD.listarActivas();
  const agrupado = await DEUD.agrupadoPorCedula();
  const creditos = await CREDITOS.listarConSaldo();
  const creditosConsumidos = await CREDITOS.listarConsumidos();
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Deudores / Fiados</h1>
    <p class="subtitulo">La deuda siempre se maneja en dólares ($). Cada fila de abajo es una deuda individual; una misma persona puede tener varias. Puedes usar fechas anteriores a hoy al registrar, para cargar deudas de días pasados.</p>
    <div class="card">
      <h3>Total adeudado por persona ($)</h3>
      <table>
        <thead><tr><th>Cédula</th><th>Nombre</th><th>Total adeudado ($)</th></tr></thead>
        <tbody>
          ${agrupado.map(g => `
            <tr>
              <td>${g.cedula || '-'}</td><td>${g.nombre || '-'}</td>
              <td class="num"><strong>${formatUsd(g.totalUsd)}</strong></td>
            </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--tinta-suave)">No hay deudores activos.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3>Créditos a favor de clientes <i class="info-i" title="(i) Se genera cuando un deudor abona MÁS bolívares de los que debía. Ese sobrante queda aquí, siempre en Bs, para usarlo como parte de pago en su próxima compra.">i</i></h3>
      <table>
        <thead><tr><th>Cédula</th><th>Nombre</th><th>Crédito a favor (Bs)</th><th></th></tr></thead>
        <tbody id="tabla-creditos">
          ${creditos.map(c => `
            <tr>
              <td>${c.cedula}</td><td>${c.nombre || '-'}</td>
              <td class="num"><strong>${formatBs(c.saldoBs)}</strong></td>
              <td><button class="btn btn-mini btn-peligro" data-bloquear-credito="${c.cedula}">Marcar como consumido / bloquear</button></td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--tinta-suave)">No hay créditos a favor pendientes.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3>Historial de créditos consumidos / bloqueados <i class="info-i" title="(i) Aquí quedan los créditos que ya se agotaron (usados en una compra) o que bloqueaste manualmente. No desaparecen solos: se guardan como historia hasta que tú los borres con el botón Eliminar.">i</i></h3>
      <table>
        <thead><tr><th>Cédula</th><th>Nombre</th><th>Último movimiento</th><th></th></tr></thead>
        <tbody id="tabla-creditos-historial">
          ${creditosConsumidos.map(c => {
            const ultimo = c.historial && c.historial.length ? c.historial[c.historial.length - 1] : null;
            return `
            <tr>
              <td>${c.cedula}</td><td>${c.nombre || '-'}</td>
              <td>${ultimo ? `${ultimo.fecha} ${ultimo.hora}` : '-'}</td>
              <td>
                <button class="btn btn-mini btn-secundario" data-ver-historial-credito="${c.cedula}">Ver movimientos</button>
                ${esAdmin ? `<button class="btn btn-mini btn-peligro" data-eliminar-credito="${c.cedula}">Eliminar</button>` : ''}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--tinta-suave)">No hay créditos consumidos en el historial.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="fila-acciones"><button class="btn btn-primary" id="btn-nuevo-deudor">+ Registrar deudor / deuda</button></div>
      <table>
        <thead><tr><th>Cédula</th><th>Nombre</th><th>Fecha</th><th>Días con la deuda</th><th>Descripción</th><th>Nota</th><th>Bs (al fiar)</th><th>Deuda ($)</th><th></th></tr></thead>
        <tbody id="tabla-deudores">
          ${activas.map(d => `
            <tr>
              <td>${d.cedula || '-'}</td><td>${d.nombre || '-'}</td><td>${d.fecha}</td>
              <td><span class="badge ${diasDesde(d.fecha) > 15 ? 'badge-rojo' : diasDesde(d.fecha) > 5 ? 'badge-ambar' : 'badge-azul'}">${diasDesde(d.fecha)} día(s)</span></td>
              <td>${d.descripcion}</td>
              <td>${d.nota || '-'}</td>
              <td class="num">${formatBs(d.montoBs)}</td>
              <td class="num"><strong>${formatUsd(d.saldoUsd)}</strong></td>
              <td>
                <button class="btn btn-mini btn-primary" data-pagar="${d.id}">Pagar</button>
                ${esAdmin ? `<button class="btn btn-mini btn-peligro" data-eliminar="${d.id}">Eliminar</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--tinta-suave)">No hay deudas activas.</td></tr>'}
        </tbody>
      </table>
    </div>`;

  $('#btn-nuevo-deudor').addEventListener('click', () => abrirFormularioDeudor());
  $('#tabla-deudores').addEventListener('click', async (e) => {
    const pagar = e.target.closest('[data-pagar]');
    const eliminar = e.target.closest('[data-eliminar]');
    if (pagar) abrirModalPagoDeuda(Number(pagar.dataset.pagar));
    if (eliminar && confirm('¿Eliminar este registro de deuda?')) {
      await DEUD.eliminar(Number(eliminar.dataset.eliminar));
      toastGuardadoExito('Deuda eliminada');
      renderDeudores();
    }
  });

  $('#tabla-creditos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bloquear-credito]');
    if (btn) abrirModalBloquearCredito(btn.dataset.bloquearCredito);
  });

  $('#tabla-creditos-historial').addEventListener('click', (e) => {
    const verBtn = e.target.closest('[data-ver-historial-credito]');
    const elimBtn = e.target.closest('[data-eliminar-credito]');
    if (verBtn) abrirModalVerHistorialCredito(verBtn.dataset.verHistorialCredito);
    if (elimBtn) abrirModalEliminarCredito(elimBtn.dataset.eliminarCredito);
  });
}

// Bloquea (ya no borra) el crédito restante de una persona: pasa a
// "consumido" y queda guardado en el historial de abajo.
function abrirModalBloquearCredito(cedula) {
  const esAdmin = AUTH.session.rol === 'admin';
  abrirModalGenerico(`
    <h2>Marcar crédito como consumido</h2>
    <p>Esto se usa cuando la persona ya usó o le pagaron aparte el crédito que tenía a favor. No se borra: queda bloqueado en el historial de abajo, y lo puedes eliminar de ahí manualmente cuando quieras.</p>
    ${esAdmin ? '' : `
    <div class="campo"><label>Clave del administrador</label><input type="password" id="bc-clave-admin"></div>`}
    <div id="bc-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-peligro" id="btn-confirmar-bloquear-credito">Marcar como consumido</button>
    </div>`);
  $('#btn-confirmar-bloquear-credito').addEventListener('click', async () => {
    const clave = esAdmin ? '' : $('#bc-clave-admin').value;
    const res = await CREDITOS.bloquear(cedula, clave);
    if (!res.ok) { $('#bc-error').textContent = res.msg; $('#bc-error').classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito('Crédito marcado como consumido');
    renderDeudores();
  });
}

// Muestra el historial completo (ingresos, usos, bloqueos, reactivaciones) de un crédito consumido.
async function abrirModalVerHistorialCredito(cedula) {
  const c = await CREDITOS.obtener(cedula);
  const historial = c && c.historial ? [...c.historial].reverse() : [];
  const etiquetas = { ingreso: 'Ingreso', uso: 'Uso', bloqueado: 'Bloqueado', reactivado: 'Reactivado' };
  abrirModalGenerico(`
    <h2>Historial de crédito — ${c ? (c.nombre || c.cedula) : cedula}</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Monto (Bs)</th><th>Motivo</th></tr></thead>
      <tbody>
        ${historial.map(h => `
          <tr>
            <td>${h.fecha}</td><td>${h.hora}</td>
            <td>${etiquetas[h.tipo] || h.tipo}</td>
            <td class="num">${h.montoBs ? formatBs(h.montoBs) : '-'}</td>
            <td>${h.motivo || '-'}</td>
          </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--tinta-suave)">Sin movimientos.</td></tr>'}
      </tbody>
    </table>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cerrar</button>
    </div>`);
}

// Borra el registro DEFINITIVAMENTE — el botón que abre esto solo aparece
// para el administrador; CREDITOS.eliminar también lo valida por su cuenta.
function abrirModalEliminarCredito(cedula) {
  abrirModalGenerico(`
    <h2>Eliminar crédito del historial</h2>
    <p>Esto borra el registro para siempre, incluyendo todo su historial. No se puede deshacer.</p>
    <div id="ec-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-peligro" id="btn-confirmar-eliminar-credito">Eliminar definitivamente</button>
    </div>`);
  $('#btn-confirmar-eliminar-credito').addEventListener('click', async () => {
    const res = await CREDITOS.eliminar(cedula);
    if (!res.ok) { $('#ec-error').textContent = res.msg; $('#ec-error').classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito('Crédito eliminado del historial');
    renderDeudores();
  });
}

async function abrirFormularioDeudor() {
  const existentes = await DEUD.agrupadoPorCedula();
  abrirModalGenerico(`
    <h2>Registrar deudor / deuda</h2>
    <div class="campo">
      <label>Deudor ya existente <i class="info-i" title="(i) Elige aquí a alguien que ya tiene deudas activas para agregarle rápido otra deuda más, sin tener que volver a escribir su cédula y nombre.">i</i></label>
      <select id="fd-existente">
        <option value="">-- Nuevo deudor (escribir cédula y nombre abajo) --</option>
        ${existentes.map(g => `<option value="${g.cedula || ''}" data-nombre="${g.nombre || ''}">${g.nombre || g.cedula} (debe ${formatUsd(g.totalUsd)})</option>`).join('')}
      </select>
    </div>
    <div class="grid-2">
      <div class="campo"><label>Cédula <i class="info-i" title="(i) Documento de identidad del deudor. Sirve para agrupar todas sus deudas juntas.">i</i></label><input id="fd-cedula"></div>
      <div class="campo"><label>Nombre <i class="info-i" title="(i) Nombre del deudor, para identificarlo fácilmente en la lista.">i</i></label><input id="fd-nombre"></div>
    </div>
    <div class="campo"><label>Fecha <i class="info-i" title="(i) Puedes colocar una fecha ANTERIOR a hoy — útil para cargar deudas de días pasados al empezar a usar el sistema, sin obligarte a registrarlas todas con la fecha de hoy.">i</i></label><input type="date" id="fd-fecha" value="${hoyISO()}" max="${hoyISO()}"></div>
    <div class="campo"><label>Descripción de la compra <i class="info-i" title="(i) Qué se llevó fiado (ej: 2kg de arroz, 1 cartón de huevos).">i</i></label><input id="fd-descripcion"></div>
    <div class="campo"><label>Nota / observación (opcional) <i class="info-i" title="(i) Cualquier detalle extra que quieras recordar sobre esta deuda.">i</i></label><textarea id="fd-nota" rows="2"></textarea></div>
    <div class="campo"><label>Monto de esta deuda (Bs) <i class="info-i" title="(i) Lo que se fió HOY, en bolívares. El sistema lo convierte a dólares con la tasa del día y ESE es el saldo real que va a deber la persona.">i</i></label><input type="number" step="0.01" id="fd-monto"></div>
    <p class="equivalencia-tasa" id="fd-equivalencia"></p>
    <div id="fd-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-deudor">Guardar</button>
    </div>`);

  $('#fd-existente').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    $('#fd-cedula').value = e.target.value || '';
    $('#fd-nombre').value = e.target.value ? (opt.dataset.nombre || '') : '';
  });

  const actualizarEquivalencia = async () => {
    const tasa = await AUTH.getTasaDia();
    const monto = Number($('#fd-monto').value) || 0;
    $('#fd-equivalencia').textContent = tasa && monto
      ? `≈ ${formatUsd(monto / tasa)} con la tasa del día (${formatBs(tasa)} por $1)`
      : '';
  };
  $('#fd-monto').addEventListener('input', actualizarEquivalencia);
  actualizarEquivalencia();

  $('#btn-guardar-deudor').addEventListener('click', async () => {
    const cedula = $('#fd-cedula').value.trim();
    const monto = Number($('#fd-monto').value);
    const err = $('#fd-error');
    if (!monto || monto <= 0) { err.textContent = 'Coloca un monto válido.'; err.classList.remove('hidden'); return; }
    const tasa = await AUTH.getTasaDia();
    if (!tasa) { err.textContent = 'Debes colocar la tasa del día antes de registrar una deuda.'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    await DEUD.crearDeuda({
      cedula, nombre: $('#fd-nombre').value.trim(), fecha: $('#fd-fecha').value,
      descripcion: $('#fd-descripcion').value.trim(), nota: $('#fd-nota').value.trim(),
      montoBs: monto, montoUsd: Number((monto / tasa).toFixed(2)), tasaDelDia: tasa,
    });
    cerrarModalGenerico();
    toastGuardadoExito('Deuda registrada con éxito (se suma al total en $ de esa persona)');
    renderDeudores();
  });
}

async function abrirModalPagoDeuda(deudaId) {
  const deuda = await DB.get('deudores', deudaId);
  const tasaActual = await AUTH.getTasaDia();
  abrirModalGenerico(`
    <h2>Pagar deuda — ${deuda.nombre || deuda.cedula}</h2>
    <p>Saldo actual: <strong>${formatUsd(deuda.saldoUsd)}</strong> ${tasaActual ? `<span style="color:var(--tinta-suave)">(≈ ${formatBs(deuda.saldoUsd * tasaActual)} hoy)</span>` : ''}</p>
    ${!tasaActual ? '<div class="error">Debes colocar la tasa del día antes de cobrar.</div>' : ''}
    <div class="campo"><label>Tipo <i class="info-i" title="(i) 'Pago completo' salda toda la deuda de una vez. 'Abono parcial' es cuando entrega solo una parte y todavía queda debiendo.">i</i></label>
      <select id="pd-tipo"><option value="abono">Abono parcial</option><option value="pago_completo">Pago completo</option></select>
    </div>
    <div class="campo" id="pd-wrap-monto"><label>Monto del abono (Bs) <i class="info-i" title="(i) Coloca aquí el monto que el deudor está entregando, EN BOLÍVARES. El sistema calcula automáticamente cuánto es en dólares y lo resta de su deuda. Si entrega de más, el sobrante queda como crédito a su favor (en Bs).">i</i></label><input type="number" step="0.01" id="pd-monto"></div>
    <p class="equivalencia-tasa" id="pd-equivalencia"></p>
    <div class="campo"><label>Método de pago <i class="info-i" title="(i) Cómo recibiste el dinero (efectivo, pago móvil, etc). Se usa para el cuadre de caja del día.">i</i></label>
      <select id="pd-metodo">${METODOS_PAGO.filter(m => m.id !== 'fiado' && m.id !== 'credito_favor').map(m => `<option value="${m.id}">${m.label}</option>`).join('')}</select>
    </div>
    <div class="campo" id="pd-wrap-ref"><label>Referencia</label><input id="pd-referencia"></div>
    <div id="pd-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-confirmar-pago-deuda">Confirmar</button>
    </div>`);

  const actualizarEquivalencia = () => {
    const montoBs = Number($('#pd-monto').value) || 0;
    if (!tasaActual || !montoBs) { $('#pd-equivalencia').textContent = ''; return; }
    const usdEquivalente = montoBs / tasaActual;
    const aplicado = Math.min(usdEquivalente, deuda.saldoUsd);
    const excedenteBs = Number((montoBs - aplicado * tasaActual).toFixed(2));
    let texto = `Equivale a ≈ ${formatUsd(usdEquivalente)} (tasa de hoy: ${formatBs(tasaActual)} por $1). Se abona ${formatUsd(aplicado)} a la deuda.`;
    if (excedenteBs > 0.01) texto += ` El resto (${formatBs(excedenteBs)}) queda como CRÉDITO a favor de esta persona.`;
    $('#pd-equivalencia').textContent = texto;
  };
  $('#pd-monto').addEventListener('input', actualizarEquivalencia);

  $('#pd-tipo').addEventListener('change', (e) => {
    $('#pd-wrap-monto').style.display = e.target.value === 'pago_completo' ? 'none' : '';
  });
  $('#pd-metodo').addEventListener('change', (e) => {
    const def = METODOS_PAGO.find(m => m.id === e.target.value);
    $('#pd-wrap-ref').style.display = def.requiereReferencia ? '' : '';
  });
  $('#btn-confirmar-pago-deuda').addEventListener('click', async () => {
    const tipo = $('#pd-tipo').value;
    const res = await DEUD.registrarPago(deudaId, {
      tipo, montoBs: $('#pd-monto').value, metodo: $('#pd-metodo').value, referencia: $('#pd-referencia').value.trim(),
    });
    if (!res.ok) { $('#pd-error').textContent = res.msg; $('#pd-error').classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito(res.excedenteBs > 0.01 ? `Pago registrado — se guardó Bs ${res.excedenteBs.toFixed(2)} como crédito a favor` : 'Pago registrado con éxito');
    renderDeudores();
  });
}

/* ============================================================
   CUENTAS POR PAGAR (proveedores) — solo admin
   ============================================================ */
async function renderCuentasPagar() {
  const activas = await CXP.listarActivas();
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Cuentas por pagar</h1>
    <p class="subtitulo">Lo que la bodega debe a proveedores o terceros.</p>
    <div class="card">
      <div class="fila-acciones"><button class="btn btn-primary" id="btn-nueva-cxp">+ Nueva cuenta por pagar</button></div>
      <table>
        <thead><tr><th>Fecha</th><th>Días</th><th>Proveedor</th><th>Factura/Cédula</th><th>Descripción</th><th>Monto</th><th>Saldo</th><th></th></tr></thead>
        <tbody id="tabla-cxp">
          ${activas.map(c => `
            <tr>
              <td>${c.fecha}</td>
              <td><span class="badge ${diasDesde(c.fecha) > 15 ? 'badge-rojo' : diasDesde(c.fecha) > 5 ? 'badge-ambar' : 'badge-azul'}">${diasDesde(c.fecha)} día(s)</span></td>
              <td>${c.proveedor}</td><td>${c.factura || '-'}</td><td>${c.descripcion}</td>
              <td class="num">${formatUsd(c.montoUsd)}</td><td class="num"><strong>${formatUsd(c.saldoUsd)}</strong></td>
              <td><button class="btn btn-mini btn-primary" data-pagar="${c.id}">Pagar</button></td>
            </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--tinta-suave)">No hay cuentas activas.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  $('#btn-nueva-cxp').addEventListener('click', abrirFormularioCXP);
  $('#tabla-cxp').addEventListener('click', (e) => {
    const pagar = e.target.closest('[data-pagar]');
    if (pagar) abrirModalPagoCXP(Number(pagar.dataset.pagar));
  });
}

function abrirFormularioCXP() {
  abrirModalGenerico(`
    <h2>Nueva cuenta por pagar</h2>
    <div class="grid-2">
      <div class="campo"><label>Fecha <i class="info-i" title="(i) Puedes colocar una fecha ANTERIOR a hoy — útil para cargar cuentas de proveedores de días pasados al empezar a usar el sistema.">i</i></label><input type="date" id="cxp-fecha" value="${hoyISO()}" max="${hoyISO()}"></div>
      <div class="campo"><label>Proveedor / persona</label><input id="cxp-proveedor"></div>
    </div>
    <div class="campo"><label>Factura o cédula</label><input id="cxp-factura"></div>
    <div class="campo"><label>Descripción</label><input id="cxp-descripcion"></div>
    <div class="campo"><label>Moneda del monto</label>
      <select id="cxp-moneda">
        <option value="usd">Dólares ($)</option>
        <option value="bs">Bolívares (Bs) — se convertirá a $ con la tasa del día</option>
      </select>
    </div>
    <div class="campo"><label id="cxp-label-monto">Monto ($)</label><input type="number" step="0.01" id="cxp-monto"></div>
    <p class="equivalencia-tasa" id="cxp-equivalencia"></p>
    <div id="cxp-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-cxp">Guardar</button>
    </div>`);

  const actualizarVista = async () => {
    const moneda = $('#cxp-moneda').value;
    $('#cxp-label-monto').textContent = moneda === 'bs' ? 'Monto (Bs)' : 'Monto ($)';
    const monto = Number($('#cxp-monto').value) || 0;
    if (moneda === 'bs') {
      const tasa = await AUTH.getTasaDia();
      $('#cxp-equivalencia').textContent = tasa && monto
        ? `≈ ${formatUsd(monto / tasa)} con la tasa del día (${formatBs(tasa)} por $1)`
        : '';
    } else {
      $('#cxp-equivalencia').textContent = '';
    }
  };
  $('#cxp-moneda').addEventListener('change', actualizarVista);
  $('#cxp-monto').addEventListener('input', actualizarVista);

  $('#btn-guardar-cxp').addEventListener('click', async () => {
    const proveedor = $('#cxp-proveedor').value.trim();
    const monto = Number($('#cxp-monto').value);
    const moneda = $('#cxp-moneda').value;
    const err = $('#cxp-error');
    if (!proveedor || !monto) { err.textContent = 'Proveedor y monto son obligatorios.'; err.classList.remove('hidden'); return; }
    let tasa = 0;
    if (moneda === 'bs') {
      tasa = await AUTH.getTasaDia();
      if (!tasa) { err.textContent = 'Debes colocar la tasa del día antes de registrar en bolívares.'; err.classList.remove('hidden'); return; }
    }
    err.classList.add('hidden');
    await CXP.crear({
      fecha: $('#cxp-fecha').value, proveedor, factura: $('#cxp-factura').value.trim(),
      descripcion: $('#cxp-descripcion').value.trim(), moneda, monto, tasaDelDia: tasa,
    });
    cerrarModalGenerico();
    toastGuardadoExito('Cuenta por pagar guardada con éxito');
    renderCuentasPagar();
  });
}

async function abrirModalPagoCXP(id) {
  const cuenta = await DB.get('cuentasPagar', id);
  const tasaActual = await AUTH.getTasaDia();
  abrirModalGenerico(`
    <h2>Pagar — ${cuenta.proveedor}</h2>
    <p>Saldo actual: <strong>${formatUsd(cuenta.saldoUsd)}</strong> ${tasaActual ? `<span style="color:var(--tinta-suave)">(≈ ${formatBs(cuenta.saldoUsd * tasaActual)} hoy)</span>` : ''}</p>
    ${!tasaActual ? '<div class="error">Debes colocar la tasa del día antes de pagar.</div>' : ''}
    <div class="campo"><label>Tipo</label>
      <select id="cxpd-tipo"><option value="abono">Abono parcial</option><option value="pago_completo">Pago completo</option></select>
    </div>
    <div class="campo" id="cxpd-wrap-monto"><label>Monto del abono ($)</label><input type="number" step="0.01" id="cxpd-monto"></div>
    <p class="equivalencia-tasa" id="cxpd-equivalencia"></p>
    <div class="campo"><label>Referencia bancaria (obligatoria)</label><input id="cxpd-referencia"></div>
    <div id="cxpd-error" class="error hidden"></div>
    <div class="modal-botones">
      <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
      <button class="btn btn-primary" id="btn-confirmar-pago-cxp">Confirmar</button>
    </div>`);

  const actualizarEquivalencia = () => {
    const monto = Number($('#cxpd-monto').value) || 0;
    $('#cxpd-equivalencia').textContent = tasaActual && monto
      ? `Equivalente a pagar: ≈ ${formatBs(monto * tasaActual)} (tasa de hoy: ${formatBs(tasaActual)} por $1)`
      : '';
  };
  $('#cxpd-monto').addEventListener('input', actualizarEquivalencia);

  $('#cxpd-tipo').addEventListener('change', (e) => $('#cxpd-wrap-monto').style.display = e.target.value === 'pago_completo' ? 'none' : '');
  $('#btn-confirmar-pago-cxp').addEventListener('click', async () => {
    const res = await CXP.registrarPago(id, { tipo: $('#cxpd-tipo').value, montoUsd: $('#cxpd-monto').value, referencia: $('#cxpd-referencia').value.trim() });
    if (!res.ok) { $('#cxpd-error').textContent = res.msg; $('#cxpd-error').classList.remove('hidden'); return; }
    cerrarModalGenerico();
    toastGuardadoExito('Pago registrado con éxito');
    renderCuentasPagar();
  });
}

/* ============================================================
   CAJEROS (solo admin)
   ============================================================ */
async function renderCajeros() {
  const cajeros = await AUTH.listarCajeros();
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Cajeros y claves</h1>
    <div class="card">
      <h3>Cajeros registrados</h3>
      <table><thead><tr><th>Usuario</th><th>Clave</th><th>Estado</th><th></th></tr></thead>
        <tbody id="tabla-cajeros">
          ${cajeros.map(c => `<tr>
            <td>${c.usuario}</td>
            <td><span class="clave-oculta" data-clave-real="${c.clave}">••••••••</span> <button class="btn btn-mini btn-secundario" data-ver-clave>Ver</button></td>
            <td>${c.activo ? '<span class="badge badge-verde">Activo</span>' : '<span class="badge badge-rojo">Inactivo</span>'}</td>
            <td>
              <button class="btn btn-mini btn-secundario" data-toggle="${c.usuario}" data-activo="${c.activo}">${c.activo ? 'Desactivar' : 'Activar'}</button>
              <button class="btn btn-mini btn-peligro" data-eliminar-cajero="${c.usuario}">Eliminar</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--tinta-suave)">No hay cajeros aún.</td></tr>'}
        </tbody>
      </table>
      <div class="fila-acciones" style="margin-top:14px;">
        <input id="nc-usuario" placeholder="usuario (ej: caja2)" style="max-width:160px;">
        <input id="nc-clave" placeholder="clave" style="max-width:160px;">
        <button class="btn btn-primary" id="btn-crear-cajero">+ Crear cajero</button>
      </div>
    </div>
    <div class="card">
      <h3>Cambiar clave del administrador</h3>
      <div class="grid-3">
        <div class="campo"><label>Clave actual</label><input type="password" id="ca-actual"></div>
        <div class="campo"><label>Clave nueva</label><input type="password" id="ca-nueva"></div>
        <div class="campo" style="display:flex;align-items:flex-end;"><button class="btn btn-primary" id="btn-cambiar-clave-admin">Actualizar</button></div>
      </div>
    </div>
    <div class="card">
      <h3>Clave para cerrar caja (distinta del admin)</h3>
      <div class="grid-2">
        <div class="campo"><label>Nueva clave de cierre de caja</label><input type="password" id="ccc-nueva"></div>
        <div class="campo" style="display:flex;align-items:flex-end;"><button class="btn btn-primary" id="btn-cambiar-clave-cierre">Actualizar</button></div>
      </div>
    </div>`;

  $('#tabla-cajeros').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    const verClave = e.target.closest('[data-ver-clave]');
    const eliminar = e.target.closest('[data-eliminar-cajero]');
    if (t) { await AUTH.toggleCajero(t.dataset.toggle, t.dataset.activo !== 'true'); toastGuardadoExito('Estado actualizado'); renderCajeros(); }
    if (verClave) {
      const span = verClave.previousElementSibling;
      const oculta = span.textContent === '••••••••';
      span.textContent = oculta ? span.dataset.claveReal : '••••••••';
      verClave.textContent = oculta ? 'Ocultar' : 'Ver';
    }
    if (eliminar) {
      if (confirm(`¿Eliminar al cajero "${eliminar.dataset.eliminarCajero}" por completo? Esta acción no se puede deshacer.`)) {
        await AUTH.eliminarCajero(eliminar.dataset.eliminarCajero);
        toastGuardadoExito('Cajero eliminado');
        renderCajeros();
      }
    }
  });
  $('#btn-crear-cajero').addEventListener('click', async () => {
    const usuario = $('#nc-usuario').value, clave = $('#nc-clave').value;
    if (!usuario || !clave) return toast('Usuario y clave son obligatorios.', true);
    const res = await AUTH.crearCajero(usuario, clave);
    if (!res.ok) return toast(res.msg, true);
    toastGuardadoExito('Cajero creado con éxito');
    renderCajeros();
  });
  $('#btn-cambiar-clave-admin').addEventListener('click', async () => {
    const res = await AUTH.cambiarClave('admin', $('#ca-actual').value, $('#ca-nueva').value);
    if (!res.ok) return toast(res.msg, true);
    toastGuardadoExito('Clave de administrador actualizada');
    $('#ca-actual').value = ''; $('#ca-nueva').value = '';
  });
  $('#btn-cambiar-clave-cierre').addEventListener('click', async () => {
    const nueva = $('#ccc-nueva').value;
    if (!nueva) return toast('Coloca una clave.', true);
    await AUTH.cambiarClaveCierreCaja(nueva);
    toastGuardadoExito('Clave de cierre de caja actualizada');
    $('#ccc-nueva').value = '';
  });
}

/* ============================================================
   CUADRE DE CAJA
   ============================================================ */
async function renderCuadre() {
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Cuadre de caja</h1>
    <div class="card">
      <div class="fila-acciones">
        <input type="date" id="cuadre-fecha" value="${hoyISO()}">
        <button class="btn btn-secundario" id="btn-ver-parcial">Ver cuadre parcial</button>
        <button class="btn btn-secundario" id="btn-ver-final">Ver cuadre final</button>
        <button class="btn btn-ambar" id="btn-exportar-pdf">Exportar PDF</button>
        <button class="btn btn-peligro" id="btn-cerrar-dia">Cerrar día</button>
      </div>
      <div id="resultado-cuadre"></div>
    </div>`;

  $('#btn-ver-parcial').addEventListener('click', async () => {
    const fecha = $('#cuadre-fecha').value;
    const resumen = await CUADRE.cuadreParcial(fecha);
    $('#resultado-cuadre').innerHTML = `
      <table><thead><tr><th>Método</th><th>Total</th></tr></thead><tbody>
      ${Object.values(resumen).map(r => `<tr><td>${r.label}</td><td class="num">${formatBs(r.total)}</td></tr>`).join('')}
      </tbody></table><p class="subtitulo">Vista solo visual — sin detalle de referencias.</p>`;
  });

  $('#btn-ver-final').addEventListener('click', async () => {
    const fecha = $('#cuadre-fecha').value;
    const cierre = await CUADRE.cuadreFinal(fecha);
    $('#resultado-cuadre').innerHTML = Object.keys(cierre.resumen).map(k => {
      const r = cierre.resumen[k];
      if (r.total <= 0 && r.detalle.length === 0) return '';
      return `<h3>${r.label}: ${formatBs(r.total)}</h3>
        ${r.detalle.length ? `<table><thead><tr><th>Hora</th><th>Monto</th><th>Referencia</th><th>Detalle</th></tr></thead><tbody>
          ${r.detalle.map(d => `<tr><td>${d.hora}</td><td class="num">${formatBs(d.monto)}</td><td>${d.referencia || '-'}</td><td>${d.etiqueta}</td></tr>`).join('')}
        </tbody></table>` : ''}`;
    }).join('') + `<div class="carrito-total"><span>TOTAL GENERAL</span><span>${formatBs(cierre.totalBs)} (≈ ${formatUsd(cierre.totalUsd)})</span></div>`;
  });

  $('#btn-exportar-pdf').addEventListener('click', async () => {
    await CUADRE.exportarPDF($('#cuadre-fecha').value);
    toast('PDF exportado.');
  });

  $('#btn-cerrar-dia').addEventListener('click', () => {
    abrirModalGenerico(`
      <h2>Cerrar el día</h2>
      <p>Esto requiere la clave de cierre de caja.</p>
      <div class="campo"><label>Clave</label><input type="password" id="cierre-clave"></div>
      <div id="cierre-error" class="error hidden"></div>
      <div class="modal-botones">
        <button class="btn btn-secundario" data-cerrar-modal="modal-generico">Cancelar</button>
        <button class="btn btn-peligro" id="btn-confirmar-cierre">Confirmar cierre</button>
      </div>`);
    $('#btn-confirmar-cierre').addEventListener('click', async () => {
      const fecha = $('#cuadre-fecha').value;
      const res = await CUADRE.finalizarDia(fecha, $('#cierre-clave').value);
      if (!res.ok) { $('#cierre-error').textContent = res.msg; $('#cierre-error').classList.remove('hidden'); return; }
      cerrarModalGenerico();
      toastGuardadoExito('Día cerrado con éxito');
    });
  });
}

/* ============================================================
   RESPALDO Y AUTOGUARDADO (solo admin)
   ============================================================ */
async function renderRespaldo() {
  const cont = $('#contenido-principal');
  cont.innerHTML = `
    <h1>Respaldo y autoguardado</h1>
    <div class="card">
      <h3>Autoguardado automático (cada 1 minuto)</h3>
      <p class="subtitulo">Elige dónde vivirá el Excel maestro. El sistema lo reescribe solo cada minuto — si se va la luz, al volver todo sigue ahí.</p>
      <button class="btn btn-primary" id="btn-elegir-archivo">${BACKUP.soportado ? 'Elegir archivo maestro' : 'No disponible en este navegador'}</button>
      <p id="estado-backup" style="margin-top:10px;color:var(--tinta-suave);"></p>
    </div>
    <div class="card">
      <h3>Respaldo manual</h3>
      <p class="subtitulo">Descarga ahora una copia completa de toda la base de datos en Excel.</p>
      <button class="btn btn-secundario" id="btn-respaldo-manual">⬇ Descargar respaldo ahora</button>
    </div>`;

  $('#btn-elegir-archivo').addEventListener('click', async () => {
    const res = await BACKUP.elegirArchivoMaestro();
    if (!res.ok) return toast(res.msg, true);
    BACKUP.iniciarAutoguardado();
    await BACKUP.guardarAhora();
    toastGuardadoExito('Archivo maestro configurado. Autoguardado activo.');
    $('#estado-backup').textContent = 'Autoguardado activo cada 1 minuto.';
  });
  $('#btn-respaldo-manual').addEventListener('click', async () => {
    await INV.exportarRespaldoCompleto();
    toast('Respaldo descargado.');
  });
}

/* ============================================================
   ARRANQUE
   ============================================================ */
iniciarApp();
