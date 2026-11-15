/* =============================================================================
   ICC CRM · Agente de mantenimiento del pipeline: tarjeta en la parte de arriba
   del Pipeline (dirección y jefes de equipo). Siempre ocupa la misma altura
   para que el tablero no salte al cargar. API: api/saneo.php
   ============================================================================= */
(function () {
  var U = window.icc.util;
  var API = window.icc.api;
  var esc = function (v) { return U.escapeHtml(v == null ? "" : String(v)); };
  var FASES = { lead_captado: "Lead", estudio_backoffice: "Auditoría", oferta_presentada: "Propuesta", en_cierre: "Negociación" };
  var S = { d: null, verAjustes: false, verRevisar: false };

  function caja() { return document.getElementById("sn-tarjeta"); }
  function fecha(f) { return new Date(String(f).replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

  async function tarjeta() {
    var c = caja();
    if (!c) return;
    try { S.d = await API.get("api/saneo.php?action=estado"); } catch (e) { c.innerHTML = ""; c.hidden = true; return; }
    pintar();
  }

  function pintar() {
    var c = caja(), d = S.d, n = d.contadores;
    if (!c) return;
    var ultima = d.pasadas[0];
    var k = function (v, t, cls) { return '<div class="icc-sn-kpi' + (v ? " is-" + cls : "") + '"><b>' + v + "</b><small>" + t + "</small></div>"; };
    var html = '<div class="icc-sn"><div class="icc-sn-cab"><div><strong>🛠️ Agente de mantenimiento</strong><small>' +
      (d.config.auto ? "Revisa el pipeline cada hora" : "Automático apagado") + (ultima ? " · última pasada " + esc(fecha(ultima.ts)) + " (" + ultima.cambios + " cambios" + (Number(ultima.deshechos) ? ", deshecha" : "") + ")" : "") + "</small></div>" +
      '<div class="icc-sn-acc"><button class="icc-btn icc-btn-primary icc-mo-mini" id="sn-arreglar">⚡ Arreglar ahora</button>' +
      (ultima && Number(ultima.deshechos) < Number(ultima.cambios) ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" id="sn-deshacer" data-lote="' + esc(ultima.lote) + '">↶ Deshacer la última pasada</button>' : "") +
      (d.es_config ? '<button class="icc-btn icc-btn-ghost icc-mo-mini" id="sn-ajustes" aria-expanded="' + S.verAjustes + '">⚙️</button>' : "") + "</div></div>" +
      '<div class="icc-sn-kpis">' + k(n.proximo, "Sin próxima acción", "aviso") + k(n.valor, "Sin valor", "aviso") + k(n.gestor, "Sin gestor", "mal") + k(n.sla, "SLA vencido", "mal") +
      '<button type="button" class="icc-sn-kpi icc-sn-kpi--btn' + (n.muerto ? " is-mal" : "") + '" id="sn-ver-revisar"' + (n.muerto ? "" : " disabled") + "><b>" + n.muerto + "</b><small>Para revisar</small></button></div>";
    if (S.verRevisar && d.candidatos.length) {
      html += '<ul class="icc-sn-revisar">' + d.candidatos.map(function (x) {
        return '<li data-c="' + x.id + '"><div><a href="#/clientes/' + x.id + '"><strong>' + esc(x.razon_social) + "</strong></a><small>" + (FASES[x.fase] || x.fase) + " · " + x.dias_fase + " días en fase · " + x.inactivo + " sin actividad · " + x.reprogramaciones + " reprogramaciones</small></div>" +
          '<input class="icc-input" placeholder="Motivo para perdido" aria-label="Motivo"><button class="icc-btn icc-btn-ghost icc-mo-mini" data-dec="perdido">Perdido</button><button class="icc-btn icc-btn-secondary icc-mo-mini" data-dec="mantener">Mantener</button></li>';
      }).join("") + "</ul>";
    }
    if (S.verAjustes && d.es_config) {
      var cf = d.config;
      var ch = function (id, v, t) { return '<label><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + "> " + t + "</label>"; };
      html += '<form class="icc-sn-cfg" id="sn-cfg">' + ch("sn-auto", cf.auto, "Automático cada hora") + ch("sn-a-proximo", cf.arreglar.proximo, "Próximo paso") + ch("sn-a-valor", cf.arreglar.valor, "Valor") +
        ch("sn-a-gestor", cf.arreglar.gestor, "Gestor") + ch("sn-a-rescate", cf.arreglar.rescate, "Rescate SLA") + ch("sn-llamadas", cf.crear_llamadas, "Crear también la llamada") + ch("sn-perdidos", cf.proponer_perdidos, "Proponer perdidos") +
        '<label>Máx. por gestor y día <input class="icc-input" type="number" id="sn-max" min="1" max="60" value="' + cf.max_dia + '"></label>' +
        '<label>Días para darlo por muerto <input class="icc-input" type="number" id="sn-dias" min="7" value="' + cf.dias_muerto + '"></label>' +
        '<label>Valor de entrada (€) <input class="icc-input" type="number" id="sn-entrada" min="0" value="' + cf.valor_entrada + '"></label>' +
        '<button class="icc-btn icc-btn-primary icc-mo-mini" type="submit">Guardar</button></form>';
    }
    c.innerHTML = html + "</div>";
    enlazar();
  }

  function enlazar() {
    var c = caja();
    var hacer = async function (btn, fn) { btn.disabled = true; try { await fn(); } catch (e) { U.toast(e.message, "error"); } btn.disabled = false; };
    var recargarTodo = async function () { if (window.icc.pipeline && window.icc.pipeline.view) await window.icc.pipeline.view(); else await tarjeta(); };
    document.getElementById("sn-arreglar").addEventListener("click", function (ev) {
      hacer(ev.currentTarget, async function () { var r = await API.post("api/saneo.php?action=ejecutar", {}); U.toast(r.texto, "success"); await recargarTodo(); });
    });
    var des = document.getElementById("sn-deshacer");
    if (des) des.addEventListener("click", function () {
      if (!confirm("¿Deshacer la última pasada? Solo se deshace lo que nadie ha tocado después.")) return;
      hacer(des, async function () { var r = await API.post("api/saneo.php?action=deshacer", { lote: des.dataset.lote }); U.toast("✓ " + r.deshechos + " cambios deshechos" + (r.saltados ? " · " + r.saltados + " ya los había cambiado una persona" : ""), "success"); await recargarTodo(); });
    });
    var aj = document.getElementById("sn-ajustes");
    if (aj) aj.addEventListener("click", function () { S.verAjustes = !S.verAjustes; pintar(); });
    var rv = document.getElementById("sn-ver-revisar");
    if (rv) rv.addEventListener("click", function () { S.verRevisar = !S.verRevisar; pintar(); });
    c.querySelectorAll("[data-dec]").forEach(function (b) {
      b.addEventListener("click", function () {
        var li = b.closest("[data-c]");
        hacer(b, async function () { await API.post("api/saneo.php?action=candidato", { cliente_id: Number(li.dataset.c), decision: b.dataset.dec, motivo: li.querySelector("input").value }); U.toast("✓ Decidido", "success"); await recargarTodo(); });
      });
    });
    var f = document.getElementById("sn-cfg");
    if (f) f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = function (id) { return document.getElementById(id); };
      hacer(ev.submitter, async function () {
        await API.put("api/saneo.php?action=config", { auto: v("sn-auto").checked, arreglar: { proximo: v("sn-a-proximo").checked, valor: v("sn-a-valor").checked, gestor: v("sn-a-gestor").checked, rescate: v("sn-a-rescate").checked },
          crear_llamadas: v("sn-llamadas").checked, proponer_perdidos: v("sn-perdidos").checked, max_dia: Number(v("sn-max").value), dias_muerto: Number(v("sn-dias").value), valor_entrada: Number(v("sn-entrada").value) });
        U.toast("✓ Ajustes guardados", "success");
        S.verAjustes = false;
        await tarjeta();
      });
    });
  }

  window.icc.saneo = { tarjeta: tarjeta };
})();
