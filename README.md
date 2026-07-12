# Bodega — Sistema de Gestión Offline

Sistema de punto de venta e inventario para bodega, 100% offline (no necesita
internet para funcionar), pensado para no perder nada si se va la luz.

## ⚠️ Cómo abrir el sistema (importante)

**No abras `index.html` con doble clic.** El guardado automático en un solo
Excel maestro usa una función del navegador que solo funciona si la página se
abre por `http://localhost`, no directamente desde un archivo.

En vez de eso:

- **Windows:** haz doble clic en `iniciar_windows.bat`. Se abrirá una ventana
  negra (no la cierres mientras trabajas) y el navegador con el sistema.
- **Mac/Linux:** haz doble clic en `iniciar_mac_linux.sh` (o corre
  `./iniciar_mac_linux.sh` desde la terminal).

Esto requiere tener **Python** instalado (ya viene en la mayoría de los
equipos). Si no tienes Python, dime y te preparo otra alternativa (por
ejemplo con Node.js).

Usa **Google Chrome o Microsoft Edge** — son los únicos navegadores que
soportan el guardado automático en el archivo Excel maestro. En otros
navegadores el sistema funciona igual, pero el respaldo tendrás que
descargarlo manualmente (botón "Descargar respaldo ahora").

## Usuarios por defecto

| Usuario | Clave      | Rol    |
|---------|-----------|--------|
| admin   | adri2712  | Administrador |
| caja1   | caja1123  | Cajero |

Cámbialas apenas entres, desde el panel **Cajeros** (como admin).

La clave para **reset total del sistema** (borra todo) es fija: `Adri2712.23536980`.
Se pide desde el botón "ⓘ Restablecer sistema" en la pantalla de login.

La clave para **cerrar caja** es distinta a la del admin y se configura
también en el panel **Cajeros** (por defecto `adri2712`, cámbiala).

## Flujo de trabajo

1. **Inventario** (admin): genera la plantilla Excel, llénala (o usa el
   formulario en pantalla), impórtala. Los productos con "fijar en Bs"
   activado no suben de precio cuando cambia la tasa.
2. **Ventas** (POS): busca el producto, se arma el carrito, "Finalizar
   compra" y se eligen uno o varios métodos de pago (se pueden combinar).
   Elegir "Fiado / Deuda" como método crea automáticamente el registro en
   Deudores.
3. **Deudores**: cada deuda es un registro independiente — una misma persona
   puede tener varias. Se puede abonar o pagar completo; ambos movimientos
   entran al cuadre de caja del día con su referencia.
   - Si alguien abona de más, el sobrante en Bs queda como **crédito a favor**
     y se puede usar como método de pago en su próxima compra (POS).
   - Cuando ese crédito se agota (solo o marcado a mano con "Marcar como
     consumido / bloquear") **no se borra**: queda en la tabla "Historial de
     créditos consumidos / bloqueados", con sus movimientos, hasta que tú lo
     elimines manualmente con el botón "Eliminar" (pide clave de admin).
   - Si a esa persona le vuelve a quedar crédito de más, el bloqueado se
     reactiva solo.
4. **Cuentas por pagar**: lo que la bodega debe a proveedores. Siempre pide
   referencia bancaria al pagar/abonar.
5. **Cuadre de caja**: "parcial" muestra solo totales (visual). "Final"
   muestra el detalle completo con referencias, exporta a PDF, y "Cerrar
   día" pide la clave de cierre.
6. **Respaldo y autoguardado**: configura el archivo Excel maestro una sola
   vez (botón "Elegir archivo maestro") y el sistema lo reescribe solo cada
   minuto. También puedes descargar un respaldo manual cuando quieras.

## Estructura del proyecto

```
bodega-app/
├── index.html              → pantalla principal
├── iniciar_windows.bat      → arranque en Windows
├── iniciar_mac_linux.sh     → arranque en Mac/Linux
├── css/style.css
├── js/
│   ├── db.js               → motor IndexedDB (guardado offline)
│   ├── auth.js             → login, roles, claves, reset
│   ├── inventario.js       → productos, plantilla Excel, importación
│   ├── ventas.js            → punto de venta, carrito, pagos
│   ├── deudores.js          → fiados
│   ├── cuentasPagar.js      → deudas a proveedores
│   ├── cuadre.js            → cuadre de caja, PDF
│   ├── backup.js            → autoguardado en Excel maestro
│   └── app.js                → interfaz y navegación
└── vendor/                  → librerías (xlsx, jspdf) guardadas localmente,
                                sin depender de internet
```

## Subir esto a GitHub

Desde una terminal, dentro de la carpeta `bodega-app`:

```bash
git init
git add .
git commit -m "Sistema de bodega offline v1"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/NOMBRE-REPO.git
git push -u origin main
```

Cambia `TU-USUARIO/NOMBRE-REPO` por los datos de tu repositorio. Si el
repositorio ya existe con contenido, puede que necesites `git pull origin
main --allow-unrelated-histories` antes del push.

## Notas importantes

- Los datos viven en el navegador (IndexedDB), en el equipo donde se usa.
  Si limpias el caché del navegador o cambias de equipo, se pierden — por
  eso el autoguardado y los respaldos manuales son clave.
- Las claves están guardadas dentro de la propia base de datos local, no
  cifradas. Para un sistema de una sola bodega es razonable, pero cualquier
  persona con acceso técnico al equipo podría llegar a verlas.
- El envío de reportes por WhatsApp/Telegram no está incluido en esta
  versión (quedó pendiente, según lo conversado); el cuadre final se exporta
  en PDF.
