#!/bin/bash
cd "$(dirname "$0")"
echo "Iniciando Bodega..."
echo "No cierres esta ventana mientras uses el sistema."
( sleep 1 && open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080 2>/dev/null ) &
python3 -m http.server 8080
