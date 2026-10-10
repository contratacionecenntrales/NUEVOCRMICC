/* =============================================================================
   ICC CRM · Comparador y Auditor Inteligente (pantallas)
   Port del proyecto "integral-connection-comparador" al CRM: cada gestor crea
   una auditoria por factura, siempre ligada a un cliente del CRM, y la
   descarga en PDF. Los calculos y los PDF salen de js/comparador_motor.js.

   Rutas:
     #/comparador                         panel + historico de auditorias
     #/comparador/nueva?sector=&cliente=  asistente (sector → factura → resultado)
     #/comparador/telecom?cliente=        auditoria avanzada de telecomunicaciones
     #/comparador/auditoria/:id           detalle de una auditoria guardada
   ============================================================================= */
window.icc = window.icc || {};

window.icc.comparador = (function () {
  var U = window.icc.util;
  var C = window.ICC_CONST;
  var D = window.icc.data;
  var M = window.icc.comparadorMotor;

  // El motor pide las tarifas por aqui (solo las activas).
  M.listarTarifas = function (catalogo) {
    return D.listarTarifas(catalogo, true);
  };

  function main() {
    return document.getElementById("icc-main");
  }

  function esc(v) {
    return U.escapeHtml(v == null ? "" : String(v));
  }

  var eur = M.formatEUR;
  var pct = M.formatPercent;
  var num = M.formatNumber;

  var SECTORES = [
    { clave: "energia", icono: "⚡", desc: "Factura de luz y/o gas periodo a periodo frente a nuestras mejores tarifas activas." },
    { clave: "telefonia", icono: "📱", desc: "Móvil, fibra y paquetes convergentes: igualamos o mejoramos prestaciones bajando el precio." },
    { clave: "alarmas", icono: "🛡️", desc: "Cuota de seguridad actual frente a nuestros kits, sin perder cobertura." },
    { clave: "pack_integral", icono: "🧩", desc: "Energía, telefonía y alarmas a la vez para maximizar el ahorro total." },
  ];

  function etiquetaSector(s) {
    return (M.SECTOR_LABELS && M.SECTOR_LABELS[s]) || s;
  }

  function etiquetaAuditoria(a) {
    return a.tipo_informe === "telecom_avanzada" ? "Auditoría Telecom (informe avanzado)" : etiquetaSector(a.sector);
  }

  function hashParams() {
    return new URLSearchParams(location.hash.split("?")[1] || "");
  }

  function hoyCompacto() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  function nuevoCodigoAuditoria() {
    return "AUD-" + hoyCompacto() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  // Los PDF muestran el telefono/email de la empresa: usamos los del gestor
  // que hizo la auditoria (si los tiene) para que el cliente le llame a el.
  async function conDatosDeGestor(gestor, fn) {
    var empresa = C.EMPRESA;
    var copia = Object.assign({}, empresa);
    if (gestor) {
      var tel = [gestor.prefijo_telefono && gestor.telefono ? gestor.prefijo_telefono : "", gestor.telefono || ""].join(" ").trim();
      if (tel) {
        empresa.phone = tel;
        if (!empresa.whatsapp) empresa.whatsapp = tel;
      }
      if (gestor.email) empresa.email = gestor.email;
    }
    try {
      return await fn();
    } finally {
      Object.assign(empresa, copia);
    }
  }

  function clienteParaPdf(cliente, codigo) {
    return {
      nombre: cliente.razon_social || cliente.cliente_nombre || "",
      telefono: cliente.contacto_telefono || cliente.telefono || cliente.cliente_telefono || "",
      email: cliente.contacto_email || cliente.email || cliente.cliente_email || "",
      codigo: codigo || null,
    };
  }

  // ------------------------------------------------------------------ Campos
  function campo(label, path, valor, o) {
    o = o || {};
    var tipo = o.tipo || "number";
    var input =
      '<input class="icc-input" data-path="' + path + '" type="' + tipo + '"' +
      (tipo === "number" ? ' step="' + (o.step || "any") + '" inputmode="decimal"' : "") +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") +
      ' value="' + esc(valor) + '">';
    return (
      '<div class="icc-field' + (o.clase ? " " + o.clase : "") + '"><label>' + label + "</label>" +
      (o.sufijo ? '<div class="icc-input-sufijo">' + input + "<span>" + o.sufijo + "</span></div>" : input) +
      "</div>"
    );
  }

  function selector(label, path, valor, opciones, o) {
    o = o || {};
    return (
      '<div class="icc-field' + (o.clase ? " " + o.clase : "") + '"><label>' + label + "</label>" +
      '<select class="icc-select" data-path="' + path + '"' + (o.rerender ? " data-rerender" : "") + ">" +
      opciones.map(function (op) {
        return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(valor) ? " selected" : "") + ">" + esc(op[1]) + "</option>";
      }).join("") +
      "</select></div>"
    );
  }

  function interruptor(label, path, marcado, desc) {
    return (
      '<label class="icc-toggle-row"><span class="icc-switch"><input type="checkbox" data-path="' + path + '" data-rerender' +
      (marcado ? " checked" : "") + '><span class="icc-switch-slider"></span></span>' +
      "<span><strong>" + label + "</strong>" + (desc ? '<span class="icc-muted">' + desc + "</span>" : "") + "</span></label>"
    );
  }

  function tarjeta(icono, titulo, subtitulo, cuerpo) {
    return (
      '<section class="icc-card icc-cmp-card"><div class="icc-cmp-card-head">' +
      (icono ? '<span class="icc-cmp-ico">' + icono + "</span>" : "") +
      "<div><h3>" + titulo + "</h3>" + (subtitulo ? '<p class="icc-muted">' + subtitulo + "</p>" : "") + "</div></div>" +
      cuerpo + "</section>"
    );
  }

  function leerRuta(obj, ruta) {
    return ruta.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function escribirRuta(obj, ruta, valor) {
    var partes = ruta.split(".");
    var ultimo = partes.pop();
    var destino = partes.reduce(function (o, k) {
      if (o[k] == null) o[k] = /^\d+$/.test(k) ? [] : {};
      return o[k];
    }, obj);
    destino[ultimo] = valor;
  }

  // Enlaza los campos data-path de un contenedor con el objeto de estado.
  function enlazar(contenedor, estado, alCambiarEstructura) {
    function manejar(e) {
      var el = e.target;
      var ruta = el.getAttribute && el.getAttribute("data-path");
      if (!ruta) return;
      escribirRuta(estado, ruta, el.type === "checkbox" ? el.checked : el.value);
      if (el.hasAttribute("data-rerender") && e.type === "change") alCambiarEstructura();
    }
    contenedor.addEventListener("input", manejar);
    contenedor.addEventListener("change", manejar);
  }

  // -------------------------------------------------------- Valores por defecto
  var contadorId = 0;
  function nuevoId() {
    contadorId += 1;
    return "f" + contadorId + "-" + Date.now();
  }

  function luzPorDefecto() {
    return {
      segmento: "2.0TD", proveedorActual: "", diasFactura: 30,
      potencias: { p1: 4.6, p2: 4.6, p3: "" },
      consumos: { p1: 120, p2: 90, p3: 60 },
      precioPotenciaActual: { p1: 0.09, p2: 0.09, p3: "" },
      precioEnergiaActual: { p1: 0.16, p2: 0.16, p3: 0.16 },
      terminoFijoActualMensual: 0, alquilerContadorDiaActual: 0.026,
    };
  }

  function gasPorDefecto() {
    return { segmento: "RL.1", proveedorActual: "", diasFactura: 30, consumoKwh: 350, precioEnergiaActual: 0.07, terminoFijoActualMensual: 8 };
  }

  function telefoniaPorDefecto() {
    return {
      operadorActual: "",
      fibras: [{ id: nuevoId(), etiqueta: "Fibra principal", velocidadDeseada: 300, lineaFijaAsociada: false }],
      lineasMoviles: [{ id: nuevoId(), numero: "", gbDeseados: 30, ilimitado: false }],
      cambioTitular: { activo: false, donante: { nombre: "", nif: "", contacto: "" }, receptor: { nombre: "", nif: "", contacto: "" } },
      cuotaMensualActual: 55, consumosActual: 0, otrosConceptosActual: 0,
    };
  }

  function alarmasPorDefecto() {
    return { proveedorActual: "", tipoKitActual: "basica", numCamarasActual: 0, numSensoresActual: 2, cuotaMensualActual: 39.9, permanenciaRestanteMeses: 0 };
  }

  // ------------------------------------------------- Selector de cliente CRM
  // Pinta un buscador de clientes del CRM + alta rapida de un lead nuevo.
  function selectorClienteHtml(id) {
    return (
      '<div class="icc-cliente-picker" id="' + id + '">' +
      '<div class="icc-form-grid">' +
      '<div class="icc-field icc-col-2"><label>Cliente del CRM *</label>' +
      '<input class="icc-input" type="search" placeholder="Busca por nombre, CIF o teléfono…" data-buscar-cliente>' +
      '<select class="icc-select" data-select-cliente size="5"></select></div>' +
      '<div class="icc-field"><label>¿No está en el CRM?</label>' +
      '<button type="button" class="icc-btn icc-btn-ghost" data-nuevo-cliente>+ Dar de alta un cliente nuevo</button></div>' +
      "</div>" +
      '<div class="icc-nuevo-cliente" hidden>' +
      '<div class="icc-form-grid">' +
      '<div class="icc-field"><label>Nombre / Razón social *</label><input class="icc-input" data-nc="razon_social"></div>' +
      '<div class="icc-field"><label>NIF / CIF *</label><input class="icc-input" data-nc="cif"></div>' +
      '<div class="icc-field"><label>Persona de contacto</label><input class="icc-input" data-nc="contacto_nombre"></div>' +
      '<div class="icc-field"><label>Teléfono</label><input class="icc-input" data-nc="contacto_telefono" type="tel"></div>' +
      '<div class="icc-field"><label>Email</label><input class="icc-input" data-nc="contacto_email" type="email"></div>' +
      '<div class="icc-field"><label>Dirección de suministro</label><input class="icc-input" data-nc="direccion_suministro"></div>' +
      "</div>" +
      '<p class="icc-muted">Se creará como Lead en tu cartera al continuar.</p></div>' +
      "</div>"
    );
  }

  // Devuelve { obtener: async () => cliente } con el cliente elegido o creado.
  function montarSelectorCliente(root, clientes, clienteInicialId, alElegir) {
    var buscar = root.querySelector("[data-buscar-cliente]");
    var select = root.querySelector("[data-select-cliente]");
    var bloqueNuevo = root.querySelector(".icc-nuevo-cliente");
    var btnNuevo = root.querySelector("[data-nuevo-cliente]");
    var modoNuevo = false;

    function pintar(filtro) {
      var f = (filtro || "").toLowerCase();
      var lista = clientes.filter(function (c) {
        return !f || [c.razon_social, c.cif, c.contacto_telefono, c.telefono, c.contacto_nombre].join(" ").toLowerCase().indexOf(f) !== -1;
      }).slice(0, 200);
      var actual = select.value || (clienteInicialId ? String(clienteInicialId) : "");
      select.innerHTML = lista.length
        ? lista.map(function (c) {
            return '<option value="' + c.id + '"' + (String(c.id) === actual ? " selected" : "") + ">" +
              esc(c.razon_social) + " · " + esc(c.cif) + (c.comercial_nombre ? " — " + esc(c.comercial_nombre) : "") + "</option>";
          }).join("")
        : "<option disabled>Sin resultados</option>";
    }
    pintar("");
    if (clienteInicialId) select.value = String(clienteInicialId);
    buscar.addEventListener("input", function () { pintar(buscar.value); });
    select.addEventListener("change", function () {
      if (alElegir) alElegir(clientes.filter(function (c) { return String(c.id) === select.value; })[0] || null);
    });
    btnNuevo.addEventListener("click", function () {
      modoNuevo = !modoNuevo;
      bloqueNuevo.hidden = !modoNuevo;
      btnNuevo.textContent = modoNuevo ? "Elegir un cliente existente" : "+ Dar de alta un cliente nuevo";
      buscar.disabled = modoNuevo;
      select.disabled = modoNuevo;
    });

    return {
      obtener: async function () {
        if (!modoNuevo) {
          var c = clientes.filter(function (x) { return String(x.id) === select.value; })[0];
          if (!c) throw new Error("Elige el cliente al que pertenece la factura");
          return c;
        }
        var datos = {};
        bloqueNuevo.querySelectorAll("[data-nc]").forEach(function (el) { datos[el.getAttribute("data-nc")] = el.value.trim(); });
        if (!datos.razon_social || !datos.cif) throw new Error("Para dar de alta el cliente indica nombre y NIF/CIF");
        var nuevoClienteId = await D.crearCliente(datos, []);
        var creado = await D.obtenerCliente(nuevoClienteId);
        clientes.push(creado);
        modoNuevo = false;
        bloqueNuevo.hidden = true;
        buscar.disabled = false;
        select.disabled = false;
        btnNuevo.textContent = "+ Dar de alta un cliente nuevo";
        pintar("");
        select.value = String(creado.id);
        U.toast("Cliente " + creado.razon_social + " creado en el CRM", "success");
        return creado;
      },
    };
  }

  function bloqueFacturaHtml(prefijo) {
    return (
      '<div class="icc-form-grid">' +
      '<div class="icc-field icc-col-2"><label>Factura analizada (referencia)</label>' +
      '<input class="icc-input" id="' + prefijo + '-referencia" placeholder="Nº de factura o periodo, ej. 18 jul – 17 ago 2026"></div>' +
      '<div class="icc-field"><label>Archivo de la factura (opcional)</label>' +
      '<input class="icc-input" type="file" id="' + prefijo + '-archivo" accept="application/pdf,image/*">' +
      '<span class="icc-ayuda">Se guarda en la documentación del cliente.</span></div>' +
      "</div>"
    );
  }

  async function subirFacturaSiHay(clienteId, inputArchivo, motivo) {
    var archivo = inputArchivo && inputArchivo.files && inputArchivo.files[0];
    if (!archivo) return null;
    try {
      var id = await D.subirDocumento(clienteId, "factura", archivo, "Factura auditada en el Comparador (" + motivo + ")");
      return id;
    } catch (err) {
      U.toast("La auditoría se guarda, pero no se pudo subir la factura: " + (err.message || ""), "error");
      return null;
    }
  }

  // =================================================================== PANEL
  async function viewPanel() {
    var params = hashParams();
    var filtros = {};
    ["sector", "tipo", "q", "desde", "hasta", "gestor_id"].forEach(function (k) {
      if (params.get(k)) filtros[k] = params.get(k);
    });
    main().innerHTML = '<div class="icc-loading">Cargando comparador…</div>';
    var datos;
    try {
      datos = await D.historialAuditorias(filtros);
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar el comparador") + "</p>";
      return;
    }
    var auditorias = datos.auditorias || [];
    var k = datos.indicadores || {};
    var puedeTarifas = window.icc.auth.puede("tarifas.gestionar");
    var verGestor = window.icc.auth.esBackofficeOAdmin();

    main().innerHTML =
      '<div class="icc-cmp-hero">' +
      '<img src="assets/brand/icc-icon.png" alt="" class="icc-cmp-hero-logo">' +
      '<div><p class="icc-cmp-kicker">Comparador y Auditor Inteligente</p>' +
      "<h1>Audita cada factura y genera el informe de ahorro en minutos</h1>" +
      '<p class="icc-muted">Cada auditoría queda guardada en la ficha del cliente y puedes volver a descargar su PDF cuando quieras.</p></div>' +
      (puedeTarifas ? '<a class="icc-btn icc-btn-ghost" href="#/comparador/tarifas">⚙️ Tarifas y mercado</a>' : "") +
      "</div>" +
      (datos.migracion_pendiente
        ? '<div class="icc-aviso icc-aviso-oro">⚠️ Falta importar <code>sql/migracion_comparador_auditor.sql</code>: hasta entonces no se pueden guardar ni el Pack Integral ni la Auditoría Telecom.</div>'
        : "") +
      '<div class="icc-cmp-acciones">' +
      SECTORES.map(function (s) {
        return (
          '<a class="icc-cmp-sector" href="#/comparador/nueva?sector=' + s.clave + '">' +
          '<span class="icc-cmp-ico">' + s.icono + "</span><strong>" + esc(etiquetaSector(s.clave)) + "</strong>" +
          '<span class="icc-muted">' + s.desc + "</span></a>"
        );
      }).join("") +
      '<a class="icc-cmp-sector icc-cmp-sector-oro" href="#/comparador/telecom">' +
      '<span class="icc-cmp-ico">📑</span><strong>Auditoría de Telecomunicaciones</strong>' +
      '<span class="icc-muted">Informe avanzado: desglose concepto a concepto, diagnóstico, hallazgos y comparativa con las operadoras del mercado.</span></a>' +
      "</div>" +
      '<div class="icc-stat-grid">' +
      statCard("Auditorías este mes", String(k.mes || 0), "var(--cian)") +
      statCard("Auditorías totales", String(k.total || 0), "#a78bfa") +
      statCard("Ahorro anual detectado", eur(k.ahorro_detectado || 0), "var(--esmeralda)") +
      statCard("Ahorro medio", pct(k.ahorro_medio_pct || 0), "var(--oro)") +
      "</div>" +
      '<section class="icc-card">' +
      '<div class="icc-card-head"><h2>Histórico de auditorías</h2></div>' +
      '<form id="form-filtros-auditorias" class="icc-filtros-row">' +
      '<input class="icc-input" name="q" placeholder="Cliente, CIF, factura o código" value="' + esc(filtros.q || "") + '">' +
      '<select class="icc-select" name="sector"><option value="">Todos los sectores</option>' +
      SECTORES.map(function (s) {
        return '<option value="' + s.clave + '"' + (filtros.sector === s.clave ? " selected" : "") + ">" + esc(etiquetaSector(s.clave)) + "</option>";
      }).join("") +
      "</select>" +
      '<select class="icc-select" name="tipo"><option value="">Todos los informes</option>' +
      '<option value="comparativa"' + (filtros.tipo === "comparativa" ? " selected" : "") + ">Auditoría de ahorro</option>" +
      '<option value="telecom_avanzada"' + (filtros.tipo === "telecom_avanzada" ? " selected" : "") + ">Auditoría Telecom</option></select>" +
      '<input class="icc-input" type="date" name="desde" value="' + esc(filtros.desde || "") + '" title="Desde">' +
      '<input class="icc-input" type="date" name="hasta" value="' + esc(filtros.hasta || "") + '" title="Hasta">' +
      '<button class="icc-btn icc-btn-secondary" type="submit">Filtrar</button>' +
      "</form>" +
      (auditorias.length
        ? '<div class="icc-table-wrap"><table class="icc-table"><thead><tr>' +
          "<th>Fecha</th><th>Cliente</th><th>Informe</th><th>Factura</th>" + (verGestor ? "<th>Gestor</th>" : "") +
          "<th>Actual / año</th><th>Ahorro / año</th></tr></thead><tbody>" +
          auditorias.map(function (a) {
            var positivo = (a.ahorro_anual || 0) > 0;
            return (
              '<tr data-ir-auditoria="' + a.id + '">' +
              "<td>" + U.formatFecha(a.created_at) + "</td>" +
              "<td><strong>" + esc(a.cliente_nombre) + '</strong><br><span class="icc-muted">' + esc(a.cliente_cif) + "</span></td>" +
              "<td>" + esc(etiquetaAuditoria(a)) + (a.codigo ? '<br><code class="icc-perm-clave">' + esc(a.codigo) + "</code>" : "") + "</td>" +
              "<td>" + esc(a.referencia_factura || "—") + "</td>" +
              (verGestor ? "<td>" + esc(a.gestor_nombre || "—") + "</td>" : "") +
              "<td>" + (a.coste_actual_anual != null ? eur(a.coste_actual_anual) : "—") + "</td>" +
              '<td><strong style="color:' + (positivo ? "var(--esmeralda)" : "var(--txt-2)") + '">' +
              (a.ahorro_anual != null ? eur(a.ahorro_anual) : "—") + "</strong>" +
              (a.ahorro_porcentaje != null ? '<br><span class="icc-muted">' + pct(a.ahorro_porcentaje) + "</span>" : "") + "</td>" +
              "</tr>"
            );
          }).join("") +
          "</tbody></table></div>"
        : '<p class="icc-empty">Todavía no hay auditorías' + (Object.keys(filtros).length ? " con estos filtros" : "") + ". Elige un sector arriba para crear la primera.</p>") +
      "</section>";

    document.getElementById("form-filtros-auditorias").addEventListener("submit", function (e) {
      e.preventDefault();
      var qs = new URLSearchParams();
      new FormData(e.target).forEach(function (v, key) { if (v) qs.set(key, v); });
      location.hash = "#/comparador" + (qs.toString() ? "?" + qs.toString() : "");
    });
    main().querySelectorAll("[data-ir-auditoria]").forEach(function (tr) {
      tr.addEventListener("click", function () { location.hash = "#/comparador/auditoria/" + tr.getAttribute("data-ir-auditoria"); });
    });
  }

  function statCard(label, valor, color) {
    return (
      '<div class="icc-stat-card" style="--stat-color:' + color + '"><span class="icc-stat-value">' + valor +
      '</span><span class="icc-stat-label">' + label + "</span></div>"
    );
  }

  // ================================================================ ASISTENTE
  var PASOS = ["Sector y cliente", "Datos de la factura", "Auditoría"];

  function stepper(actual) {
    return (
      '<ol class="icc-stepper">' +
      PASOS.map(function (p, i) {
        var n = i + 1;
        return '<li class="' + (n < actual ? "is-hecho" : n === actual ? "is-actual" : "") + '"><span>' + (n < actual ? "✓" : n) + "</span>" + p + "</li>";
      }).join("") +
      "</ol>"
    );
  }

  async function viewNueva() {
    var params = hashParams();
    main().innerHTML = '<div class="icc-loading">Preparando el comparador…</div>';
    var clientes = await D.listarClientes({}).catch(function () { return []; });
    var estado = {
      sector: params.get("sector") || null,
      cliente: null,
      referencia: "",
      energia: { incluyeLuz: true, incluyeGas: false, luz: luzPorDefecto(), gas: gasPorDefecto() },
      telefonia: telefoniaPorDefecto(),
      alarmas: alarmasPorDefecto(),
    };
    var clienteInicial = params.get("cliente");
    var archivoFactura = null;
    pintarPaso1();

    function pintarPaso1() {
      main().innerHTML =
        '<a href="#/comparador" class="icc-back">← Volver al Comparador</a>' +
        '<div class="icc-cmp-wrap">' + stepper(1) +
        "<h1>¿Qué vamos a auditar?</h1>" +
        '<p class="icc-muted">Elige el sector y el cliente al que pertenece la factura.</p>' +
        '<div class="icc-cmp-acciones icc-cmp-acciones-4">' +
        SECTORES.map(function (s) {
          return (
            '<button type="button" class="icc-cmp-sector' + (estado.sector === s.clave ? " is-activo" : "") + '" data-sector="' + s.clave + '">' +
            '<span class="icc-cmp-ico">' + s.icono + "</span><strong>" + esc(etiquetaSector(s.clave)) + "</strong>" +
            '<span class="icc-muted">' + s.desc + "</span></button>"
          );
        }).join("") +
        "</div>" +
        tarjeta("👤", "Cliente y factura", "La auditoría quedará guardada en la ficha de este cliente.", selectorClienteHtml("picker-cliente") + bloqueFacturaHtml("cmp")) +
        '<div class="icc-cmp-nav"><span></span><button type="button" class="icc-btn icc-btn-primary" id="btn-paso2">Continuar →</button></div>' +
        "</div>";

      main().querySelectorAll("[data-sector]").forEach(function (b) {
        b.addEventListener("click", function () {
          estado.sector = b.getAttribute("data-sector");
          main().querySelectorAll("[data-sector]").forEach(function (x) { x.classList.toggle("is-activo", x === b); });
        });
      });
      var picker = montarSelectorCliente(document.getElementById("picker-cliente"), clientes, estado.cliente ? estado.cliente.id : clienteInicial);
      document.getElementById("cmp-referencia").value = estado.referencia;
      document.getElementById("btn-paso2").addEventListener("click", async function () {
        if (!estado.sector) {
          U.toast("Elige primero el sector que vas a auditar", "error");
          return;
        }
        try {
          estado.cliente = await picker.obtener();
        } catch (err) {
          U.toast(err.message, "error");
          return;
        }
        estado.referencia = document.getElementById("cmp-referencia").value.trim();
        var input = document.getElementById("cmp-archivo");
        archivoFactura = input.files && input.files[0] ? input : archivoFactura;
        pintarPaso2();
      });
    }

    function pintarPaso2() {
      var incluye = function (s) { return estado.sector === s || estado.sector === "pack_integral"; };
      main().innerHTML =
        '<a href="#/comparador" class="icc-back">← Volver al Comparador</a>' +
        '<div class="icc-cmp-wrap">' + stepper(2) +
        "<h1>" + esc(etiquetaSector(estado.sector)) + "</h1>" +
        '<p class="icc-muted">Introduce los datos de la factura actual de <strong>' + esc(estado.cliente.razon_social) + "</strong>" +
        (estado.referencia ? " · " + esc(estado.referencia) : "") + ".</p>" +
        '<div id="cmp-formularios"></div>' +
        '<div class="icc-cmp-nav"><button type="button" class="icc-btn icc-btn-ghost" id="btn-paso1">← Atrás</button>' +
        '<button type="button" class="icc-btn icc-btn-primary" id="btn-calcular">Generar auditoría de ahorro →</button></div>' +
        "</div>";
      var cont = document.getElementById("cmp-formularios");
      function repintar() {
        cont.innerHTML =
          (incluye("energia") ? formularioEnergia(estado.energia) : "") +
          (incluye("telefonia") ? formularioTelefonia(estado.telefonia) : "") +
          (incluye("alarmas") ? formularioAlarmas(estado.alarmas) : "");
      }
      repintar();
      enlazar(cont, estado, repintar);
      cont.addEventListener("click", function (e) {
        var b = e.target.closest("[data-accion]");
        if (!b) return;
        var t = estado.telefonia;
        var accion = b.getAttribute("data-accion");
        var idx = Number(b.getAttribute("data-idx"));
        if (accion === "add-fibra") t.fibras.push({ id: nuevoId(), etiqueta: "Fibra " + (t.fibras.length + 1), velocidadDeseada: 300, lineaFijaAsociada: false });
        if (accion === "del-fibra") t.fibras.splice(idx, 1);
        if (accion === "add-linea") t.lineasMoviles.push({ id: nuevoId(), numero: "", gbDeseados: 30, ilimitado: false });
        if (accion === "del-linea") t.lineasMoviles.splice(idx, 1);
        repintar();
      });
      document.getElementById("btn-paso1").addEventListener("click", pintarPaso1);
      document.getElementById("btn-calcular").addEventListener("click", calcular);
    }

    async function calcular() {
      if ((estado.sector === "energia") && !estado.energia.incluyeLuz && !estado.energia.incluyeGas) {
        U.toast("Activa al menos luz o gas", "error");
        return;
      }
      main().innerHTML =
        '<div class="icc-cmp-wrap">' + stepper(3) +
        '<div class="icc-loading">Calculando el desglose y comparando con nuestras tarifas activas…</div></div>';
      try {
        var entrada = {
          sector: estado.sector,
          cliente: clienteParaPdf(estado.cliente),
          energia: estado.energia,
          telefonia: estado.telefonia,
          alarmas: estado.alarmas,
        };
        var resultado = await M.ejecutarAuditoria(entrada);
        var codigo = nuevoCodigoAuditoria();
        var documentoId = await subirFacturaSiHay(estado.cliente.id, archivoFactura, etiquetaSector(estado.sector));
        var t = resultado.totales;
        var id = await D.guardarAuditoriaComparador({
          cliente_id: estado.cliente.id,
          sector: estado.sector,
          tipo_informe: "comparativa",
          codigo: codigo,
          referencia_factura: estado.referencia,
          documento_id: documentoId,
          datos_entrada: entrada,
          resultado: resultado,
          coste_actual_anual: t.costeActualAnual,
          coste_propuesto_anual: t.costePropuestaAnual,
          ahorro_anual: t.ahorroAnual,
          ahorro_porcentaje: t.ahorroPorcentaje,
        });
        U.toast("Auditoría guardada en la ficha de " + estado.cliente.razon_social, "success");
        location.hash = "#/comparador/auditoria/" + id;
      } catch (err) {
        console.error(err);
        U.toast(err.message || "No se ha podido calcular la auditoría. Revisa los datos.", "error");
        pintarPaso2();
      }
    }
  }

  // ------------------------------------------------------------ Formularios
  function formularioEnergia(e) {
    var luz = e.luz;
    var gas = e.gas;
    var es3TD = luz.segmento === "3.0TD";
    return (
      '<div class="icc-cmp-toggles">' +
      interruptor("Incluir suministro de Luz", "energia.incluyeLuz", e.incluyeLuz) +
      interruptor("Incluir suministro de Gas", "energia.incluyeGas", e.incluyeGas) +
      "</div>" +
      (e.incluyeLuz
        ? tarjeta("⚡", "Luz", "Datos de la factura eléctrica actual",
            '<div class="icc-form-grid">' +
            selector("Peaje contratado", "energia.luz.segmento", luz.segmento, [["2.0TD", "2.0TD (hogar/pequeño negocio)"], ["3.0TD", "3.0TD (negocio, >15kW)"]], { rerender: true }) +
            campo("Compañía actual", "energia.luz.proveedorActual", luz.proveedorActual, { tipo: "text", placeholder: "Ej. Iberdrola, Endesa..." }) +
            campo("Días que cubre la factura", "energia.luz.diasFactura", luz.diasFactura, { sufijo: "días" }) +
            "</div><h4>Potencia contratada y precio actual</h4>" +
            '<div class="icc-form-grid">' +
            campo("Potencia P1 (punta)", "energia.luz.potencias.p1", luz.potencias.p1, { sufijo: "kW" }) +
            campo("Potencia P2 (valle)", "energia.luz.potencias.p2", luz.potencias.p2, { sufijo: "kW" }) +
            (es3TD ? campo("Potencia P3", "energia.luz.potencias.p3", luz.potencias.p3, { sufijo: "kW" }) : "<div></div>") +
            campo("Precio potencia P1 actual", "energia.luz.precioPotenciaActual.p1", luz.precioPotenciaActual.p1, { sufijo: "€/kW/día" }) +
            campo("Precio potencia P2 actual", "energia.luz.precioPotenciaActual.p2", luz.precioPotenciaActual.p2, { sufijo: "€/kW/día" }) +
            (es3TD ? campo("Precio potencia P3 actual", "energia.luz.precioPotenciaActual.p3", luz.precioPotenciaActual.p3, { sufijo: "€/kW/día" }) : "<div></div>") +
            "</div><h4>Consumo y precio de energía por periodo</h4>" +
            '<div class="icc-form-grid">' +
            campo("Consumo P1 (punta)", "energia.luz.consumos.p1", luz.consumos.p1, { sufijo: "kWh" }) +
            campo("Consumo P2 (llana)", "energia.luz.consumos.p2", luz.consumos.p2, { sufijo: "kWh" }) +
            campo("Consumo P3 (valle)", "energia.luz.consumos.p3", luz.consumos.p3, { sufijo: "kWh" }) +
            campo("Precio energía P1 actual", "energia.luz.precioEnergiaActual.p1", luz.precioEnergiaActual.p1, { sufijo: "€/kWh" }) +
            campo("Precio energía P2 actual", "energia.luz.precioEnergiaActual.p2", luz.precioEnergiaActual.p2, { sufijo: "€/kWh" }) +
            campo("Precio energía P3 actual", "energia.luz.precioEnergiaActual.p3", luz.precioEnergiaActual.p3, { sufijo: "€/kWh" }) +
            "</div>" +
            '<div class="icc-form-grid" style="margin-top:12px">' +
            campo("Término fijo mensual actual (si aplica)", "energia.luz.terminoFijoActualMensual", luz.terminoFijoActualMensual, { sufijo: "€/mes" }) +
            campo("Alquiler contador", "energia.luz.alquilerContadorDiaActual", luz.alquilerContadorDiaActual, { sufijo: "€/día" }) +
            "</div>")
        : "") +
      (e.incluyeGas
        ? tarjeta("🔥", "Gas", "Datos de la factura de gas actual",
            '<div class="icc-form-grid">' +
            selector("Segmento de consumo", "energia.gas.segmento", gas.segmento, [["RL.1", "RL.1 · <5.000 kWh/año (cocina/ACS)"], ["RL.2", "RL.2 · 5.000-50.000 kWh/año (calefacción)"]]) +
            campo("Compañía actual", "energia.gas.proveedorActual", gas.proveedorActual, { tipo: "text", placeholder: "Ej. Naturgy, Repsol..." }) +
            campo("Días que cubre la factura", "energia.gas.diasFactura", gas.diasFactura, { sufijo: "días" }) +
            campo("Consumo del periodo", "energia.gas.consumoKwh", gas.consumoKwh, { sufijo: "kWh" }) +
            campo("Precio energía actual", "energia.gas.precioEnergiaActual", gas.precioEnergiaActual, { sufijo: "€/kWh" }) +
            campo("Término fijo mensual actual", "energia.gas.terminoFijoActualMensual", gas.terminoFijoActualMensual, { sufijo: "€/mes" }) +
            "</div>")
        : "")
    );
  }

  function formularioTelefonia(t) {
    var ct = t.cambioTitular;
    var titular = function (rol, titulo) {
      return (
        '<div class="icc-cmp-sub"><p class="icc-cmp-sub-titulo">' + titulo + "</p>" +
        '<div class="icc-form-grid">' +
        campo("Nombre completo / Razón social", "telefonia.cambioTitular." + rol + ".nombre", ct[rol].nombre, { tipo: "text" }) +
        campo("NIF / CIF", "telefonia.cambioTitular." + rol + ".nif", ct[rol].nif, { tipo: "text" }) +
        campo("Teléfono de contacto", "telefonia.cambioTitular." + rol + ".contacto", ct[rol].contacto, { tipo: "text" }) +
        "</div></div>"
      );
    };
    return (
      tarjeta("📶", "Fibra / Internet", "Añade una fibra por cada sede o suministro a comparar",
        t.fibras.map(function (f, i) {
          return (
            '<div class="icc-cmp-sub icc-cmp-fila">' +
            campo("Referencia (sede/dirección)", "telefonia.fibras." + i + ".etiqueta", f.etiqueta, { tipo: "text", placeholder: "Ej. Oficina central" }) +
            campo("Velocidad deseada", "telefonia.fibras." + i + ".velocidadDeseada", f.velocidadDeseada, { sufijo: "Mb" }) +
            '<label class="icc-check"><input type="checkbox" data-path="telefonia.fibras.' + i + '.lineaFijaAsociada"' + (f.lineaFijaAsociada ? " checked" : "") + "> Línea fija asociada</label>" +
            (t.fibras.length > 1 ? '<button type="button" class="icc-btn icc-btn-ghost icc-cmp-quitar" data-accion="del-fibra" data-idx="' + i + '" title="Quitar">🗑</button>' : "") +
            "</div>"
          );
        }).join("") +
        '<button type="button" class="icc-btn icc-btn-ghost" data-accion="add-fibra">+ Añadir fibra</button>') +
      tarjeta("📱", "Líneas móviles", "Añade cada línea que quieras comparar, con su número y GB",
        t.lineasMoviles.map(function (l, i) {
          return (
            '<div class="icc-cmp-sub icc-cmp-fila">' +
            campo("Línea " + (i + 1) + " — nº de teléfono", "telefonia.lineasMoviles." + i + ".numero", l.numero, { tipo: "text", placeholder: "600 000 000 (opcional)" }) +
            (l.ilimitado ? "<div></div>" : campo("GB deseados", "telefonia.lineasMoviles." + i + ".gbDeseados", l.gbDeseados, { sufijo: "GB" })) +
            '<label class="icc-check"><input type="checkbox" data-rerender data-path="telefonia.lineasMoviles.' + i + '.ilimitado"' + (l.ilimitado ? " checked" : "") + "> Datos ilimitados</label>" +
            (t.lineasMoviles.length > 1 ? '<button type="button" class="icc-btn icc-btn-ghost icc-cmp-quitar" data-accion="del-linea" data-idx="' + i + '" title="Quitar">🗑</button>' : "") +
            "</div>"
          );
        }).join("") +
        '<button type="button" class="icc-btn icc-btn-ghost" data-accion="add-linea">+ Añadir línea</button>') +
      tarjeta("🔁", "Cambio de titularidad", "Actívalo si la portabilidad implica cambiar el titular del contrato",
        interruptor("Esta operación incluye cambio de titular", "telefonia.cambioTitular.activo", ct.activo,
          "Se solicitará el cambio de titular tanto en la compañía donante como en la nueva contratación") +
        (ct.activo ? titular("donante", "Titular donante — compañía actual") + titular("receptor", "Titular receptor — nueva contratación") : "")) +
      tarjeta("🧾", "Factura actual", "Desglose tal y como aparece en la factura (ej. resumen Movistar Fusión), IVA incluido",
        '<div class="icc-form-grid">' +
        campo("Operador actual", "telefonia.operadorActual", t.operadorActual, { tipo: "text", placeholder: "Ej. Movistar, Vodafone, Orange..." }) +
        campo("Cuotas mensuales", "telefonia.cuotaMensualActual", t.cuotaMensualActual, { sufijo: "€/mes" }) +
        campo("Consumos (fuera de bono)", "telefonia.consumosActual", t.consumosActual, { sufijo: "€" }) +
        campo("Otros conceptos (roaming, servicios...)", "telefonia.otrosConceptosActual", t.otrosConceptosActual, { sufijo: "€" }) +
        "</div>")
    );
  }

  function formularioAlarmas(a) {
    return tarjeta("🛡️", "Sistema de alarma actual", "Qué tiene contratado hoy el cliente",
      '<div class="icc-form-grid">' +
      campo("Compañía actual", "alarmas.proveedorActual", a.proveedorActual, { tipo: "text", placeholder: "Ej. Securitas Direct, Prosegur..." }) +
      selector("Tipo de kit actual", "alarmas.tipoKitActual", a.tipoKitActual, [["basica", "Básica (sin cámaras)"], ["camaras", "Con cámaras"], ["gama_alta", "Gama alta"], ["comercial", "Comercial / negocio"]]) +
      "<div></div>" +
      campo("Número de cámaras", "alarmas.numCamarasActual", a.numCamarasActual) +
      campo("Número de sensores/detectores", "alarmas.numSensoresActual", a.numSensoresActual) +
      "<div></div>" +
      campo("Cuota mensual actual", "alarmas.cuotaMensualActual", a.cuotaMensualActual, { sufijo: "€/mes" }) +
      campo("Permanencia restante", "alarmas.permanenciaRestanteMeses", a.permanenciaRestanteMeses, { sufijo: "meses" }) +
      "</div>");
  }

  // ---------------------------------------------------------------- Resultado
  function heroAhorro(totales, clienteNombre) {
    var positivo = totales.ahorroAnual > 0;
    return (
      '<section class="icc-cmp-ahorro">' +
      '<p class="icc-cmp-kicker">✨ Auditoría de ahorro · ' + esc(C.EMPRESA.name) + "</p>" +
      "<h2>" + (clienteNombre ? esc(clienteNombre) + ", esto" : "Esto") + " es lo que puedes ahorrar cambiándote con nosotros</h2>" +
      '<div class="icc-cmp-ahorro-grid">' +
      '<div class="icc-cmp-box"><span>Pagas ahora al año</span><strong>' + eur(totales.costeActualAnual) + "</strong></div>" +
      '<div class="icc-cmp-box"><span>Pagarías con ' + esc(C.EMPRESA.name) + '</span><strong class="oro">' + eur(totales.costePropuestaAnual) + "</strong></div>" +
      '<div class="icc-cmp-box icc-cmp-box-oro"><span>↘ Ahorro anual</span><strong>' + eur(Math.abs(totales.ahorroAnual)) + "</strong>" +
      "<em>" + (positivo ? pct(totales.ahorroPorcentaje) : "0%") + " de ahorro</em></div>" +
      "</div>" +
      (!positivo
        ? '<p class="icc-aviso icc-aviso-oro" style="margin:16px 0 0">Con los datos introducidos, la tarifa actual ya es competitiva frente a nuestro catálogo estándar. Se pueden revisar condiciones comerciales especiales.</p>'
        : "") +
      "</section>"
    );
  }

  function resumenLineas(items) {
    return (
      '<div class="icc-cmp-resumen">' +
      items.map(function (it) {
        return '<div><span>' + it.label + "</span><strong>" + eur(it.actual) + '</strong><em>→ ' + eur(it.propuesta) + "</em></div>";
      }).join("") +
      "</div>"
    );
  }

  function desgloseLuz(r) {
    var ca = r.costeActual;
    var mp = r.mejorPropuesta;
    var cp = mp ? mp.coste : null;
    var g = function (k) { return cp ? cp[k] || 0 : 0; };
    return tarjeta("⚡", "Luz — desglose por periodo", mp ? "Propuesta: " + esc(mp.tarifa.nombre_tarifa) : "Sin propuesta disponible",
      '<div class="icc-table-wrap"><table class="icc-table"><thead><tr><th>Periodo</th><th>Consumo</th><th>Precio actual</th><th>Coste actual</th><th>Precio propuesto</th><th>Coste propuesto</th></tr></thead><tbody>' +
      ca.desglosePeriodos.map(function (p, i) {
        var pr = cp && cp.desglosePeriodos ? cp.desglosePeriodos[i] : null;
        return (
          "<tr><td><strong>" + p.periodo + "</strong></td><td>" + num(p.consumoKwh, 0) + " kWh</td><td>" + num(p.precioEnergia, 4) + " €/kWh</td>" +
          "<td>" + eur(p.costeEnergia) + '</td><td class="oro">' + (pr ? num(pr.precioEnergia, 4) + " €/kWh" : "—") + '</td><td class="oro"><strong>' + (pr ? eur(pr.costeEnergia) : "—") + "</strong></td></tr>"
        );
      }).join("") +
      "</tbody></table></div>" +
      resumenLineas([
        { label: "Término potencia", actual: ca.terminoPotencia, propuesta: g("terminoPotencia") },
        { label: "Término energía", actual: ca.terminoEnergia, propuesta: g("terminoEnergia") },
        { label: "Varios (Bono Social + alquiler contador)", actual: ca.financiacionBonoSocial + ca.alquilerEquipo, propuesta: g("financiacionBonoSocial") + g("alquilerEquipo") },
        { label: "Impuestos (IE + IVA)", actual: ca.impuestoElectricidad + ca.iva, propuesta: g("impuestoElectricidad") + g("iva") },
        { label: "Total factura", actual: ca.total, propuesta: cp ? cp.total : ca.total },
      ]) +
      '<p class="icc-muted">Importes calculados sobre ' + ca.diasFactura + " días de factura · equivalente anual: " + eur(ca.totalAnual) + " → " + eur(cp ? cp.totalAnual : ca.totalAnual) + "</p>");
  }

  function desgloseGas(r) {
    var ca = r.costeActual;
    var mp = r.mejorPropuesta;
    var cp = mp ? mp.coste : null;
    var g = function (k) { return cp ? cp[k] || 0 : 0; };
    return tarjeta("🔥", "Gas — desglose", mp ? "Propuesta: " + esc(mp.tarifa.nombre_tarifa) : "Sin propuesta disponible",
      resumenLineas([
        { label: "Término energía", actual: ca.terminoEnergia, propuesta: g("terminoEnergia") },
        { label: "Término fijo", actual: ca.terminoFijo, propuesta: g("terminoFijo") },
        { label: "IVA", actual: ca.iva, propuesta: g("iva") },
        { label: "Total factura", actual: ca.total, propuesta: cp ? cp.total : ca.total },
      ]) +
      '<p class="icc-muted">Consumo de ' + num(ca.consumoKwh, 0) + " kWh en " + ca.diasFactura + " días · equivalente anual: " + eur(ca.totalAnual) + " → " + eur(cp ? cp.totalAnual : ca.totalAnual) + "</p>");
  }

  function resumenFacturaTel(titulo, r) {
    return (
      '<div class="icc-cmp-sub"><p class="icc-cmp-sub-titulo">' + titulo + "</p>" +
      '<div class="icc-cmp-mini">' +
      "<div><span>Cuotas mensuales</span><strong>" + eur(r.cuotas) + "</strong></div>" +
      "<div><span>Consumos</span><strong>" + eur(r.consumos) + "</strong></div>" +
      "<div><span>Otros conceptos</span><strong>" + eur(r.otros) + "</strong></div>" +
      "<div><span>Impuestos (IVA 21%)</span><strong>" + eur(r.iva) + "</strong></div></div>" +
      '<div class="icc-cmp-total"><span class="icc-muted">Base imponible: ' + eur(r.base) + "</span><strong>Total: " + eur(r.total) + "</strong></div></div>"
    );
  }

  function desgloseTelefonia(t) {
    var p = t.propuesta;
    var tit = function (titulo, x) {
      return '<div class="icc-cmp-sub"><p class="icc-cmp-sub-titulo">' + titulo + "</p><strong>" + esc(x.nombre || "—") + '</strong><p class="icc-muted">NIF/CIF: ' + esc(x.nif || "—") + " · Contacto: " + esc(x.contacto || "—") + "</p></div>";
    };
    return tarjeta("📱", "Telefonía e Internet", "Resumen de factura: actual vs. propuesta",
      (p.componentes.length ? "" : '<p class="icc-muted">No se ha encontrado una tarifa de catálogo que cubra la necesidad indicada.</p>') +
      p.componentes.map(function (c) {
        return '<div class="icc-cmp-linea"><div><strong>' + esc(c.tarifa.nombre_tarifa) + '</strong><p class="icc-muted">' + esc(c.etiqueta || c.tarifa.descripcion || "") + '</p></div><strong class="oro">' + eur(c.tarifa.precio_mensual * c.cantidad) + "/mes</strong></div>";
      }).join("") +
      '<div class="icc-grid-2" style="margin-top:12px">' + resumenFacturaTel("Factura actual", t.desgloseActual) + resumenFacturaTel("Propuesta" + (p.componentes.length ? "" : " (sin match)"), t.desglosePropuesta) + "</div>" +
      '<div class="icc-cmp-mini" style="margin-top:12px"><div><span>Actual /año</span><strong>' + eur(t.costeActualAnual) + '</strong></div><div><span>Propuesta /año</span><strong class="oro">' + eur(t.costePropuestaAnual) + "</strong></div></div>" +
      (t.cambioTitular ? '<p class="icc-cmp-sub-titulo" style="margin-top:14px">🔁 Cambio de titularidad solicitado</p><div class="icc-grid-2">' + tit("Titular donante — compañía actual", t.cambioTitular.donante) + tit("Titular receptor — nueva contratación", t.cambioTitular.receptor) + "</div>" : ""));
  }

  function desgloseAlarmas(a) {
    var k = a.kitPropuesto;
    var imp = function (d) {
      return '<div class="icc-cmp-mini"><div><span>Base imponible</span><strong>' + eur(d.base) + "</strong></div><div><span>IVA (21%)</span><strong>" + eur(d.iva) + '</strong></div><div><span>Total a pagar</span><strong class="oro">' + eur(d.totalAPagar) + "</strong></div></div>";
    };
    return tarjeta("🛡️", "Alarmas — propuesta", k ? esc(k.nombre_kit) : "Sin kit disponible",
      (k
        ? '<div class="icc-cmp-mini"><div><span>Cámaras</span><strong>📷 ' + k.num_camaras + "</strong></div><div><span>Sensores</span><strong>📡 " + k.num_sensores + "</strong></div>" +
          "<div><span>Instalación</span><strong>" + (k.coste_instalacion > 0 ? eur(k.coste_instalacion) : "Bonificada") + "</strong></div><div><span>Permanencia</span><strong>" + (k.permanencia_meses || 0) + " meses</strong></div></div>" +
          '<p class="icc-cmp-sub-titulo" style="margin-top:14px">Primera factura — nuestra propuesta</p>' +
          '<div class="icc-table-wrap"><table class="icc-table"><thead><tr><th>Tipo de servicio</th><th>Cuota mensual</th><th>Pago al contado</th><th>Total</th></tr></thead><tbody><tr>' +
          "<td><strong>" + esc(k.nombre_kit) + "</strong>" + ((k.equipamiento || []).length ? "<ul class=\"icc-cmp-check\">" + k.equipamiento.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</td>" +
          "<td>" + eur(a.desglosePropuesta.cuota) + "</td><td>" + (a.desglosePropuesta.pagoContado > 0 ? eur(a.desglosePropuesta.pagoContado) : "Bonificado") + "</td><td><strong>" + eur(a.desglosePropuesta.totalPorServicios) + "</strong></td></tr></tbody></table></div>" +
          imp(a.desglosePropuesta)
        : "") +
      '<p class="icc-cmp-sub-titulo" style="margin-top:14px">Factura actual</p>' + imp(a.desgloseActual) +
      '<div class="icc-cmp-mini" style="margin-top:12px"><div><span>Actual /mes</span><strong>' + eur(a.costeActualMensual) + '</strong></div><div><span>Propuesta /mes</span><strong class="oro">' + eur(a.costePropuestaMensual) + "</strong></div>" +
      "<div><span>Actual /año</span><strong>" + eur(a.costeActualAnual) + '</strong></div><div><span>Propuesta /año</span><strong class="oro">' + eur(a.costePropuestaAnual) + "</strong></div></div>" +
      (!a.cubreEquipamiento ? '<p class="icc-aviso icc-aviso-oro" style="margin-top:12px">El equipamiento actual supera nuestros kits estándar; se propone la gama más alta. Se puede diseñar una solución a medida.</p>' : "") +
      (a.permanenciaRestanteMeses > 0 ? '<p class="icc-aviso" style="margin-top:12px">Permanencia restante declarada con la compañía actual: ' + a.permanenciaRestanteMeses + " meses.</p>" : ""));
  }

  function informeComparativa(resultado, clienteNombre) {
    return (
      heroAhorro(resultado.totales, clienteNombre) +
      (resultado.energia && resultado.energia.luz ? desgloseLuz(resultado.energia.luz) : "") +
      (resultado.energia && resultado.energia.gas ? desgloseGas(resultado.energia.gas) : "") +
      (resultado.telefonia ? desgloseTelefonia(resultado.telefonia) : "") +
      (resultado.alarmas ? desgloseAlarmas(resultado.alarmas) : "")
    );
  }

  // ------------------------------------------------- Informe telecom (pantalla)
  function nivelDiagnostico(valor) {
    var d = (M.DIAGNOSTICOS_FACTURA || []).filter(function (x) { return x.valor === valor; })[0];
    return d ? d.nivel : "neutro";
  }

  function pastillaDiagnostico(valor) {
    var color = { negativo: "#f87171", aviso: "#fbbf24", neutro: "#94a3b8" }[nivelDiagnostico(valor)];
    return '<span class="icc-badge" style="--badge-color:' + color + '">' + esc(valor) + "</span>";
  }

  function informeTelecom(r) {
    var rec = r.recomendado;
    return (
      '<section class="icc-cmp-ahorro">' +
      '<p class="icc-cmp-kicker">📑 Informe de auditoría y optimización de telecomunicaciones · Presupuesto ' + esc(r.codigo) + "</p>" +
      "<h2>" + esc(r.cliente && r.cliente.nombre) + (r.cliente && r.cliente.operadorActual ? " · " + esc(r.cliente.operadorActual) : "") + "</h2>" +
      '<div class="icc-cmp-ahorro-grid">' +
      '<div class="icc-cmp-box"><span>Factura actual</span><strong>' + eur(r.costeActualMensual) + "/mes</strong><em>" + eur(r.costeActualAnual) + "/año</em></div>" +
      '<div class="icc-cmp-box"><span>Propuesta: ' + esc(rec ? rec.operador : "—") + '</span><strong class="oro">' + (rec ? eur(rec.cuota_mensual) + "/mes" : "—") + "</strong><em>" + (rec ? eur(rec.costeAnual) + "/año" : "") + "</em></div>" +
      '<div class="icc-cmp-box icc-cmp-box-oro"><span>↘ Ahorro anual</span><strong>' + eur(r.ahorroAnual) + "</strong><em>" + pct(r.ahorroPorcentaje) + " · " + r.operadorasQueMejoran + " de " + r.totalOperadoras + " operadoras mejoran</em></div>" +
      "</div></section>" +
      tarjeta("🧾", "Diagnóstico de la factura actual", r.cliente && r.cliente.periodoFactura ? "Factura analizada: " + esc(r.cliente.periodoFactura) : "",
        '<div class="icc-table-wrap"><table class="icc-table"><thead><tr><th>Concepto</th><th>€ / mes (IVA incl.)</th><th>Diagnóstico</th></tr></thead><tbody>' +
        (r.conceptos || []).map(function (c) {
          return "<tr><td>" + esc(c.concepto) + "</td><td>" + eur(c.importeMes) + "</td><td>" + pastillaDiagnostico(c.diagnostico) + "</td></tr>";
        }).join("") +
        "<tr><td><strong>Total</strong></td><td><strong>" + eur(r.costeActualMensual) + "</strong></td><td></td></tr></tbody></table></div>") +
      ((r.hallazgos || []).length
        ? tarjeta("🔎", "Hallazgos destacados", "", '<div class="icc-cmp-hallazgos">' + r.hallazgos.map(function (h) {
            return "<div><strong>" + esc(h.titulo) + "</strong><p class=\"icc-muted\">" + esc(h.descripcion) + "</p></div>";
          }).join("") + "</div>")
        : "") +
      tarjeta("📊", "Comparativa con el mercado", "Coste anual de cada operadora frente a la factura actual",
        '<div class="icc-table-wrap"><table class="icc-table"><thead><tr><th>Operadora</th><th>Cuota / mes</th><th>Coste / año</th><th>Ahorro / año</th><th>Promoción</th><th>Valoración</th></tr></thead><tbody>' +
        (r.operadores || []).map(function (o) {
          var esRec = rec && o.id === rec.id;
          return (
            "<tr" + (esRec ? ' class="icc-cmp-fila-rec"' : "") + "><td><strong>" + esc(o.operador) + "</strong>" + (esRec ? ' <span class="icc-badge" style="--badge-color:#d4a62a">Recomendada</span>' : "") + "</td>" +
            "<td>" + eur(o.cuota_mensual) + "</td><td>" + eur(o.costeAnual) + '</td><td style="color:' + (o.ahorroAnual > 0 ? "var(--esmeralda)" : "var(--red)") + '"><strong>' + eur(o.ahorroAnual) + "</strong></td>" +
            "<td>" + esc(o.promocion || "—") + "</td><td>" + esc(o.valoracion || "—") + "</td></tr>"
          );
        }).join("") +
        "</tbody></table></div>")
    );
  }

  // ============================================================== DETALLE
  async function viewDetalle(id) {
    main().innerHTML = '<div class="icc-loading">Cargando auditoría…</div>';
    var a;
    try {
      a = await D.obtenerAuditoriaComparador(id);
    } catch (err) {
      main().innerHTML = '<p class="icc-empty">' + esc(err.message || "No se pudo cargar la auditoría") + "</p>";
      return;
    }
    var esTelecom = a.tipo_informe === "telecom_avanzada";
    var miId = window.icc.auth.state.user && window.icc.auth.state.user.id;
    var puedeBorrar = String(a.gestor_id) === String(miId) || window.icc.auth.esAdminOSuperior();
    var gestor = { nombre: a.gestor_nombre, email: a.gestor_email, telefono: a.gestor_telefono };

    main().innerHTML =
      '<a href="#/comparador" class="icc-back">← Volver al Comparador</a>' +
      '<div class="icc-page-head"><div>' +
      "<h1>" + esc(etiquetaAuditoria(a)) + "</h1>" +
      '<p class="icc-muted"><a href="#/clientes/' + a.cliente_id + '">' + esc(a.cliente_nombre) + "</a> · " + esc(a.cliente_cif) +
      " · " + U.formatFechaHora(a.created_at) + (a.gestor_nombre ? " · Gestor: " + esc(a.gestor_nombre) : "") +
      (a.referencia_factura ? " · Factura: " + esc(a.referencia_factura) : "") +
      (a.codigo ? ' · <code class="icc-perm-clave">' + esc(a.codigo) + "</code>" : "") + "</p></div>" +
      '<div class="icc-head-actions icc-ficha-acciones">' +
      '<button type="button" class="icc-btn icc-btn-primary" id="btn-pdf-auditoria">⬇ Descargar PDF</button>' +
      (esTelecom
        ? '<a class="icc-btn icc-btn-ghost" href="#/comparador/telecom?cliente=' + a.cliente_id + '">+ Nueva auditoría telecom</a>'
        : '<a class="icc-btn icc-btn-ghost" href="#/comparador/nueva?cliente=' + a.cliente_id + "&sector=" + a.sector + '">+ Nueva auditoría</a>') +
      (a.documento_id ? '<a class="icc-btn icc-btn-ghost" href="#/clientes/' + a.cliente_id + '">📎 Factura en la ficha</a>' : "") +
      (puedeBorrar ? '<button type="button" class="icc-btn icc-btn-ghost" style="color:var(--red)" id="btn-borrar-auditoria">Borrar</button>' : "") +
      "</div></div>" +
      '<div class="icc-cmp-wrap icc-cmp-informe">' +
      (esTelecom ? informeTelecom(a.resultado) : informeComparativa(a.resultado, a.cliente_nombre)) +
      "</div>";

    document.getElementById("btn-pdf-auditoria").addEventListener("click", async function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      try {
        await conDatosDeGestor(gestor, function () {
          return esTelecom
            ? M.descargarInformeTelecomPDF(a.resultado)
            : M.descargarInformePDF(a.resultado, clienteParaPdf(a, a.codigo));
        });
      } catch (err) {
        console.error(err);
        U.toast(err.message || "No se pudo generar el PDF", "error");
      } finally {
        btn.disabled = false;
      }
    });
    var btnBorrar = document.getElementById("btn-borrar-auditoria");
    if (btnBorrar) {
      btnBorrar.addEventListener("click", async function () {
        if (!confirm("¿Borrar esta auditoría? El cliente y su factura no se borran.")) return;
        try {
          await D.borrarAuditoriaComparador(a.id);
          U.toast("Auditoría borrada", "success");
          location.hash = "#/comparador";
        } catch (err) {
          U.toast(err.message || "No se pudo borrar", "error");
        }
      });
    }
  }

  // ======================================================= AUDITORIA TELECOM
  async function viewTelecom() {
    var params = hashParams();
    main().innerHTML = '<div class="icc-loading">Cargando auditoría de telecomunicaciones…</div>';
    var clientes = await D.listarClientes({}).catch(function () { return []; });
    var mercado = [];
    var errorMercado = "";
    try {
      mercado = await D.listarTarifas("mercado", true);
    } catch (err) {
      errorMercado = err.message || "No se pudo cargar el catálogo de mercado";
    }
    var usuario = window.icc.auth.state.user;
    var estado = {
      cliente: { nombre: "", ubicacion: "", operadorActual: "", periodoFactura: "" },
      conceptos: [M.crearConceptoVacio()],
      hallazgos: [M.crearHallazgoVacio(), M.crearHallazgoVacio(), M.crearHallazgoVacio()],
      operadorRecomendadoId: "",
    };

    main().innerHTML =
      '<a href="#/comparador" class="icc-back">← Volver al Comparador</a>' +
      '<div class="icc-cmp-wrap">' +
      "<h1>Auditoría de Telecomunicaciones</h1>" +
      '<p class="icc-muted">Consultor/a: ' + esc((usuario.nombre + " " + (usuario.apellidos || "")).trim()) + ". Genera el informe PDF avanzado y lo guarda en la ficha del cliente.</p>" +
      (errorMercado ? '<div class="icc-aviso icc-aviso-oro">⚠️ ' + esc(errorMercado) + "</div>" : "") +
      tarjeta("👤", "Cliente del CRM", "La auditoría quedará guardada en su ficha", selectorClienteHtml("picker-telecom") + bloqueFacturaHtml("tel")) +
      tarjeta("🏢", "Datos del informe", "Así aparecerán en la portada del PDF",
        '<div class="icc-form-grid" id="tel-datos">' +
        campo("Cliente", "cliente.nombre", "", { tipo: "text", placeholder: "Nombre y apellidos / Empresa" }) +
        campo("Ubicación", "cliente.ubicacion", "", { tipo: "text", placeholder: "Ciudad (Provincia)" }) +
        campo("Operador actual", "cliente.operadorActual", "", { tipo: "text", placeholder: "Movistar Fusión Total Plus" }) +
        campo("Factura analizada", "cliente.periodoFactura", "", { tipo: "text", placeholder: "18 jul – 17 ago 2026" }) +
        "</div>") +
      '<div id="tel-conceptos"></div>' +
      tarjeta("🔎", "Hallazgos destacados", "Las 3 tarjetas del informe",
        '<div class="icc-cmp-hallazgos" id="tel-hallazgos">' +
        estado.hallazgos.map(function (h, i) {
          return "<div>" +
            campo("Título", "hallazgos." + i + ".titulo", "", { tipo: "text", placeholder: "Cuota 3 veces por encima del mercado" }) +
            '<div class="icc-field"><label>Descripción</label><textarea class="icc-textarea" data-path="hallazgos.' + i + '.descripcion" placeholder="Solo la cuota fija cuesta 238 €/mes..."></textarea></div>' +
            "</div>";
        }).join("") +
        "</div>") +
      tarjeta("🎯", "Propuesta", "",
        selector("Operadora recomendada", "operadorRecomendadoId", "", [["", "Usar la marcada como recomendada en el catálogo"]].concat(
          mercado.map(function (o) { return [o.id, o.operador + " — " + eur(o.cuota_mensual) + "/mes"]; })
        )) +
        '<p class="icc-muted">El catálogo de operadoras (precios, promociones y características) se gestiona en Comparador → Tarifas → Mercado.</p>') +
      '<div class="icc-cmp-nav"><span></span><button type="button" class="icc-btn icc-btn-primary" id="btn-generar-telecom">⬇ Generar informe PDF y guardar</button></div>' +
      "</div>";

    var datosCont = main();
    enlazar(datosCont, estado, function () {});
    var conceptosCont = document.getElementById("tel-conceptos");

    function pintarConceptos() {
      var total = estado.conceptos.reduce(function (s, c) { return s + (Number(c.importeMes) || 0); }, 0);
      conceptosCont.innerHTML = tarjeta("🧾", "Diagnóstico: desglose de la factura actual", "Un concepto por línea de la factura, con su diagnóstico",
        estado.conceptos.map(function (c, i) {
          return (
            '<div class="icc-cmp-concepto">' +
            campo(i === 0 ? "Concepto" : "", "conceptos." + i + ".concepto", c.concepto, { tipo: "text", placeholder: "Cuota Fusión Total Plus" }) +
            campo(i === 0 ? "€ / mes" : "", "conceptos." + i + ".importeMes", c.importeMes, { step: "0.01" }) +
            selector(i === 0 ? "Diagnóstico" : "", "conceptos." + i + ".diagnostico", c.diagnostico, M.DIAGNOSTICOS_FACTURA.map(function (d) { return [d.valor, d.valor]; })) +
            '<button type="button" class="icc-btn icc-btn-ghost icc-cmp-quitar" data-quitar-concepto="' + i + '" title="Quitar fila">🗑</button>' +
            "</div>"
          );
        }).join("") +
        '<div class="icc-cmp-nav" style="margin-top:8px"><button type="button" class="icc-btn icc-btn-ghost" id="btn-add-concepto">+ Añadir concepto</button>' +
        '<strong id="tel-total">Total factura actual: ' + eur(total) + " / mes</strong></div>");
    }
    pintarConceptos();
    conceptosCont.addEventListener("input", function () {
      var total = estado.conceptos.reduce(function (s, c) { return s + (Number(c.importeMes) || 0); }, 0);
      document.getElementById("tel-total").textContent = "Total factura actual: " + eur(total) + " / mes";
    });
    conceptosCont.addEventListener("click", function (e) {
      if (e.target.id === "btn-add-concepto") {
        estado.conceptos.push(M.crearConceptoVacio());
        pintarConceptos();
      }
      var q = e.target.closest("[data-quitar-concepto]");
      if (q) {
        estado.conceptos.splice(Number(q.getAttribute("data-quitar-concepto")), 1);
        if (!estado.conceptos.length) estado.conceptos.push(M.crearConceptoVacio());
        pintarConceptos();
      }
    });

    function rellenarDesdeCliente(c) {
      if (!c) return;
      var datos = document.getElementById("tel-datos");
      var nombre = datos.querySelector('[data-path="cliente.nombre"]');
      var ubic = datos.querySelector('[data-path="cliente.ubicacion"]');
      if (!estado.cliente.nombre || estado.cliente._auto) {
        nombre.value = estado.cliente.nombre = c.razon_social || "";
        estado.cliente._auto = true;
      }
      if (!estado.cliente.ubicacion && c.direccion_suministro) ubic.value = estado.cliente.ubicacion = c.direccion_suministro;
    }
    document.querySelector('#tel-datos [data-path="cliente.nombre"]').addEventListener("input", function () {
      estado.cliente._auto = false;
    });
    var picker = montarSelectorCliente(document.getElementById("picker-telecom"), clientes, params.get("cliente"), rellenarDesdeCliente);
    if (params.get("cliente")) {
      rellenarDesdeCliente(clientes.filter(function (c) { return String(c.id) === String(params.get("cliente")); })[0]);
    }

    document.getElementById("btn-generar-telecom").addEventListener("click", async function (e) {
      var btn = e.currentTarget;
      var clienteCrm;
      try {
        clienteCrm = await picker.obtener();
      } catch (err) {
        U.toast(err.message, "error");
        return;
      }
      if (!estado.cliente.nombre.trim()) estado.cliente.nombre = clienteCrm.razon_social;
      if (estado.conceptos.every(function (c) { return !String(c.concepto || "").trim(); })) {
        U.toast("Añade al menos un concepto de la factura actual", "error");
        return;
      }
      btn.disabled = true;
      try {
        var cliente = {
          nombre: estado.cliente.nombre,
          ubicacion: estado.cliente.ubicacion,
          operadorActual: estado.cliente.operadorActual,
          periodoFactura: estado.cliente.periodoFactura,
        };
        var resultado = M.ejecutarAuditoriaTelecom(
          {
            cliente: cliente,
            conceptos: estado.conceptos,
            hallazgos: estado.hallazgos,
            operadorRecomendadoId: estado.operadorRecomendadoId ? Number(estado.operadorRecomendadoId) : null,
            consultor: { nombre: (usuario.nombre + " " + (usuario.apellidos || "")).trim(), email: usuario.email },
          },
          mercado
        );
        await conDatosDeGestor(usuario, function () { return M.descargarInformeTelecomPDF(resultado); });
        var documentoId = await subirFacturaSiHay(clienteCrm.id, document.getElementById("tel-archivo"), "Auditoría Telecom");
        var id = await D.guardarAuditoriaComparador({
          cliente_id: clienteCrm.id,
          sector: "telefonia",
          tipo_informe: "telecom_avanzada",
          codigo: resultado.codigo,
          referencia_factura: document.getElementById("tel-referencia").value.trim() || cliente.periodoFactura,
          documento_id: documentoId,
          datos_entrada: { tipoInforme: "telecom_avanzada", cliente: cliente, conceptos: estado.conceptos, hallazgos: estado.hallazgos, operadorRecomendadoId: estado.operadorRecomendadoId },
          resultado: Object.assign({ tipoInforme: "telecom_avanzada" }, resultado),
          coste_actual_anual: resultado.costeActualAnual,
          coste_propuesto_anual: resultado.recomendado ? resultado.recomendado.costeAnual : null,
          ahorro_anual: resultado.ahorroAnual,
          ahorro_porcentaje: resultado.ahorroPorcentaje,
        });
        U.toast("Informe generado y guardado en la ficha de " + clienteCrm.razon_social, "success");
        location.hash = "#/comparador/auditoria/" + id;
      } catch (err) {
        console.error(err);
        U.toast(err.message || "No se ha podido generar el informe", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ------------------------------------------- Ficha del cliente (integracion)
  function listaAuditoriasCliente(auditorias) {
    if (!auditorias || !auditorias.length) {
      return '<p class="icc-empty">Aún no se ha hecho ninguna auditoría para este cliente.</p>';
    }
    return (
      '<ul class="icc-doc-list">' +
      auditorias.map(function (a) {
        return (
          "<li><span>💡 " + esc(etiquetaAuditoria(a)) +
          (a.ahorro_anual != null ? " · Ahorro " + eur(a.ahorro_anual) + "/año" + (a.ahorro_porcentaje != null ? " (" + pct(a.ahorro_porcentaje) + ")" : "") : "") +
          (a.referencia_factura ? " · " + esc(a.referencia_factura) : "") +
          '</span><span class="icc-muted">' + U.formatFechaHora(a.created_at) + (a.gestor_nombre ? " · " + esc(a.gestor_nombre) : "") + "</span>" +
          '<a class="icc-link-btn" href="#/comparador/auditoria/' + a.id + '">Ver / PDF</a></li>'
        );
      }).join("") +
      "</ul>"
    );
  }

  function modalNuevaAuditoriaCliente(cliente) {
    U.openModal(
      "<h2>Nueva auditoría</h2>" +
      '<p class="icc-muted">¿Qué factura de ' + esc(cliente.razon_social) + " vas a auditar?</p>" +
      '<div class="icc-form">' +
      SECTORES.map(function (s) {
        return '<a class="icc-btn icc-btn-secondary" style="display:block;text-align:left" href="#/comparador/nueva?cliente=' + cliente.id + "&sector=" + s.clave + '" data-cerrar-modal>' + s.icono + " " + esc(etiquetaSector(s.clave)) + "</a>";
      }).join("") +
      '<a class="icc-btn icc-btn-secondary" style="display:block;text-align:left" href="#/comparador/telecom?cliente=' + cliente.id + '" data-cerrar-modal>📑 Auditoría de Telecomunicaciones (informe avanzado)</a>' +
      '<div class="icc-modal-actions"><button type="button" class="icc-btn icc-btn-ghost" data-close-btn>Cancelar</button></div></div>'
    );
    document.querySelectorAll("[data-cerrar-modal]").forEach(function (a) {
      a.addEventListener("click", function () { U.closeModal(); });
    });
  }

  return {
    viewPanel: viewPanel,
    viewNueva: viewNueva,
    viewTelecom: viewTelecom,
    viewDetalle: viewDetalle,
    listaAuditoriasCliente: listaAuditoriasCliente,
    modalNuevaAuditoriaCliente: modalNuevaAuditoriaCliente,
  };
})();
