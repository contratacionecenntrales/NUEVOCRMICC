/* Comparador de energía · Integral Connection Consulting
   Asistente: Factura (5 pasos) → Comparativa → Exportar (PDF de 3 páginas A4).
   Integrado en el CRM: usa la sesion, los usuarios y la jerarquia del CRM a
   traves de api/cmp_energia.php, cmp_energia_factura.php, cmp_energia_sips.php
   y cmp_sesion.php. */
(function(){
"use strict";

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const num = v => { const n = parseFloat(String(v ?? "").replace(/\s/g,"").replace(",", ".")); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
function eur(n, dec = 2){
  const neg = n < 0; n = Math.abs(r2(n));
  let [i, d] = n.toFixed(dec).split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "−" : "") + i + (dec ? "," + d : "") + " €";
}
const dec = (n, d = 4) => Number(n || 0).toFixed(d).replace(".", ",");
const miles = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso){ const d = new Date(iso + "T12:00:00"); if (isNaN(d)) return iso || ""; return d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear(); }
function fechaCortaISO(iso){ const d = new Date(iso + "T12:00:00"); if (isNaN(d)) return ""; return d.getDate() + " " + MESES[d.getMonth()].slice(0,3) + " " + d.getFullYear(); }
function hoyISO(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
const clone = o => JSON.parse(JSON.stringify(o));
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,80) || "x";
function listaY(arr){ return arr.length <= 1 ? (arr[0] || "") : arr.slice(0,-1).join(", ") + " y " + arr[arr.length-1]; }
const icon = (id, w) => `<svg aria-hidden="true"${w ? ` width="${w}" height="${w}"` : ""}><use href="#${id}"/></svg>`;

/* ================= normativa (octubre 2026) ================= */
const IEE = 0.0511269632;          // impuesto especial sobre la electricidad
const IEH_GAS = 0.00234;           // impuesto de hidrocarburos gas natural, €/kWh
const PEAJES = {
  luz: {"2.0TD":{pot:2,en:3}, "3.0TD":{pot:6,en:6}, "6.1TD":{pot:6,en:6}, "6.2TD":{pot:6,en:6}},
  gas: {"RL.1":{pot:0,en:1}, "RL.2":{pot:0,en:1}, "RL.3":{pot:0,en:1}, "RL.4":{pot:0,en:1}}
};
const ZONAS = {peninsula:"Península y Baleares", canarias:"Canarias", ceuta_melilla:"Ceuta y Melilla"};
const COMERCIALES = ["admin","jefe_equipo"];

/* ================= estado ================= */
const CONSULTORA_DEF = {nombre:"", cargo:"Consultor/a de optimización de costes energéticos", email:""};
function nuevoEstado(){
  return {
    v:1, id:null, etapa:"factura", paso:1,
    tipo:"luz", metodo:"", estudio:"",
    cliente:{nombre:"", cif:"", direccion:"", compania:"", tarifaActual:"", tipoCliente:"pyme", cups:"", peaje:"2.0TD", zona:"peninsula", inicio:"", fin:"", dias:""},
    sipsOk:false, sipsKwhAnual:0,
    p:{kw:["","","","","",""], pp:["","","","","",""], kwh:["","","","","",""], pe:["","","","","",""]},
    tfd:"", total:"", reactiva:"", excesos:"", ssaa:"", alquiler:"", autoconsumo:false, excedentes:"", compensacion:"",
    obsIA:"",
    comp:{incluirSsaa:true, estrella:null, fuera:[], orden:"ahorro", propiasPdf:[]},
    textos:{ventajas:null, motivo:"", extra:""},
    presupuesto:{numero:"", fecha:hoyISO(), validez:30},
    consultora:clone(cfg.consultora || CONSULTORA_DEF),
    snap:null
  };
}
let cfg = {prefijo:"ICC-09-", siguiente:2838365, ia:false, sips:false, consultora:clone(CONSULTORA_DEF)};
let usuario = null;
let catalogo = [];          // tarifas del servidor
let informes = [];
let state;
let catSel = null;          // tarifa en edición en el catálogo
let catFiltro = {tipo:"luz", peaje:"2.0TD", rol:"", ver:"activas"};
const LS = "icc-energia-borrador";

/* ================= cálculo ================= */
function periodos(s){
  const t = PEAJES[s.tipo] || PEAJES.luz;
  return t[s.cliente.peaje] || (s.tipo === "gas" ? {pot:0,en:1} : {pot:2,en:3});
}
function dias(s){
  if (s.estudio === "anual") return 365;
  return Math.max(0, Math.round(num(s.cliente.dias)));
}
function factorAnual(s){ const d = dias(s); return s.estudio === "anual" ? 1 : (d ? 365 / d : 0); }
function kwhPeriodo(s){ const {en} = periodos(s); let t = 0; for (let i = 0; i < en; i++) t += num(s.p.kwh[i]); return t; }
function maxKw(s){ const {pot} = periodos(s); let m = 0; for (let i = 0; i < pot; i++) m = Math.max(m, num(s.p.kw[i])); return m; }
function tipoImpuesto(s){
  const z = s.cliente.zona;
  if (z === "ceuta_melilla") return {tasa:0.01, nombre:"IPSI (1 %)"};
  if (z === "canarias"){
    if (s.tipo === "luz" && s.cliente.tipoCliente === "residencial" && maxKw(s) <= 10) return {tasa:0, nombre:"IGIC (0 %)"};
    return {tasa:0.03, nombre:"IGIC (3 %)"};
  }
  return {tasa:0.21, nombre:"IVA (21 %)"};
}
/* Coste de un periodo de facturación con unos precios dados (sin impuestos en los precios). */
function costePeriodo(s, pr){
  const D = dias(s), {pot, en} = periodos(s), imp = tipoImpuesto(s);
  const kwh = kwhPeriodo(s);
  const alq = num(s.alquiler), react = num(s.reactiva), exc = num(s.excesos);
  if (s.tipo === "gas"){
    const fijo = num(pr.tfd) * D;
    const energia = num(s.p.kwh[0]) * num(pr.pe[0]);
    const ssaa = pr.ssaaEur != null ? pr.ssaaEur : 0;
    const ieh = num(s.p.kwh[0]) * IEH_GAS;
    const sub = fijo + energia + ssaa + ieh + alq;
    const iva = sub * imp.tasa;
    return {potencia:fijo, energia, ssaa, compens:0, pass:0, iee:ieh, alq, iva, total:sub + iva};
  }
  let energia = 0, potencia = 0;
  for (let i = 0; i < en; i++) energia += num(s.p.kwh[i]) * num(pr.pe[i]);
  for (let i = 0; i < pot; i++) potencia += num(s.p.kw[i]) * num(pr.pp[i]) * D;
  const ssaa = pr.ssaaEur != null ? pr.ssaaEur : kwh * num(pr.ssaaKwh);
  const compens = s.autoconsumo ? Math.min(num(s.excedentes) * num(pr.comp), energia) : 0;
  const pass = react + exc;
  const base = energia + potencia + ssaa - compens + pass;
  const iee = Math.max(base * IEE, kwh * (s.cliente.tipoCliente === "residencial" ? 0.0005 : 0.001));
  const sub = base + iee + alq;
  const iva = sub * imp.tasa;
  return {potencia, energia, ssaa, compens, pass, iee, alq, iva, total:sub + iva};
}
function preciosActuales(s){
  return {pp:s.p.pp, pe:s.p.pe, tfd:s.tfd, ssaaEur:num(s.ssaa), comp:num(s.compensacion)};
}
function preciosTarifa(s, t){
  return {pp:[t.pp1,t.pp2,t.pp3,t.pp4,t.pp5,t.pp6], pe:[t.pe1,t.pe2,t.pe3,t.pe4,t.pe5,t.pe6], tfd:t.termino_fijo_dia,
          ssaaKwh: s.comp.incluirSsaa ? t.ssaa_kwh : 0, comp:t.compensacion_kwh};
}
function precioMedio(s, pe){
  const {en} = periodos(s); const k = kwhPeriodo(s); if (!k) return 0;
  let t = 0; for (let i = 0; i < en; i++) t += num(s.p.kwh[i]) * num(pe[i]); return t / k;
}
/* Comisión por tramos de consumo anual: "5000:40; 15000:80; *:120" o un importe fijo "45". */
function comisionDe(t, kwhAnual){
  const txt = String(t.comision_tramos || "").trim();
  if (!txt) return null;
  if (/^\d+([.,]\d+)?$/.test(txt)) return num(txt);
  const tramos = txt.split(/[;\n|]+/).map(x => x.trim()).filter(Boolean).map(x => {
    const [h, v] = x.split(":"); return {hasta: /^\*|resto|mas|más/i.test((h||"").trim()) ? Infinity : num(h), imp: num(v)};
  }).filter(x => x.hasta > 0).sort((a,b) => a.hasta - b.hasta);
  for (const tr of tramos) if (kwhAnual <= tr.hasta) return tr.imp;
  return tramos.length ? tramos[tramos.length - 1].imp : null;
}

/* Tarifas aplicables: catálogo + precios congelados del informe abierto. */
function tarifasEfectivas(){
  const map = new Map(catalogo.map(t => [t.id, t]));
  if (state.snap) Object.values(state.snap).forEach(t => map.set(t.id, Object.assign({}, map.get(t.id) || {}, t)));
  return [...map.values()];
}
function aplicables(s, rol){
  return tarifasEfectivas().filter(t => (t.activo !== false || (state.snap && state.snap[t.id])) && t.rol === rol && t.tipo === s.tipo && t.peaje === s.cliente.peaje &&
    (t.cliente === "todos" || t.cliente === s.cliente.tipoCliente));
}

function resultados(s){
  const D = dias(s), F = factorAnual(s);
  const calcAct = costePeriodo(s, preciosActuales(s));
  const usaTotal = s.estudio === "mensual" && num(s.total) > 0;
  const actualPer = usaTotal ? num(s.total) : calcAct.total;
  const actualAnual = actualPer * F;
  const kwhAnual = (s.estudio === "mensual" && s.sipsKwhAnual) ? s.sipsKwhAnual : kwhPeriodo(s) * F;
  const evalua = t => {
    const c = costePeriodo(s, preciosTarifa(s, t));
    const anual = c.total * F;
    return {t, id:t.id, nombre:t.comercializadora, tarifa:t.nombre, rol:t.rol, per:c, anual, ahorro:actualAnual - anual,
            avg:precioMedio(s, preciosTarifa(s, t).pe), com:comisionDe(t, kwhAnual)};
  };
  const propias = aplicables(s, "propia").map(evalua);
  const mercado = aplicables(s, "mercado").map(evalua);
  let star = propias.find(o => o.id === s.comp.estrella);
  if (!star && propias.length){ star = propias.slice().sort((a,b) => b.ahorro - a.ahorro)[0]; }
  const fuera = new Set(s.comp.fuera || []);
  const enPdf = new Set(s.comp.propiasPdf || []);
  const pdfOps = [];
  if (star) pdfOps.push(star);
  propias.forEach(o => { if (o !== star && enPdf.has(o.id)) pdfOps.push(o); });
  mercado.forEach(o => { if (!fuera.has(o.id)) pdfOps.push(o); });
  // Desglose de la factura actual en el periodo
  const det = {potencia:calcAct.potencia, energia:calcAct.energia, ssaa:num(s.ssaa), pass:calcAct.pass, react:num(s.reactiva), exc:num(s.excesos), alq:calcAct.alq};
  det.otros = actualPer - (det.potencia + det.energia + det.ssaa + det.react + det.exc + det.alq);
  return {D, F, actualPer, actualAnual, calcAct, usaTotal, kwhAnual, propias, mercado, star, pdfOps, det,
          curAvg:precioMedio(s, s.p.pe), ahorro: star ? actualAnual - star.anual : 0};
}

/* ================= validación ================= */
function faltan(s){
  const m = [], {pot, en} = periodos(s);
  if (!String(s.cliente.nombre).trim()) m.push("nombre del cliente");
  if (s.estudio === "mensual" && !dias(s)) m.push("días de la factura (o fechas del periodo)");
  if (s.tipo === "luz"){
    for (let i = 0; i < pot; i++){ if (num(s.p.kw[i]) <= 0) m.push("potencia P" + (i+1)); if (num(s.p.pp[i]) <= 0) m.push("precio de potencia P" + (i+1)); }
  } else if (num(s.tfd) < 0) m.push("término fijo");
  if (kwhPeriodo(s) <= 0) m.push(s.estudio === "anual" ? "consumo anual (SIPS)" : "consumo de la factura");
  for (let i = 0; i < en; i++) if (num(s.p.kwh[i]) > 0 && num(s.p.pe[i]) <= 0) m.push("precio de energía P" + (i+1));
  if (s.estudio === "mensual" && num(s.total) <= 0) m.push("total de la factura");
  return m;
}

/* ================= API ================= */
let csrf = "";
/* Rutas de la API del CRM (la pagina vive en comparador/energia/). */
const API_BASE = "../../api/";
const CRM_URL = "../../index.html";
function rutaCrm(ruta){
  if (ruta.indexOf("auth.php?action=me") === 0) return "cmp_sesion.php" + (crmClienteId ? "?cliente=" + encodeURIComponent(crmClienteId) : "");
  return ruta.replace(/^energia\.php/, "cmp_energia.php").replace(/^energia_factura\.php/, "cmp_energia_factura.php").replace(/^energia_sips\.php/, "cmp_energia_sips.php");
}
const PARAMS = new URLSearchParams(location.search);
let crmClienteId = /^\d+$/.test(PARAMS.get("cliente") || "") ? PARAMS.get("cliente") : null;
let crmCliente = null;
async function api(ruta, opts = {}, reintento){
  const o = Object.assign({credentials:"same-origin"}, opts);
  const h = Object.assign({}, opts.headers || {});
  if (!(o.body instanceof FormData)) h["Content-Type"] = "application/json";
  if (csrf) h["X-CSRF-Token"] = csrf;
  o.headers = h;
  let res;
  try { res = await fetch(API_BASE + rutaCrm(ruta), o); }
  catch(e){ const err = new Error("Sin conexión con el servidor. Revisa internet y vuelve a probar."); err.status = 0; throw err; }
  let data = null; try { data = await res.json(); } catch(e){}
  if (data && typeof data.csrf === "string") csrf = data.csrf;
  if ((res.status === 419 || (res.status === 403 && data && data.csrf === true)) && !reintento){
    const me = await api("auth.php?action=me", {}, true);
    if (!me || !me.user){ const e = new Error("Tu sesión ha caducado. Vuelve a entrar."); e.status = 401; throw e; }
    return api(ruta, opts, true);
  }
  if (res.status === 401 && usuario){ usuario = null; mostrarLogin(); }
  if (!res.ok){ const err = new Error((data && data.error) || ("Error " + res.status)); err.status = res.status; throw err; }
  return data;
}
let toastT;
function toast(msg, ms){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms || 3600); }

/* ================= navegación ================= */
const PASOS = {1:"Suministro", 2:"Datos", 3:"Tipo de estudio", 4:"Lectura", 5:"Revisión"};
function puedeComparar(){ return state.paso === 5 && !faltan(state).length; }
function irA(etapa){
  if ((etapa === "comparativa" || etapa === "exportar") && !puedeComparar()){
    if (state.paso === 5) toast("Completa los datos obligatorios marcados en rojo."); return;
  }
  if (etapa === "exportar" && !resultados(state).star){ toast("Elige una tarifa propuesta en la comparativa."); return; }
  state.etapa = etapa; guardarBorrador(); pintar(); window.scrollTo({top:0});
}
function pintarStepper(){
  const e = state.etapa, ok = puedeComparar(), hayStar = ok && !!resultados(state).star;
  const items = [["factura","Factura",true],["comparativa","Comparativa",ok],["exportar","Exportar",hayStar]];
  const orden = {factura:0, comparativa:1, exportar:2};
  $("#stepper").innerHTML = items.map(([k,l,en],i) => `<button type="button" data-etapa="${k}" ${e===k?'aria-current="step"':""} class="${orden[e] > i ? "done" : ""}" ${en ? "" : "disabled"}><span class="sn">${i+1}</span>${l}</button>`).join("");
  $("#stepper").hidden = (e === "catalogo" || e === "informes" || e === "seguridad");
}
function pintar(){
  pintarStepper(); medirTopbar();
  const e = state.etapa;
  if (e === "comparativa") pintarComparativa();
  else if (e === "exportar") pintarExportar();
  else if (e === "catalogo") pintarCatalogo();
  else if (e === "informes") pintarInformes();
  else if (e === "seguridad") pintarSeguridad();
  else pintarFactura();
}

/* ================= etapa 1: factura (asistente de 5 pasos) ================= */
function cabeceraPaso(){
  const p = state.paso;
  const nombre = p === 4 ? (state.metodo === "cups" ? "Consulta SIPS" : "Lectura de factura") : PASOS[p];
  return `<div class="wz-top"><div class="prog"><i style="width:${p*20}%"></i></div>
    <div class="wz-step">${p > 1 ? '<button type="button" class="back" data-back aria-label="Paso anterior">←</button>' : ""}Paso ${p} de 5 — ${nombre}</div></div>`;
}
function choice(attr, val, ic, titulo, txt, sel, extra){
  return `<button type="button" class="choice${sel ? " sel" : ""}" ${attr}="${val}">${icon(ic)}<span class="ct"><b>${titulo}</b><span>${txt}</span>${extra || ""}</span></button>`;
}
function pintarFactura(){
  const s = state, p = s.paso;
  let html = "";
  if (p === 1){
    html = `<section class="qcard"><h2>¿Qué tipo de suministro?</h2><p>Calcularemos las ofertas de precio fijo e indexado del catálogo automáticamente.</p>
      <div class="choices">${choice("data-tipo","luz","i-bolt","Luz","Electricidad · 2.0TD, 3.0TD y 6.1TD", s.tipo==="luz" && s.metodo)}${choice("data-tipo","gas","i-flame","Gas","Gas natural · RL.1 a RL.4", s.tipo==="gas" && s.metodo)}</div></section>`;
  } else if (p === 2){
    html = `<section class="qcard"><h2>¿Cómo quieres introducir los datos?</h2><p>Sube una factura para extraer los datos automáticamente, consulta el CUPS o introdúcelos a mano.</p>
      <div class="choices list">
        ${choice("data-metodo","factura","i-up","Subir factura del cliente","Extraemos automáticamente todos los datos con IA", s.metodo==="factura", cfg.ia ? "" : '<em class="off">IA sin activar</em>')}
        ${choice("data-metodo","cups","i-search","Introducir CUPS","Consultamos tarifa, potencias y consumo automáticamente en el SIPS", s.metodo==="cups", cfg.sips ? "" : '<em class="off">SIPS sin conectar</em>')}
        ${choice("data-metodo","manual","i-pen","Introducir datos manualmente","Completa la tarifa, potencias y consumos en el siguiente paso", s.metodo==="manual")}
      </div></section>`;
  } else if (p === 3){
    html = `<section class="qcard"><h2>¿Estudio mensual o anual?</h2><p>Elige cómo quieres calcular el ahorro para este cliente.</p>
      <div class="choices">
        ${choice("data-estudio","mensual","i-doc","Estudio mensual","Factura contra factura. El ahorro anual es esta factura extrapolada al año (365 días ÷ días de la factura). Si hay SIPS, solo se usa para elegir el tramo de comisión por consumo real.", s.estudio==="mensual")}
        ${choice("data-estudio","anual","i-cal","Estudio anual","Usa el consumo y la potencia reales del último año (SIPS). Hay que introducir a mano los precios actuales.", s.estudio==="anual")}
      </div></section>`;
  } else if (p === 4){
    html = s.metodo === "cups" ? pasoCups() : pasoSubida(true);
  } else {
    html = pasoRevision();
  }
  $("#stage").innerHTML = `<div class="stage"><div class="wz">${cabeceraPaso()}${html}</div></div>`;
  if (p === 5) refrescarRevision();
  const c = $("#cupsIn"); if (c && p === 4) c.focus();
}
function pasoSubida(grande){
  const nota = cfg.ia ? "" : `<div class="ia-note"><b>La lectura con IA no está activada en el servidor.</b> El administrador debe añadir la clave de Anthropic en <code>api/config.php</code>. Mientras, sigue con los datos a mano.</div>`;
  const titulo = state.estudio === "anual" ? "Paso 1 · Lectura de factura (opcional en estudio anual)" : "Paso 1 · Lectura de factura";
  const txt = state.estudio === "anual" ? "En estudio anual la potencia y el consumo se toman del SIPS. Subir la factura es opcional: sirve para rellenar cliente, CUPS y precios actuales más rápido."
                                         : "Sube la factura del periodo que vas a comparar. Revisa después cada dato: la IA puede equivocarse.";
  return `<section class="${grande ? "qcard" : "fcard"}">${grande ? `<h2>Sube la factura del cliente</h2><p>${txt}</p>` : `<div class="eb">${titulo}</div><h3>Sube la factura del cliente</h3><p>${txt}</p>`}
    ${nota}
    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Subir factura">${icon("i-up")}<b>Arrastra la factura aquí o haz clic para subir</b><span>PDF o imagen (JPG/PNG) · procesamiento con IA en el servidor</span></div>
    ${grande ? `<div class="okbar" style="margin-top:16px"><button type="button" class="btn light" data-paso="5">Seguir sin factura</button></div>` : ""}
  </section>`;
}
function pasoCups(){
  const s = state;
  return `<section class="qcard"><h2>Introduce el CUPS</h2><p>Consultamos en el SIPS la tarifa de acceso, las potencias contratadas y el consumo de los últimos 12 meses.</p>
    ${cfg.sips ? "" : `<div class="ia-note" style="margin-bottom:14px"><b>La consulta al SIPS aún no está conectada.</b> Podrás escribir potencia y consumo a mano en el siguiente paso.</div>`}
    <div class="withbtn"><input type="text" id="cupsIn" value="${esc(s.cliente.cups)}" placeholder="ES0031…" autocomplete="off" aria-label="CUPS" style="font-family:ui-monospace,monospace;font-size:15px;padding:11px 12px"><button type="button" class="btn orange big" id="btnSips">⇄ Consultar SIPS</button></div>
    <div class="okbar" style="margin-top:16px"><button type="button" class="btn light" data-paso="5">Seguir sin SIPS</button></div>
  </section>`;
}
function inp(path, val, o = {}){
  const id = "f-" + path.replace(/[.\[\]]/g, "-");
  const t = o.type || "text";
  const attrs = [`id="${id}"`, `data-path="${path}"`, `type="${t === "num" ? "text" : t}"`, `value="${esc(val)}"`];
  if (t === "num") attrs.push('inputmode="decimal"', 'autocomplete="off"');
  if (o.req) attrs.push('data-req="1"');
  if (o.ro) attrs.push("readonly");
  if (o.dis) attrs.push("disabled");
  if (o.ph) attrs.push(`placeholder="${esc(o.ph)}"`);
  if (o.aria) attrs.push(`aria-label="${esc(o.aria)}"`);
  return `<input ${attrs.join(" ")}>`;
}
function campo(label, path, val, o = {}){
  return `<label class="f up" for="f-${path.replace(/[.\[\]]/g, "-")}">${label}${inp(path, val, o)}${o.hint ? `<span class="hint2">${o.hint}</span>` : ""}</label>`;
}
function sel(label, path, val, opciones, hint){
  const id = "f-" + path.replace(/\./g, "-");
  return `<label class="f up" for="${id}">${label}<select id="${id}" data-path="${path}" data-struct="1">${opciones.map(([v,t]) => `<option value="${esc(v)}" ${v===val?"selected":""}>${esc(t)}</option>`).join("")}</select>${hint ? `<span class="hint2">${hint}</span>` : ""}</label>`;
}
function pasoRevision(){
  const s = state, c = s.cliente, anual = s.estudio === "anual", gas = s.tipo === "gas";
  const {pot, en} = periodos(s);
  const bloq = anual && s.sipsOk;
  const peajes = Object.keys(PEAJES[s.tipo]).map(k => [k,k]);
  const imp = tipoImpuesto(s);
  let tabla;
  if (gas){
    tabla = `<div class="g3">
      ${campo("Consumo (kWh)", "p.kwh.0", s.p.kwh[0], {type:"num", req:true, ro:bloq})}
      ${campo("Precio energía (€/kWh)", "p.pe.0", s.p.pe[0], {type:"num", req:true})}
      ${campo("Término fijo (€/día)", "tfd", s.tfd, {type:"num"})}
    </div>`;
  } else {
    tabla = `<div class="ptable-w"><table class="ptable rtable"><thead><tr><th>Periodo</th><th>Potencia (kW)</th><th>Precio potencia (€/kW·día)</th><th>Consumo (kWh)</th><th>Precio energía (€/kWh)</th></tr></thead><tbody>
      ${[0,1,2,3,4,5].map(i => `<tr class="${i >= Math.max(pot,en) ? "off" : ""}"><td>P${i+1}</td>
        <td data-l="Potencia (kW)">${inp(`p.kw.${i}`, s.p.kw[i], {type:"num", req:i<pot, ro:bloq, dis:i>=pot, aria:`Potencia P${i+1}`})}</td>
        <td data-l="Precio potencia (€/kW·día)">${inp(`p.pp.${i}`, s.p.pp[i], {type:"num", req:i<pot, dis:i>=pot, aria:`Precio potencia P${i+1}`})}</td>
        <td data-l="Consumo (kWh)">${inp(`p.kwh.${i}`, s.p.kwh[i], {type:"num", ro:bloq, dis:i>=en, aria:`Consumo P${i+1}`})}</td>
        <td data-l="Precio energía (€/kWh)">${inp(`p.pe.${i}`, s.p.pe[i], {type:"num", req:i<en, dis:i>=en, aria:`Precio energía P${i+1}`})}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  return `
  ${pasoSubida(false)}
  <section class="fcard">
    <div class="eb">Datos generales</div><h3>Cliente y suministro</h3>
    <div class="g3">
      ${campo("Nombre / razón social", "cliente.nombre", c.nombre, {req:true, type:"text", ph:"Cliente S.L."})}
      ${campo("Compañía actual", "cliente.compania", c.compania, {ph:"Endesa, Iberdrola…"})}
      ${sel("Tipo de cliente", "cliente.tipoCliente", c.tipoCliente, [["pyme","Pymes y autónomos"],["residencial","Residencial"]], "Solo se compararán tarifas marcadas para este tipo.")}
      ${campo("Tarifa actual (nombre)", "cliente.tarifaActual", c.tarifaActual, {ph:"Plan Estable, One Luz…"})}
      <label class="f up" for="f-cliente-cups">CUPS<span class="withbtn">${inp("cliente.cups", c.cups, {ph:"ES0031…"})}<button type="button" class="btn orange" id="btnSips2">⇄ SIPS</button></span></label>
      ${sel("Tarifa de acceso", "cliente.peaje", c.peaje, peajes)}
      ${sel("Zona del suministro", "cliente.zona", c.zona, Object.entries(ZONAS), `Impuestos aplicados: ${imp.nombre}${gas ? " + impuesto de hidrocarburos." : " + impuesto eléctrico."}`)}
      ${anual ? campo("Días (estudio anual, fijo)", "x.dias", "365", {ro:true, hint:"Fijo en 365: se usa el consumo y la potencia reales del año (SIPS)."})
              : campo("Días de la factura", "cliente.dias", c.dias, {type:"num", req:true, hint:"Se calcula con las fechas del periodo; puedes corregirlo."})}
      ${campo(anual ? "Consumo anual total (kWh)" : "Consumo de la factura (kWh)", "x.kwh", miles(kwhPeriodo(s)), {ro:true})}
      ${campo("Inicio periodo facturación", "cliente.inicio", c.inicio, {type:"date"})}
      ${campo("Fin periodo facturación", "cliente.fin", c.fin, {type:"date"})}
      ${campo("CIF / NIF (opcional)", "cliente.cif", c.cif)}
    </div>
  </section>
  <section class="fcard">
    <div class="eb">${gas ? "Consumo" : "Potencia y consumo"}</div><h3>Datos por periodo (${esc(c.peaje)})</h3>
    <p class="${bloq ? "req" : ""}">${bloq ? "Potencia y consumo bloqueados (vienen del SIPS). Rellena en rojo los precios de energía y potencia: son obligatorios para continuar."
       : anual ? "Introduce la potencia contratada y el consumo de los últimos 12 meses por periodo, y los precios actuales sin impuestos."
       : "Copia de la factura la potencia, el consumo de cada periodo y sus precios sin impuestos. Los campos en rojo son obligatorios."}</p>
    ${tabla}
    <div class="g4">
      ${campo(anual ? "Total factura aportada (€, opcional)" : "Total factura (€)", "total", s.total, {type:"num", req:!anual, hint: anual ? "Solo informativo en estudio anual." : "Importe total con impuestos: es lo que paga hoy."})}
      ${gas ? "" : campo("Energía reactiva (€)", "reactiva", s.reactiva, {type:"num"})}
      ${gas ? "" : campo("Excesos de potencia (€)", "excesos", s.excesos, {type:"num"})}
      ${campo("Alquiler de contador (€)", "alquiler", s.alquiler, {type:"num", hint:"Del periodo de la factura."})}
      ${campo("SSAA / coste de red eléctrica en esta factura (€)", "ssaa", s.ssaa, {type:"num"})}
    </div>
    <p class="note">${gas ? "" : "Si la factura cobra energía reactiva o excesos de potencia, se trasladan tal cual a la propuesta: dependen de la instalación del cliente, no de la comercializadora. "}El SSAA es informativo para que salga desglosado en el PDF igual que en la factura: no se traslada a la propuesta (cada tarifa del catálogo tiene su propio SSAA, que se activa con el interruptor de la comparativa).</p>
    ${gas ? "" : `<label class="tog" for="f-autoconsumo"><input type="checkbox" id="f-autoconsumo" data-path="autoconsumo" data-struct="1" ${s.autoconsumo ? "checked" : ""}> Tiene autoconsumo con excedentes</label>
    ${s.autoconsumo ? `<div class="g4">${campo("Excedentes vertidos (kWh)", "excedentes", s.excedentes, {type:"num"})}${campo("Compensación actual (€/kWh)", "compensacion", s.compensacion, {type:"num"})}</div>` : ""}`}
    ${s.obsIA ? `<div class="ia-note"><b>Nota de la lectura:</b> ${esc(s.obsIA)}</div>` : ""}
    <div id="missBox"></div>
    <div class="okbar"><span class="note" id="cuadre"></span><button type="button" class="btn gold big" id="btnComparar">Ver comparativa →</button></div>
  </section>`;
}
function refrescarRevision(){
  const s = state, m = faltan(s);
  document.querySelectorAll("#stage input[data-req]").forEach(el => {
    const vacio = el.type === "text" && el.inputMode !== "decimal" ? !el.value.trim() : num(el.value) <= 0;
    el.classList.toggle("need", vacio && !el.disabled);
  });
  const box = $("#missBox");
  if (box) box.innerHTML = m.length ? `<div class="miss" role="alert">⚠ Faltan datos obligatorios${s.estudio === "anual" && !s.sipsOk && s.metodo === "cups" ? " para el estudio anual (consulta primero el SIPS o escríbelos a mano)" : ""}: ${esc(listaY(m.slice(0,6)))}${m.length > 6 ? "…" : "."}</div>` : "";
  const k = $("#f-x-kwh"); if (k) k.value = miles(kwhPeriodo(s));
  const b = $("#btnComparar"); if (b) b.disabled = !!m.length;
  const cu = $("#cuadre");
  if (cu){
    if (!m.length && s.estudio === "mensual"){
      const R = resultados(s), dif = R.calcAct.total - num(s.total);
      cu.innerHTML = Math.abs(dif) > Math.max(2, num(s.total) * 0.03)
        ? `Con estos precios la factura saldría a <b>${eur(R.calcAct.total)}</b> (${dif > 0 ? "+" : ""}${eur(dif)} frente al total). Revisa precios o cargos que falten.`
        : `Cuadra con el total de la factura (cálculo: ${eur(R.calcAct.total)}).`;
    } else cu.textContent = "";
  }
  pintarStepper();
}

/* ---------- lectura de factura con IA ---------- */
async function subirFactura(file){
  if (!file) return;
  if (!cfg.ia){ toast("La lectura con IA no está activada. Rellena los datos a mano."); return; }
  if (file.size > 10 * 1024 * 1024){ toast("La factura pesa más de 10 MB."); return; }
  const drop = $("#drop");
  if (drop){ drop.classList.add("busy"); drop.innerHTML = `<div class="spin"></div><b>Leyendo la factura…</b><span>Suele tardar entre 10 y 40 segundos.</span>`; }
  try{
    let envio = file;
    if (/^image\//.test(file.type)) envio = await reducirImagen(file);
    const fd = new FormData(); fd.append("factura", envio, file.name || "factura");
    const r = await api("energia_factura.php", {method:"POST", body:fd});
    aplicarFactura(r.datos);
    state.paso = 5; guardarBorrador(); pintar();
    toast("Datos leídos de la factura. Revísalos antes de continuar.", 5000);
  } catch(err){
    if (err.status === 401){ mostrarLogin(); return; }
    toast(err.message, 6000);
    if (state.paso === 4 || state.paso === 5) pintar();
  }
}
function reducirImagen(file){
  return new Promise(res => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 2200, k = Math.min(1, max / Math.max(img.width, img.height));
      if (k === 1 && file.size < 3.5e6){ URL.revokeObjectURL(url); res(file); return; }
      const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob(b => res(b || file), "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}
function aplicarFactura(d){
  const s = state, c = s.cliente, fmt = v => v ? String(v) : "";
  if (d.tipo && d.tipo !== s.tipo){ s.tipo = d.tipo; c.peaje = d.tipo === "gas" ? "RL.1" : "2.0TD"; }
  if (d.tarifa_acceso && PEAJES[s.tipo][d.tarifa_acceso]) c.peaje = d.tarifa_acceso;
  if (d.cliente_nombre) c.nombre = d.cliente_nombre;
  if (d.cif_nif) c.cif = d.cif_nif;
  if (d.direccion_suministro) c.direccion = d.direccion_suministro;
  if (d.cups) c.cups = d.cups;
  if (d.comercializadora) c.compania = d.comercializadora;
  if (d.nombre_tarifa) c.tarifaActual = d.nombre_tarifa;
  if (d.zona) c.zona = d.zona;
  if (d.tipo_cliente) c.tipoCliente = d.tipo_cliente;
  if (d.fecha_inicio) c.inicio = d.fecha_inicio;
  if (d.fecha_fin) c.fin = d.fecha_fin;
  if (d.dias) c.dias = String(d.dias); else diasDesdeFechas();
  const bloq = s.estudio === "anual" && s.sipsOk;
  for (let i = 0; i < 6; i++){
    if (!bloq){ s.p.kw[i] = fmt(d.potencia_kw[i]); s.p.kwh[i] = fmt(d.consumo_kwh[i]); }
    s.p.pp[i] = fmt(d.precio_potencia_kw_dia[i]); s.p.pe[i] = fmt(d.precio_energia_kwh[i]);
  }
  if (s.tipo === "gas") s.tfd = fmt(d.termino_fijo_dia);
  s.total = fmt(d.total_factura); s.ssaa = fmt(d.importe_ssaa); s.reactiva = fmt(d.energia_reactiva);
  s.excesos = fmt(d.excesos_potencia); s.alquiler = fmt(d.alquiler_equipos);
  s.autoconsumo = !!d.autoconsumo; s.excedentes = fmt(d.excedentes_kwh); s.compensacion = fmt(d.precio_compensacion_kwh);
  s.obsIA = d.observaciones || "";
  if (s.estudio === "anual" && !s.sipsOk){
    // Estudio anual sin SIPS: la factura no da el consumo del año; avisamos.
    s.obsIA = (s.obsIA ? s.obsIA + " " : "") + "Estudio anual: sustituye potencia y consumo por los del último año (SIPS).";
  }
}
function diasDesdeFechas(){
  const c = state.cliente;
  const a = new Date(c.inicio + "T12:00:00"), b = new Date(c.fin + "T12:00:00");
  if (!isNaN(a) && !isNaN(b) && b >= a) c.dias = String(Math.round((b - a) / 86400000) + 1);
}

/* ---------- SIPS ---------- */
async function consultarSips(cups){
  cups = String(cups || "").replace(/\s+/g, "").toUpperCase();
  if (!/^ES\d{16}[A-Z]{2}/.test(cups)){ toast("El CUPS debe empezar por ES, seguir con 16 cifras y 2 letras."); return; }
  state.cliente.cups = cups;
  try{
    const r = await api("energia_sips.php?cups=" + encodeURIComponent(cups));
    const d = r.datos, s = state;
    if (d.tipo && d.tipo !== s.tipo){ s.tipo = d.tipo; }
    if (d.tarifa_acceso && PEAJES[s.tipo][d.tarifa_acceso]) s.cliente.peaje = d.tarifa_acceso;
    const total = d.consumo_kwh.reduce((a,b) => a + num(b), 0);
    if (s.estudio === "anual"){
      for (let i = 0; i < 6; i++){ s.p.kw[i] = d.potencia_kw[i] ? String(d.potencia_kw[i]) : ""; s.p.kwh[i] = d.consumo_kwh[i] ? String(d.consumo_kwh[i]) : ""; }
      s.sipsOk = true;
    } else {
      s.sipsKwhAnual = total;
      for (let i = 0; i < 6; i++) if (!num(s.p.kw[i]) && d.potencia_kw[i]) s.p.kw[i] = String(d.potencia_kw[i]);
    }
    state.paso = 5; guardarBorrador(); pintar();
    toast(`SIPS: ${d.tarifa_acceso} · ${miles(total)} kWh/año. Completa los precios actuales.`, 5000);
  } catch(err){
    if (err.status === 401){ mostrarLogin(); return; }
    toast(err.message, 6000);
  }
}

/* ================= etapa 2: comparativa ================= */
function pintarComparativa(){
  const s = state, R = resultados(s);
  const anual = s.estudio === "anual";
  const ordenadas = R.propias.slice().sort(s.comp.orden === "comision" ? (a,b) => (b.com ?? -1) - (a.com ?? -1) || b.ahorro - a.ahorro : (a,b) => b.ahorro - a.ahorro);
  const puedeCat = usuario && COMERCIALES.includes(usuario.rol);
  const vacioP = `<div class="empty">No hay tarifas propias activas de ${esc(s.tipo)} ${esc(s.cliente.peaje)} para clientes ${s.cliente.tipoCliente === "residencial" ? "residenciales" : "pyme"}.<br>${puedeCat ? '<button type="button" class="btn light sm" data-goto="catalogo">Añadir tarifas al catálogo</button>' : "Pide a un administrador que las añada al catálogo."}</div>`;
  $("#stage").innerHTML = `<div class="stage"><div class="wz">
    <div class="wz-top"><div class="wz-step"><button type="button" class="back" data-goto="factura" aria-label="Volver a la factura">←</button>Comparativa · ${esc(s.cliente.nombre)}</div></div>
    <div class="cgrid">
      <section class="fcard">
        <div class="eb">Situación actual</div><h3>${esc(s.cliente.compania || "Comercializadora actual")}</h3>
        <div>
          <div class="sumk"><small>Paga hoy al año</small><b>${eur(R.actualAnual)}</b><span>${anual ? "calculado con el consumo anual y sus precios" : `${eur(R.actualPer)} en ${R.D} días × ${dec(R.F,2)}`}</span></div>
          <div class="sumk"><small>Consumo anual</small><b>${miles(R.kwhAnual)} kWh</b><span>${esc(s.cliente.peaje)}${s.tipo === "luz" ? " · " + esc(s.p.kw.slice(0, periodos(s).pot).map(v => dec(num(v),2).replace(/,00$/,"")).join(" / ")) + " kW" : ""}${s.sipsKwhAnual && !anual ? " · tramo de comisión por SIPS" : ""}</span></div>
          <div class="sumk"><small>Precio medio de su energía</small><b>${dec(R.curAvg)} €/kWh</b><span>sin impuestos</span></div>
        </div>
        ${s.tipo === "luz" ? `<label class="tog" for="c-ssaa"><input type="checkbox" id="c-ssaa" data-cmp="incluirSsaa" ${s.comp.incluirSsaa ? "checked" : ""}> <span>Sumar el SSAA de cada tarifa del catálogo<br><span class="note">Recomendado: así las ofertas que cobran servicios de ajuste aparte no parecen más baratas.</span></span></label>` : ""}
        <label class="f" for="c-orden">Ordenar ofertas<select id="c-orden" data-cmp="orden"><option value="ahorro" ${s.comp.orden !== "comision" ? "selected" : ""}>Por ahorro para el cliente</option><option value="comision" ${s.comp.orden === "comision" ? "selected" : ""}>Por comisión</option></select></label>
      </section>
      <section class="fcard">
        <div class="eb">Ofertas del catálogo <span class="internal">Interno · la comisión no sale en el PDF</span></div><h3>Elige la propuesta ★</h3>
        <p>Coste anual con impuestos para el mismo consumo y potencia. La ★ es la tarifa que irá destacada en el informe.</p>
        <div class="rank">${ordenadas.length ? ordenadas.map(o => ofertaHtml(o, R)).join("") : vacioP}</div>
      </section>
    </div>
    <section class="fcard">
      <div class="eb">Comparativa de mercado del PDF</div><h3>Comercializadoras que salen en el informe</h3>
      <p>Tarifas publicadas de las grandes comercializadoras. Desmarca las que no quieras mostrar. Las que salen más caras que lo que paga hoy aparecen en rojo como «más caro».</p>
      ${R.mercado.length || R.propias.length > 1 ? `<div class="ptable-w"><table class="mtable rtable"><thead><tr><th>PDF</th><th>Comercializadora</th><th class="hide-s">Tarifa</th><th class="r">€/kWh medio</th><th class="r">Coste anual</th><th class="r">Ahorro vs hoy</th></tr></thead><tbody>
        ${R.propias.filter(o => o !== R.star).map(o => `<tr><td class="ck"><input type="checkbox" id="pp-${o.id}" data-ppdf="${o.id}" ${s.comp.propiasPdf.includes(o.id) ? "checked" : ""} aria-label="Mostrar ${esc(o.nombre)} en el PDF"></td><td class="nm">${esc(o.nombre)} <span class="pill pr">propia</span><small>${esc(o.tarifa)}</small></td><td class="hide-s">${esc(o.tarifa)}</td><td class="r" data-l="€/kWh medio">${dec(o.avg)}</td><td class="r" data-l="Coste anual">${eur(o.anual)}</td><td class="r ${o.ahorro >= 0 ? "pos" : "neg"}" data-l="Ahorro vs hoy">${eur(o.ahorro)}</td></tr>`).join("")}
        ${R.mercado.slice().sort((a,b) => a.anual - b.anual).map(o => `<tr><td class="ck"><input type="checkbox" id="mk-${o.id}" data-mk="${o.id}" ${(s.comp.fuera || []).includes(o.id) ? "" : "checked"} aria-label="Mostrar ${esc(o.nombre)} en el PDF"></td><td class="nm">${esc(o.nombre)}<small>${esc(o.tarifa)}</small></td><td class="hide-s">${esc(o.tarifa)}</td><td class="r" data-l="€/kWh medio">${dec(o.avg)}</td><td class="r" data-l="Coste anual">${eur(o.anual)}</td><td class="r ${o.ahorro >= 0 ? "pos" : "neg"}" data-l="Ahorro vs hoy">${eur(o.ahorro)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">No hay tarifas de mercado de ${esc(s.cliente.peaje)} en el catálogo.${puedeCat ? ' <button type="button" class="btn light sm" data-goto="catalogo">Abrir catálogo</button>' : ""}</div>`}
      <div class="okbar"><span class="note">${R.star ? `Propuesta: <b>${esc(R.star.nombre)} · ${esc(R.star.tarifa)}</b> · ahorro ${eur(R.ahorro)}/año` : "Elige una tarifa propuesta para continuar."}</span><button type="button" class="btn gold big" data-goto="exportar" ${R.star ? "" : "disabled"}>Preparar informe →</button></div>
    </section>
  </div></div>`;
}
function ofertaHtml(o, R){
  const rec = R.star && o.id === R.star.id;
  return `<div class="offer${rec ? " rec" : ""}"><button type="button" class="st" data-star="${o.id}" aria-label="Elegir como propuesta" aria-pressed="${rec}">★</button>
    <div class="nm"><b>${esc(o.nombre)} · ${esc(o.tarifa)}<span class="chip ${o.t.modalidad === "indexado" ? "ix" : "fx"}">${o.t.modalidad === "indexado" ? "Indexado" : "Fijo"}</span></b><small>${dec(o.avg)} €/kWh medio${o.t.ssaa_kwh && state.comp.incluirSsaa ? " · SSAA " + dec(o.t.ssaa_kwh) : ""}${o.t.permanencia_meses ? " · " + o.t.permanencia_meses + " meses de permanencia" : ""}</small></div>
    <div class="vals"><div class="v">Coste anual<b>${eur(o.anual)}</b></div>
    <div class="v">Ahorro<b class="${o.ahorro >= 0 ? "pos" : "neg"}">${eur(o.ahorro)}</b></div>
    <div class="v com">Comisión<b>${o.com == null ? "—" : eur(o.com)}</b></div></div></div>`;
}

/* ================= etapa 3: exportar ================= */
function ventajasDe(s, R){
  if (s.textos.ventajas != null) return s.textos.ventajas;
  return (R.star && R.star.t.ventajas) || "";
}
let exTab = "datos";
function pintarExportar(){
  const s = state, R = resultados(s);
  const baratas = R.pdfOps.filter(o => R.star && o.id !== R.star.id && o.anual < R.star.anual - 0.5);
  $("#stage").innerHTML = `<div class="stage exp"><div class="extabs" role="tablist" aria-label="Exportar">
      <button type="button" role="tab" data-extab="datos" aria-selected="${exTab === "datos"}">Datos del informe</button>
      <button type="button" role="tab" data-extab="vista" aria-selected="${exTab === "vista"}">Vista previa</button>
    </div><div class="main tab-${exTab}">
    <div class="panel">
      <div class="card"><div class="body">
        <div class="inline"><button type="button" class="btn light" data-goto="comparativa">← Comparativa</button><button type="button" class="btn light" id="btnSave">Guardar</button><button type="button" class="btn gold" id="btnPdf">Descargar PDF</button></div>
        <div class="note">Al descargar el PDF el informe se guarda solo y recibe su número de presupuesto.</div>
      </div></div>
      <details class="card" open><summary><span class="n">1</span>Presupuesto</summary><div class="body">
        <div class="grid2">${campoE("N.º de presupuesto","presupuesto.numero",s.presupuesto.numero)}${campoE("Fecha de emisión","presupuesto.fecha",s.presupuesto.fecha,"date")}</div>
        ${campoE("Validez (días)","presupuesto.validez",s.presupuesto.validez,"number")}
      </div></details>
      <details class="card" open><summary><span class="n">2</span>Textos de la propuesta<span class="hint">editables</span></summary><div class="body">
        <label class="f" for="t-ventajas">Por qué ${esc(R.star ? R.star.nombre : "la propuesta")} (una ventaja por línea; **negrita**)<textarea id="t-ventajas" data-tpath="ventajas" rows="5">${esc(ventajasDe(s, R))}</textarea></label>
        ${baratas.length ? `<div class="warnbox">${esc(listaY(baratas.map(o => o.nombre)))} ${baratas.length > 1 ? "salen" : "sale"} más ${baratas.length > 1 ? "baratas" : "barata"} que la propuesta. Explica por qué compensa la vuestra, o quítala${baratas.length > 1 ? "s" : ""} del PDF en la comparativa.</div>
          <label class="f" for="t-motivo">Por qué no la más barata<input type="text" id="t-motivo" data-tpath="motivo" value="${esc(s.textos.motivo)}" placeholder="pero tienen permanencia de 12 meses y cobran servicios aparte"></label>` : ""}
        <label class="f" for="t-extra">Frase extra en la propuesta (opcional)<textarea id="t-extra" data-tpath="extra" rows="2">${esc(s.textos.extra)}</textarea></label>
      </div></details>
      <details class="card"><summary><span class="n">3</span>Consultora<span class="hint">${esc(s.consultora.nombre)}</span></summary><div class="body">
        ${campoE("Nombre","consultora.nombre",s.consultora.nombre)}${campoE("Cargo","consultora.cargo",s.consultora.cargo)}${campoE("Correo","consultora.email",s.consultora.email,"email")}
        <div><button type="button" class="btn light sm" id="saveCons">Recordar mi cargo</button></div>
      </div></details>
      ${s.snap ? `<div class="card"><div class="body"><div class="note">Este informe conserva los precios con los que se guardó. <button type="button" class="btn light sm" id="btnRefrescar">Usar precios actuales del catálogo</button></div></div></div>` : ""}
    </div>
    <section class="preview" aria-label="Vista previa del informe">
      <div class="pv-head"><h2>Vista previa · 3 páginas A4</h2><div class="summary-chips" id="chips"></div></div>
      <div class="scaler" id="scaler"><div class="pages" id="pages"></div></div>
    </section>
  </div></div>`;
  renderInforme();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);
}
function campoE(label, path, val, type){
  const id = "e-" + path.replace(/\./g,"-");
  return `<label class="f" for="${id}">${label}<input id="${id}" type="${type || "text"}" data-epath="${path}" value="${esc(val)}"></label>`;
}
function fitPreview(){
  const sc = $("#scaler"), pages = $("#pages"); if (!sc || !pages) return;
  const k = Math.min(1, sc.clientWidth / 924); pages.style.transform = `scale(${k})`;
  sc.style.height = (pages.scrollHeight * k) + "px";
}
function medirTopbar(){ const t = document.querySelector(".topbar"); if (t) document.documentElement.style.setProperty("--topbar-h", t.offsetHeight + "px"); }
window.addEventListener("resize", () => { medirTopbar(); if (state && state.etapa === "exportar") fitPreview(); });

/* ---------- informe de 3 páginas ---------- */
const TAGC = {a:"a", r:"r", g:"g"};
function renderInforme(){
  const s = state, R = resultados(s), st = R.star; if (!st || !$("#pages")) return;
  const gas = s.tipo === "gas", anual = s.estudio === "anual";
  const k = s.consultora, actual = s.cliente.compania || "Comercializadora actual";
  const ahorro = R.ahorro, mes = ahorro / 12, pctA = R.actualAnual ? Math.round(ahorro / R.actualAnual * 100) : 0;
  const head = `<header class="ph"><div class="logo"><img src="logo.png" alt="Integral Connection Consulting"></div>
    <div class="meta">Presupuesto <b>${esc(s.presupuesto.numero)}</b><br>Emitido el <b>${esc(fechaLarga(s.presupuesto.fecha))}</b> · Válido ${num(s.presupuesto.validez) || 30} días</div></header>`;
  const foot = n => `<footer class="pf"><span>Integral Connection Consulting · Informe de auditoría energética · ${esc(s.cliente.nombre)}</span><span>Página ${n} de 3</span></footer>`;
  const periodoTxt = anual ? "Consumo real de 12 meses" : (s.cliente.inicio && s.cliente.fin ? `${fechaCortaISO(s.cliente.inicio)} – ${fechaCortaISO(s.cliente.fin)}` : `${R.D} días`);
  const kwh = kwhPeriodo(s), {pot} = periodos(s);

  /* página 1: diagnóstico */
  const filas = [];
  const kwTxt = gas ? "" : s.p.kw.slice(0, pot).map(v => dec(num(v), 2).replace(/,00$/,"")).filter((v,i,a) => a.indexOf(v) === i).join(" / ") + " kW";
  const ratio = maxKw(s) ? (kwh * R.F) / maxKw(s) : 9999;
  if (gas) filas.push([`Término fijo (${R.D} días)`, R.det.potencia, ["Regulado","g"]]);
  else filas.push([`Término de potencia (${kwTxt})`, R.det.potencia, ratio < 400 && s.cliente.tipoCliente === "residencial" || ratio < 250 ? ["Sobredimensionada","a"] : ["Correcto","g"]]);
  const caro = R.curAvg > st.avg * 1.03;
  filas.push([`Energía consumida (${miles(kwh)} kWh a ${dec(R.curAvg)} €)`, R.det.energia, caro ? ["Precio alto","r"] : ["En mercado","g"]]);
  if (R.det.ssaa > 0) filas.push(["SSAA / Coste de red eléctrica", R.det.ssaa, ["Cargo oculto","r"]]);
  if (R.det.react > 0) filas.push(["Energía reactiva", R.det.react, ["Penalización","r"]]);
  if (R.det.exc > 0) filas.push(["Excesos de potencia", R.det.exc, ["Penalización","r"]]);
  if (R.det.alq > 0) filas.push(["Alquiler de contador", R.det.alq, ["Regulado","g"]]);
  filas.push([gas ? "Impuestos (hidrocarburos e IVA) y otros" : "Impuestos y otros cargos", R.det.otros, ["Sube con los extras","a"]]);
  const obs = [];
  if (R.det.ssaa > 0) obs.push([`${eur(R.det.ssaa * R.F, 0)} al año en SSAA`, `Un cargo aparte que su tarifa no incluye en el precio. En esta factura supone el ${Math.round(R.det.ssaa / R.actualPer * 100)} % del total.`]);
  if (caro) obs.push([`Energía un ${Math.round((R.curAvg / st.avg - 1) * 100)} % más cara`, `Paga ${dec(R.curAvg)} €/kWh de media. Con nuestra propuesta, ${dec(st.avg)} €/kWh.`]);
  if (!gas && filas[0][2][0] === "Sobredimensionada") obs.push([`${kwTxt} para ${miles(kwh * R.F)} kWh al año`, `El ${Math.round(R.det.potencia / R.actualPer * 100)} % de su factura es potencia. Ajustarla a su uso real puede bajarla aún más.`]);
  if (R.det.react + R.det.exc > 0) obs.push([`${eur((R.det.react + R.det.exc) * R.F, 0)} al año en penalizaciones`, "Reactiva y excesos dependen de la instalación: con una batería de condensadores o ajustando la potencia desaparecen."]);
  const pctImp = R.actualPer ? Math.round(R.det.otros / R.actualPer * 100) : 0;
  if (obs.length < 3) obs.push([`${pctImp} % de la factura en impuestos y cargos`, `De cada 100 € que paga, ${pctImp} € no son energía ni potencia.`]);
  if (obs.length < 3) obs.push(["Precio expuesto a subidas", "Sin un precio cerrado, cada revisión de tarifa llega directamente a su factura."]);
  const leadDiag = `En ${anual ? "el último año" : R.D + " días"} ha pagado <b>${eur(R.actualPer)}</b>.` +
    (R.det.ssaa > 0 ? ` Solo el cargo de <b>SSAA</b> se lleva <b>${eur(R.det.ssaa)}</b>, el ${Math.round(R.det.ssaa / R.actualPer * 100)} % de la factura.`
     : !gas && R.det.potencia / R.actualPer > 0.4 ? ` <b>${eur(R.det.potencia)}</b> (el ${Math.round(R.det.potencia / R.actualPer * 100)} %) son solo potencia contratada.`
     : caro ? ` Está pagando la energía un <b>${Math.round((R.curAvg / st.avg - 1) * 100)} % más cara</b> de lo que puede pagarla.` : "");
  const p1 = `<section class="pg">${head}
    <div class="hero">
      <div class="eyebrow">Informe de auditoría energética · Más de 7 años reduciendo costes</div>
      <h1>Informe de Auditoría y Optimización Energética</h1>
      <p><b>Líderes en telecomunicaciones y trabajamos con el total de compañías de servicios</b> para que pague solo ${gas ? "el gas" : "la energía"} que necesita.</p>
      <div class="hmeta">
        <div><small>Cliente</small><b>${esc(s.cliente.nombre)}</b></div>
        ${s.cliente.cups ? `<div><small>CUPS</small><b>${esc(s.cliente.cups)}</b></div>` : ""}
        <div><small>Comercializadora actual</small><b>${esc(actual)}</b></div>
        <div><small>Tarifa</small><b>${esc(s.cliente.peaje)}</b></div>
        <div><small>${anual ? "Estudio" : "Factura analizada"}</small><b>${esc(periodoTxt)}</b></div>
      </div>
    </div>
    <div class="gbar"></div>
    <div class="kpis">
      <div class="kpi k1"><small>Lo que paga hoy</small><div class="big">${eur(R.actualAnual / 12)}</div><span>al mes · ${eur(R.actualAnual)} al año</span></div>
      <div class="kpi k2"><small>Con nuestra propuesta</small><div class="big">${eur(st.anual / 12)}</div><span>al mes · ${esc(st.nombre)}</span></div>
      <div class="kpi k3"><small>Ahorro anual estimado</small><div class="big">${eur(ahorro)}</div><span>${eur(mes)} al mes × 12 · ${pctA} % menos · impuestos incl.</span></div>
    </div>
    ${ahorro > 0 ? `<div class="drain">Cada día que sigue con ${esc(actual)} pierde <b>${eur(ahorro / 365)}</b></div>` : ""}
    <div class="sec"><div class="num">1</div><h2>Diagnóstico: lo que está pagando</h2></div>
    <p class="lead">${leadDiag}</p>
    <table class="t"><thead><tr><th>Concepto</th><th class="r">${anual ? "Importe anual" : `Importe en factura (${R.D} días)`}</th><th style="width:170px">Diagnóstico</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td>${esc(f[0])}</td><td class="r">${eur(f[1])}</td><td><span class="tag ${TAGC[f[2][1]]}">${esc(f[2][0])}</span></td></tr>`).join("")}
      <tr class="total"><td>Total factura</td><td class="r">${eur(R.actualPer)}</td><td></td></tr>
    </tbody></table>
    <div class="cards3">${obs.slice(0,3).map(o => `<div class="ic"><b>${esc(o[0])}</b><span>${esc(o[1])}</span></div>`).join("")}</div>
    ${foot(1)}</section>`;

  /* página 2: comparativa de mercado */
  const ops = R.pdfOps.slice();
  const sorted = ops.slice().sort((a,b) => a.anual - b.anual);
  const rowH = sorted.length > 9 ? 22 : sorted.length > 7 ? 27 : 30, W = 470;
  const maxV = Math.max(R.actualAnual, ...ops.map(o => o.anual)) || 1;
  const sc = v => Math.max(2, v / maxV * W);
  const chartH = sorted.length * rowH, todayX = 150 + sc(R.actualAnual);
  const mejoran = ops.filter(o => o.id !== st.id && o.anual > st.anual + 0.5).length;
  const masCaras = ops.filter(o => o.anual > R.actualAnual + 0.5).length;
  const leadCmp = `<b>${esc(st.nombre)} le ahorra ${eur(ahorro)} al año</b> frente a su factura actual` +
    (ops.length > 1 ? ` y mejora a ${mejoran} de las ${ops.length - 1} comercializadoras comparadas.` : ".") +
    (masCaras ? ` ${masCaras === ops.length - 1 ? "Todas las demás" : masCaras + " de ellas"} le costarían incluso más que lo que paga hoy.` : "");
  const tabla = [st, ...sorted.filter(o => o.id !== st.id)];
  const ppTxt = o => gas ? dec(o.t.termino_fijo_dia) : (o.t.pp2 && o.t.pp2 !== o.t.pp1 ? dec(o.t.pp1) + " / " + dec(o.t.pp2) : dec(o.t.pp1));
  const p2 = `<section class="pg">${head}
    <div class="sec" style="margin-top:28px"><div class="num">2</div><h2>Comparativa de mercado: ${ops.length} ${ops.length === 1 ? "comercializadora" : "comercializadoras"}</h2></div>
    <p class="lead">${leadCmp}</p>
    <div class="chart" style="--ch:${chartH + 34}px">${sorted.map((o, i) => `<div class="bar-row${o.id === st.id ? " hi" : ""}" style="top:${i*rowH}px"><div class="lab">${o.id === st.id ? "★ " : ""}${esc(o.nombre)}</div><div class="bar" style="width:${sc(o.anual)}px"></div><div class="val">${eur(o.anual)}</div></div>`).join("")}
      <div class="today" style="left:${todayX}px;height:${chartH + 8}px"></div>
      <div class="today-l" style="left:${todayX + 2}px;top:${chartH + 10}px">Hoy: ${eur(R.actualAnual)} / año</div>
    </div>
    <p class="cap">Coste anual estimado con impuestos para el mismo consumo y potencia. Línea roja: lo que paga hoy; lo que queda a su derecha le costaría más.</p>
    <table class="t t2 e"><thead><tr><th>Comercializadora</th><th class="r">€/kWh</th><th class="r">${gas ? "Fijo €/día" : "Potencia €/kW·día"}</th><th class="r">Coste anual</th><th class="r">Ahorro vs hoy</th><th>Valoración</th></tr></thead><tbody>
      ${tabla.map(o => { const rec = o.id === st.id; return `<tr class="${rec ? "rec" : ""}"><td style="width:150px">${rec ? '<span class="star">★</span> ' : ""}${esc(o.nombre)}<small>${esc(o.tarifa)}</small></td><td class="r">${dec(o.avg)}</td><td class="r">${ppTxt(o)}</td><td class="r">${eur(o.anual)}</td>${o.ahorro >= 0 ? `<td class="r pos">${eur(o.ahorro)}</td>` : `<td class="r neg">+${eur(-o.ahorro)}<small>más caro</small></td>`}<td class="val" style="width:170px">${esc(o.t.valoracion || (o.t.modalidad === "indexado" ? "Precio indexado (estimado)" : "Precio fijo"))}</td></tr>`; }).join("")}
      <tr class="now"><td>Situación actual (${esc(actual)})</td><td class="r">${dec(R.curAvg)}</td><td class="r">${gas ? dec(num(s.tfd)) : dec(num(s.p.pp[0]))}</td><td class="r">${eur(R.actualAnual)}</td><td class="r">—</td><td class="val">${R.det.ssaa > 0 ? "Con SSAA cobrado aparte" : R.det.react + R.det.exc > 0 ? "Con penalizaciones" : "Precio actual"}</td></tr>
    </tbody></table>
    <p class="fn">Importes con ${esc(tipoImpuesto(s).nombre)}, ${gas ? "impuesto de hidrocarburos" : "impuesto eléctrico (5,11 %)"} y alquiler de contador incluidos, ${anual ? "calculados sobre el consumo real anual (SIPS)" : `extrapolados a un año desde la factura de ${R.D} días`} (${miles(kwh)} kWh${gas ? "" : ", " + kwTxt}). ${s.comp.incluirSsaa && !gas ? "Incluye el SSAA que cada comercializadora cobra aparte. " : ""}Tarifas publicadas vigentes a ${esc(fechaLarga(s.presupuesto.fecha))}, sin impuestos. Importe orientativo, sin regularizaciones ni cambios normativos.</p>
    ${foot(2)}</section>`;

  /* página 3: propuesta */
  const vent = String(ventajasDe(s, R)).split("\n").map(x => x.trim()).filter(Boolean).slice(0, 4);
  const ventajas = vent.length ? vent : ["**Precio cerrado** sin sorpresas en cada factura.", "**Sin cargos aparte**: lo que ve es lo que paga.", "**Cambio sin cortes** de suministro.", "**Revisión de la primera factura** incluida."];
  const baratas = ops.filter(o => o.id !== st.id && o.anual < st.anual - 0.5);
  let lead3 = `<b>Con ${esc(st.nombre)} su factura baja de ${eur(R.actualAnual / 12)} a ${eur(st.anual / 12)} al mes</b>, ` +
    (R.det.ssaa > 0 && !st.t.ssaa_kwh ? "a precio cerrado y sin cargos de red aparte." : caro ? `con la energía un ${Math.round((R.curAvg / st.avg - 1) * 100)} % más barata.` : "con las mismas condiciones de suministro.");
  if (baratas.length && s.textos.motivo.trim()){
    const d = baratas.map(o => (st.anual - o.anual) / 12);
    lead3 += ` ${esc(listaY(baratas.map(o => o.nombre)))} ${baratas.length > 1 ? "cuestan" : "cuesta"} ${baratas.length > 1 ? `entre ${eur(Math.min(...d),0)} y ${eur(Math.max(...d),0)}` : eur(d[0],0)} menos al mes, ${esc(s.textos.motivo.trim().replace(/\.$/,""))}.`;
  }
  if (s.textos.extra.trim()) lead3 += " " + esc(s.textos.extra.trim());
  const p3 = `<section class="pg p3">${head}
    <div class="sec" style="margin-top:28px"><div class="num">3</div><h2>Nuestra propuesta: ${esc(st.nombre)}</h2></div>
    <p class="lead">${lead3}</p>
    <div class="p3top">
      <div class="calc">
        <div>Paga hoy (${esc(actual)})<b>${eur(R.actualAnual / 12)} / mes</b></div>
        <div>Pagará con ${esc(st.nombre)}<b>${eur(st.anual / 12)} / mes</b></div>
        <div>Diferencia mensual<b>${eur(mes)} / mes</b></div>
        <div>× 12 meses<b></b></div>
        <div>Ahorro anual, impuestos incluidos<b>${eur(ahorro)}</b></div>
      </div>
      <div class="save"><small>Ahorro anual estimado</small><div class="big">${eur(ahorro)}</div><span>Impuestos incluidos · ${eur(ahorro * 3)} en 3 años</span></div>
    </div>
    <div class="h3">Por qué ${esc(st.nombre)}</div>
    <div class="ticks">${ventajas.map(v => `<div>${md(v)}</div>`).join("")}</div>
    <div class="h3">Por qué con Integral Connection Consulting</div>
    <div class="ticks">
      <div><b>Total de compañías de servicios.</b> Comparamos todas las comercializadoras y le mostramos el mercado completo.</div>
      <div><b>Más de 7 años reduciendo costes.</b> Energía, telecomunicaciones y servicios con un mismo interlocutor.</div>
      <div><b>Cero cargos ocultos.</b> Vigilamos servicios de ajuste, penalizaciones y subidas de precio en cada factura.</div>
      <div><b>Gestión integral.</b> ${esc(k.nombre || "Su consultor")} lleva el cambio de principio a fin y revisa su primera factura.</div>
    </div>
    <div class="cta">
      <div>
        <h3>Cada mes sin cambiar le cuesta<br><em>${eur(mes)}</em>.</h3>
        <p>Firme hoy y nos encargamos de todo. Sin cortes de ${gas ? "suministro" : "luz"}, sin obras y manteniendo su contador.</p>
        <div class="steps"><div><b>1 · Firme</b><span>Este presupuesto</span></div><div><b>2 · Gestionamos</b><span>El cambio de comercializadora</span></div><div><b>3 · Ahorra</b><span>Desde la primera factura</span></div></div>
        <div class="mail">Escriba a ${esc(k.nombre)}:<br>${esc(k.email)}</div>
      </div>
      <div class="accept">
        <small>Aceptación del presupuesto</small>
        <div class="opt"><span class="box"></span><span><b>${esc(st.nombre)}</b> (recomendada) · ahorro ${eur(ahorro)}/año</span></div>
        <div class="opt"><span class="box"></span><span>Otra opción: ____________________</span></div>
        <div class="ln">Nombre y apellidos</div>
        <div class="ln">DNI / CIF</div>
        <div class="ln">Fecha y firma del cliente</div>
      </div>
    </div>
    <div class="sign"><img src="icono.png" alt="" width="72" height="72"><div class="who"><b>${esc(k.nombre)}</b><br>${esc(k.cargo)}<br>Integral Connection Consulting<br>${esc(k.email)}</div><div class="sl">Firma de ${esc(k.nombre || "Integral Connection Consulting")}</div></div>
    ${foot(3)}</section>`;

  $("#pages").innerHTML = p1 + p2 + p3;
  $("#chips").innerHTML = `<span class="chipk">Hoy ${eur(R.actualAnual / 12)}/mes</span><span class="chipk">${esc(st.nombre)} ${eur(st.anual / 12)}/mes</span><span class="chipk g">${eur(ahorro)}/año</span>`;
  fitPreview();
}

/* ---------- guardar / PDF ---------- */
function congelarPrecios(R){
  const snap = {}; R.pdfOps.forEach(o => { snap[o.id] = clone(o.t); }); if (R.star) snap[R.star.id] = clone(R.star.t);
  return snap;
}
async function guardarInforme(silencioso){
  const R = resultados(state); if (!R.star){ toast("Elige una propuesta en la comparativa."); return false; }
  state.snap = congelarPrecios(R);
  const body = {
    id: state.id || null, numero: state.presupuesto.numero, tipo: state.tipo, cliente_id: state.crmClienteId || null,
    cliente_nombre: state.cliente.nombre, cups: state.cliente.cups, comercializadora_actual: state.cliente.compania,
    tarifa_propuesta: R.star.nombre + " · " + R.star.tarifa,
    coste_actual_anual: r2(R.actualAnual), coste_propuesto_anual: r2(R.star.anual), ahorro_anual: r2(R.ahorro),
    datos: clone(state)
  };
  try{
    const r = await api("energia.php?recurso=informes", {method:"POST", body:JSON.stringify(body)});
    const cambio = r.numero !== state.presupuesto.numero;
    state.id = r.id; state.presupuesto.numero = r.numero;
    guardarBorrador();
    try { const cf = await api("energia.php?recurso=config"); cfg.prefijo = cf.prefijo; cfg.siguiente = cf.siguiente; } catch(e){}
    if (state.etapa === "exportar"){ const n = $("#e-presupuesto-numero"); if (n) n.value = r.numero; renderInforme(); }
    if (!silencioso || cambio) toast("Informe " + r.numero + " guardado" + (cambio ? " (número asignado)" : ""));
    return true;
  } catch(err){
    if (err.status === 401){ mostrarLogin(); return false; }
    toast("No se pudo guardar: " + err.message); return false;
  }
}
async function archivarPdf(pdf){
  if (!state.id) return false;
  try {
    const b64 = pdf.output("datauristring").split(",")[1];
    await api("energia.php?recurso=pdf&id=" + encodeURIComponent(state.id), {method:"POST", body:JSON.stringify({pdf:b64})});
    return true;
  } catch(e){ console.warn("PDF no archivado:", e.message); return false; }
}
async function exportarPdf(){
  const btn = $("#btnPdf");
  if (!window.html2canvas || !window.jspdf){ toast("No se pudieron cargar las librerías de PDF. Revisa la conexión y recarga la página."); return; }
  // La propuesta elegida sale más cara que lo que paga hoy: el informe hablaría de un "ahorro" negativo.
  const Rp = resultados(state);
  if (Rp.star && Rp.ahorro <= 0 && !confirm("Con " + Rp.star.nombre + " el cliente pagaría " + eur(Math.abs(Rp.ahorro)) + " más al año que hoy. ¿Generar el PDF igualmente? (Mejor elige otra propuesta ★ en la comparativa.)")) return;
  btn.disabled = true; btn.textContent = "Guardando…";
  const ok = await guardarInforme(true);
  if (!ok){ btn.disabled = false; btn.textContent = "Descargar PDF"; return; }
  btn.textContent = "Generando PDF…";
  const pages = $("#pages"), prev = pages.style.transform;
  // html2canvas copia la pagina a 1000 px de ancho: a ese ancho se activan las
  // pestanas Datos/Vista previa y, con "Datos", la vista previa queda oculta
  // (tamano 0) y html2canvas falla. Se fuerza la vista previa mientras se genera.
  const mainExp = document.querySelector(".stage.exp .main"), claseMain = mainExp ? mainExp.className : "";
  try{
    if (mainExp) mainExp.className = "main tab-vista";
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    pages.style.transform = "none";
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF({unit:"pt", format:"a4", compress:true});
    const els = pages.querySelectorAll(".pg");
    for (let i = 0; i < els.length; i++){
      const cv = await html2canvas(els[i], {scale:2.2, backgroundColor:"#ffffff", useCORS:true, logging:false, windowWidth:1000});
      if (i) pdf.addPage();
      pdf.addImage(cv.toDataURL("image/jpeg", .93), "JPEG", 0, 0, 595.28, 841.89);
    }
    const R = resultados(state);
    pdf.save("Auditoria_Energetica_" + slug(state.cliente.nombre || "cliente") + "_" + slug(R.star ? R.star.nombre : "propuesta") + ".pdf");
    btn.textContent = "Archivando…";
    const archivado = await archivarPdf(pdf);
    toast("PDF descargado · " + state.presupuesto.numero + (archivado ? " · copia guardada en el CRM" : ""));
  } catch(err){ console.error(err); toast("Error al generar el PDF."); }
  finally { if (mainExp) mainExp.className = claseMain; pages.style.transform = prev; fitPreview(); btn.disabled = false; btn.textContent = "Descargar PDF"; }
}

/* ================= informes guardados ================= */
async function cargarInformes(){ try { informes = await api("energia.php?recurso=informes"); } catch(e){ informes = []; } }
function fechaCorta(ts){ if (!ts) return ""; const d = new Date(String(ts).replace(" ","T")); return isNaN(d) ? ts : d.toLocaleDateString("es-ES"); }
function pintarInformes(){
  const otros = usuario && usuario.rol !== "gestor_comercial";
  $("#stage").innerHTML = `<div class="stage"><div class="wz">
    <div class="wz-top"><div class="wz-step"><button type="button" class="back" data-volver aria-label="Volver">←</button>Informes de energía guardados</div></div>
    <section class="fcard"><div class="eb">${otros ? "Tuyos y de tu equipo" : "Tus informes"}</div><h3>${informes.length} ${informes.length === 1 ? "informe" : "informes"}</h3>
      ${informes.length ? `<div class="hist" style="max-height:none">${informes.map(d => `<div class="hitem${state.id === d.id ? " cur" : ""}"><div><b>${esc(d.cliente_nombre || "Sin nombre")} · ${esc(d.comercializadora_actual || "")} → ${esc(d.tarifa_propuesta || "")}</b><small>${esc(d.numero)} · ${d.tipo === "gas" ? "Gas" : "Luz"} · ahorro ${eur(num(d.ahorro_anual))}/año${otros && d.usuario_nombre ? " · " + esc(d.usuario_nombre) : ""} · ${esc(fechaCorta(d.updated_at))}</small></div>
        <div class="acts"><button type="button" class="btn light sm" data-load="${d.id}">Abrir</button>${d.tiene_pdf ? `<a class="btn light sm" href="${API_BASE}cmp_energia.php?recurso=pdf&id=${encodeURIComponent(d.id)}" download title="PDF archivado en el CRM">PDF</a>` : ""}<button type="button" class="btn light sm" data-dup="${d.id}" title="Usar como base para otro cliente">Duplicar</button><button type="button" class="btn ghost" data-del-inf="${d.id}" aria-label="Eliminar">✕</button></div></div>`).join("")}</div>`
        : `<div class="empty">Aún no hay informes de energía. Se guardan al pulsar <b>Guardar</b> o <b>Descargar PDF</b> en la etapa Exportar.</div>`}
    </section></div></div>`;
}
let etapaPrevia = "factura";
async function abrirInforme(id, dup){
  try{
    const r = await api("energia.php?recurso=informes&id=" + encodeURIComponent(id));
    state = Object.assign(nuevoEstado(), clone(r.datos));
    state.id = r.id; state.paso = 5; state.etapa = "exportar";
    if (dup){
      state.id = null; state.snap = null; state.etapa = "factura"; state.crmClienteId = null;
      state.cliente = Object.assign(nuevoEstado().cliente, {tipoCliente:state.cliente.tipoCliente, peaje:state.cliente.peaje, zona:state.cliente.zona});
      state.p = nuevoEstado().p; ["total","reactiva","excesos","ssaa","alquiler","excedentes","compensacion","tfd","obsIA"].forEach(k => state[k] = "");
      state.sipsOk = false; state.sipsKwhAnual = 0;
      state.presupuesto = {numero:cfg.prefijo + cfg.siguiente, fecha:hoyISO(), validez:30};
      state.consultora = consultoraUsuario();
    }
    guardarBorrador(); pintar();
    toast(dup ? "Duplicado: completa los datos del nuevo cliente" : "Informe " + r.numero + " abierto");
  } catch(err){ toast("No se pudo abrir: " + err.message); }
}
async function borrarInforme(id, btn){
  if (btn.dataset.confirm !== "1"){ btn.dataset.confirm = "1"; btn.textContent = "¿Eliminar?"; btn.style.color = "var(--red)"; setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "✕"; btn.style.color = ""; }, 3500); return; }
  try { await api("energia.php?recurso=informes&id=" + encodeURIComponent(id), {method:"DELETE"}); if (state.id == id) state.id = null; toast("Informe eliminado"); await cargarInformes(); pintarInformes(); }
  catch(err){ toast("No se pudo eliminar: " + err.message); }
}


/* ================= seguridad y copias (administradores) ================= */
const EVENTOS = {login_ok:"Entrada correcta", login_fallido:"Contraseña incorrecta", logout:"Salida", sesion_caducada:"Sesión caducada", sesion_invalidada_por_cambio_de_clave:"Sesión cerrada por cambio de clave",
  origen_bloqueado:"Petición desde otra web bloqueada", csrf_rechazado:"Petición sin token bloqueada", copia_creada:"Copia de seguridad creada", copia_descargada:"Copia descargada", copia_fallida:"Copia fallida",
  cron_token_incorrecto:"Tarea programada con token incorrecto", tarifa_guardada:"Tarifa guardada", tarifa_borrada:"Tarifa borrada", informe_energia_borrado:"Informe borrado", factura_ia:"Factura leída con IA", error_interno:"Error interno"};
const EV_MALO = new Set(["login_fallido","origen_bloqueado","csrf_rechazado","copia_fallida","cron_token_incorrecto","error_interno"]);
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
async function pintarSeguridad(){
  $("#stage").innerHTML = `<div class="stage"><div class="wz"><div class="wz-top"><div class="wz-step"><button type="button" class="back" data-volver aria-label="Volver">←</button>Seguridad y copias de seguridad</div></div><section class="fcard"><div class="spin"></div></section></div></div>`;
  let est, copias, reg;
  try { [est, copias, reg] = await Promise.all([api("seguridad.php?recurso=estado"), api("seguridad.php?recurso=copias"), api("seguridad.php?recurso=registro")]); }
  catch(err){ $("#stage .fcard").innerHTML = `<div class="miss">${esc(err.message)}</div>`; return; }
  const ok = (b, si, no) => `<span class="pill ${b ? "okp" : "badp"}">${b ? si : no}</span>`;
  $("#stage").innerHTML = `<div class="stage"><div class="wz">
    <div class="wz-top"><div class="wz-step"><button type="button" class="back" data-volver aria-label="Volver">←</button>Seguridad y copias de seguridad</div></div>
    <section class="fcard"><div class="eb">Comprobación de la instalación</div><h3>${est.avisos.length ? est.avisos.length + (est.avisos.length === 1 ? " cosa por revisar" : " cosas por revisar") : "Todo en orden"}</h3>
      ${est.avisos.length ? `<ul class="avisos">${est.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      <div class="segk">
        <div><small>Carpeta privada</small>${ok(est.privado && est.privado.fuera_de_web, "Fuera de la web", est.privado ? "Dentro de la web" : "No existe")}<span>${esc(est.privado ? est.privado.ruta : "icc-privado")}</span></div>
        <div><small>Contraseñas (config.php)</small>${ok(est.config === "privado", "En carpeta privada", "En api/")}<span>${est.config === "privado" ? "No accesible desde internet" : "Muévelo a icc-privado"}</span></div>
        <div><small>Conexión</small>${ok(est.https, "HTTPS", "Sin HTTPS")}<span>PHP ${esc(est.php)}</span></div>
        <div><small>Copias de seguridad</small>${ok(est.copias.total > 0, est.copias.total + " guardadas", "Ninguna")}<span>${est.copias.ultima ? "Última: " + esc(new Date(est.copias.ultima).toLocaleString("es-ES")) : "Se hace una al día automáticamente"}</span></div>
      </div>
    </section>
    <section class="fcard"><div class="eb">Base de datos · cifradas con AES-256 · se guardan las últimas 30</div><h3>Copias de seguridad</h3>
      <p>Se hace una copia completa de la base de datos al día, sola, en la carpeta privada de Hostalia. La descarga sale ya descifrada en formato .sql.gz: para restaurarla, phpMyAdmin → Importar.</p>
      <div class="okbar"><span class="note"></span><button type="button" class="btn gold" id="segCopia">Hacer copia ahora</button></div>
      ${copias.length ? `<div class="ptable-w"><table class="mtable rtable"><thead><tr><th>Copia</th><th class="r">Tamaño</th><th class="r">Fecha</th><th></th></tr></thead><tbody>${copias.map(c => `<tr><td class="nm">${esc(c.archivo.replace(".sql.gz.enc",""))}<small>${esc(new Date(c.fecha).toLocaleString("es-ES"))} · ${kb(c.bytes)}</small></td><td class="r" data-l="Tamaño">${kb(c.bytes)}</td><td class="r hide-s">${esc(new Date(c.fecha).toLocaleString("es-ES"))}</td><td class="r ck"><button type="button" class="btn light sm" data-descargar="${esc(c.archivo)}">Descargar</button></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">Aún no hay copias. Pulsa <b>Hacer copia ahora</b>.</div>`}
    </section>
    <section class="fcard"><div class="eb">Últimos 200 eventos</div><h3>Registro de seguridad</h3>
      ${reg.length ? `<div class="ptable-w"><table class="mtable rtable"><thead><tr><th>Fecha</th><th>Evento</th><th>Usuario</th><th>IP</th></tr></thead><tbody>${reg.map(e => `<tr class="${EV_MALO.has(e.evento) ? "malo" : ""}"><td data-l="Fecha">${esc(new Date(e.fecha).toLocaleString("es-ES"))}</td><td class="nm">${esc(EVENTOS[e.evento] || e.evento)}${e.email ? `<small>${esc(e.email)}</small>` : ""}${e.archivo ? `<small>${esc(e.archivo)}</small>` : ""}${e.nombre ? `<small>${esc(e.nombre)}</small>` : ""}</td><td data-l="Usuario">${esc(e.usuario_nombre || "—")}</td><td data-l="IP">${esc(e.ip || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Sin eventos todavía.</div>`}
    </section>
  </div></div>`;
}
async function hacerCopia(btn){
  btn.disabled = true; btn.textContent = "Haciendo copia…";
  try { const r = await api("seguridad.php?recurso=copias", {method:"POST", body:"{}"}); toast("Copia creada: " + r.archivo); pintarSeguridad(); }
  catch(err){ toast(err.message, 6000); btn.disabled = false; btn.textContent = "Hacer copia ahora"; }
}
async function descargarCopia(archivo, btn){
  btn.disabled = true; btn.textContent = "Descargando…";
  try{
    const res = await fetch("/api/seguridad.php?recurso=descargar&archivo=" + encodeURIComponent(archivo), {credentials:"same-origin", headers:{"X-CSRF-Token":csrf}});
    if (!res.ok){ let m = "No se pudo descargar."; try { m = (await res.json()).error || m; } catch(e){} throw new Error(m); }
    const blob = await res.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = archivo.replace(/\.enc$/, ""); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch(err){ toast(err.message, 6000); }
  finally { btn.disabled = false; btn.textContent = "Descargar"; }
}

/* ================= catálogo de tarifas ================= */
async function cargarCatalogo(todas){
  try { catalogo = await api("energia.php?recurso=tarifas" + (todas ? "&todas=1" : "")); }
  catch(err){ catalogo = []; if (err.status === 503) toast(err.message, 6000); }
}
function tarifaVacia(){ return {id:null, tipo:catFiltro.tipo, peaje:catFiltro.peaje, rol:"propia", comercializadora:"", nombre:"", modalidad:"fijo", cliente:"todos",
  pp1:0,pp2:0,pp3:0,pp4:0,pp5:0,pp6:0,pe1:0,pe2:0,pe3:0,pe4:0,pe5:0,pe6:0, termino_fijo_dia:0, ssaa_kwh:0, compensacion_kwh:0, permanencia_meses:0, comision_tramos:"", valoracion:"", ventajas:"", activo:true}; }
function pintarCatalogo(){
  const f = catFiltro, admin = usuario && usuario.rol === "admin";
  const lista = catalogo.filter(t => t.tipo === f.tipo && (!f.peaje || t.peaje === f.peaje) && (!f.rol || t.rol === f.rol) && (f.ver === "todas" || t.activo));
  const peajes = Object.keys(PEAJES[f.tipo]);
  const t = catSel;
  const per = t ? (PEAJES[t.tipo][t.peaje] || {pot:2,en:3}) : null;
  const ci = (lab, k, v, extra) => `<label class="f" for="ct-${k}">${lab}<input type="text" id="ct-${k}" data-ct="${k}" value="${esc(v ?? "")}" ${extra || ""}></label>`;
  const cs = (lab, k, v, ops) => `<label class="f" for="ct-${k}">${lab}<select id="ct-${k}" data-ct="${k}">${ops.map(([a,b]) => `<option value="${a}" ${a===v?"selected":""}>${b}</option>`).join("")}</select></label>`;
  $("#stage").innerHTML = `<div class="stage"><div class="wz">
    <div class="wz-top"><div class="wz-step"><button type="button" class="back" data-volver aria-label="Volver">←</button>Catálogo de tarifas de energía</div></div>
    <section class="fcard"><div class="eb">Precios sin impuestos · potencia en €/kW·día · energía en €/kWh</div><h3>Tarifas</h3>
      <p><b>Propias</b>: las que vendéis (con comisión); salen en el ranking interno y se pueden proponer. <b>Mercado</b>: tarifas publicadas de las grandes comercializadoras para la comparativa del PDF. Comisión por tramos de consumo anual: <code>5000:40; 15000:80; *:120</code> (hasta 5.000 kWh, 40 €…), o un importe fijo.</p>
      <div class="cat-tools">
        <label class="f" for="cf-tipo">Suministro<select id="cf-tipo" data-cf="tipo"><option value="luz" ${f.tipo==="luz"?"selected":""}>Luz</option><option value="gas" ${f.tipo==="gas"?"selected":""}>Gas</option></select></label>
        <label class="f" for="cf-peaje">Peaje<select id="cf-peaje" data-cf="peaje"><option value="">Todos</option>${peajes.map(p => `<option ${p===f.peaje?"selected":""}>${p}</option>`).join("")}</select></label>
        <label class="f" for="cf-rol">Tipo<select id="cf-rol" data-cf="rol"><option value="">Propias y mercado</option><option value="propia" ${f.rol==="propia"?"selected":""}>Propias</option><option value="mercado" ${f.rol==="mercado"?"selected":""}>Mercado</option></select></label>
        <label class="f" for="cf-ver">Mostrar<select id="cf-ver" data-cf="ver"><option value="activas">Activas</option><option value="todas" ${f.ver==="todas"?"selected":""}>Todas</option></select></label>
        <button type="button" class="btn gold" id="ctNueva">+ Nueva tarifa</button>
      </div>
      ${lista.length ? `<div class="ptable-w"><table class="ctable rtable"><thead><tr><th>Tipo</th><th>Comercializadora</th><th class="hide-s">Tarifa</th><th>Peaje</th><th>Cliente</th><th>Energía P1/P2/P3</th><th>${f.tipo === "gas" ? "Fijo €/día" : "Potencia P1/P2"}</th><th>SSAA</th><th>Comisión</th></tr></thead><tbody>
        ${lista.map(x => `<tr data-ctid="${x.id}" class="${catSel && catSel.id === x.id ? "sel" : ""} ${x.activo ? "" : "inact"}" tabindex="0" role="button" aria-label="Editar ${esc(x.comercializadora)} ${esc(x.nombre)}"><td class="ck"><span class="pill ${x.rol === "propia" ? "pr" : "mk"}">${x.rol}</span></td><td class="nm">${esc(x.comercializadora)}<small>${esc(x.nombre)}${x.activo ? "" : " · inactiva"}</small></td><td class="hide-s">${esc(x.nombre)}${x.modalidad === "indexado" ? ' <span class="chip ix">indexado</span>' : ""}${x.activo ? "" : " (inactiva)"}</td><td data-l="Peaje">${esc(x.peaje)}</td><td data-l="Cliente">${esc(x.cliente)}</td><td data-l="Energía">${[x.pe1,x.pe2,x.pe3].map(v => dec(v)).join(" / ")}</td><td data-l="${x.tipo === "gas" ? "Fijo €/día" : "Potencia"}">${x.tipo === "gas" ? dec(x.termino_fijo_dia) : dec(x.pp1) + " / " + dec(x.pp2)}</td><td data-l="SSAA">${x.ssaa_kwh ? dec(x.ssaa_kwh) : "—"}</td><td data-l="Comisión">${esc(x.comision_tramos || "—")}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">No hay tarifas con este filtro.</div>`}
    </section>
    ${t ? `<section class="fcard" id="ctForm"><div class="eb">${t.id ? "Editar tarifa" : "Nueva tarifa"}</div><h3>${esc(t.comercializadora || "Tarifa")} ${esc(t.nombre)}</h3>
      <div class="g4">
        ${cs("Suministro","tipo",t.tipo,[["luz","Luz"],["gas","Gas"]])}
        ${cs("Peaje","peaje",t.peaje,Object.keys(PEAJES[t.tipo]).map(p => [p,p]))}
        ${cs("Tipo","rol",t.rol,[["propia","Propia (la vendemos)"],["mercado","Mercado (referencia)"]])}
        ${cs("Clientes","cliente",t.cliente,[["todos","Todos"],["residencial","Residencial"],["pyme","Pymes y autónomos"]])}
        ${ci("Comercializadora","comercializadora",t.comercializadora)}
        ${ci("Nombre de la tarifa","nombre",t.nombre)}
        ${cs("Precio","modalidad",t.modalidad,[["fijo","Fijo"],["indexado","Indexado (precio estimado)"]])}
        ${ci("Permanencia (meses)","permanencia_meses",t.permanencia_meses,'inputmode="numeric"')}
      </div>
      ${t.tipo === "gas" ? `<div class="g4">${ci("Término fijo (€/día)","termino_fijo_dia",t.termino_fijo_dia,'inputmode="decimal"')}${ci("Energía (€/kWh)","pe1",t.pe1,'inputmode="decimal"')}</div>`
      : `<div class="ptable-w"><table class="ptable"><thead><tr><th>Periodo</th><th>Potencia (€/kW·día)</th><th>Energía (€/kWh)</th></tr></thead><tbody>${[1,2,3,4,5,6].map(i => `<tr class="${i > Math.max(per.pot, per.en) ? "off" : ""}"><td>P${i}</td><td><input type="text" inputmode="decimal" id="ct-pp${i}" data-ct="pp${i}" value="${esc(t["pp"+i])}" ${i > per.pot ? "disabled" : ""} aria-label="Potencia P${i}"></td><td><input type="text" inputmode="decimal" id="ct-pe${i}" data-ct="pe${i}" value="${esc(t["pe"+i])}" ${i > per.en ? "disabled" : ""} aria-label="Energía P${i}"></td></tr>`).join("")}</tbody></table></div>
      <div class="g4">${ci("SSAA que cobra aparte (€/kWh)","ssaa_kwh",t.ssaa_kwh,'inputmode="decimal"')}${ci("Compensación excedentes (€/kWh)","compensacion_kwh",t.compensacion_kwh,'inputmode="decimal"')}</div>`}
      <div class="g3">${ci("Comisión (tramos o importe)","comision_tramos",t.comision_tramos,'placeholder="5000:40; 15000:80; *:120"')}${ci("Valoración en el PDF","valoracion",t.valoracion,'placeholder="Precio fijo 12 meses"')}
        <label class="tog" for="ct-activo" style="align-self:end"><input type="checkbox" id="ct-activo" data-ct="activo" ${t.activo ? "checked" : ""}> Activa</label></div>
      <label class="f" for="ct-ventajas">Ventajas para el PDF (una por línea, **negrita**)<textarea id="ct-ventajas" data-ct="ventajas" rows="4">${esc(t.ventajas || "")}</textarea></label>
      <div class="okbar"><span class="note">${t.updated_at ? "Última modificación: " + esc(fechaCorta(t.updated_at)) : ""}</span>${t.id && admin ? '<button type="button" class="btn ghost" id="ctBorrar">Borrar</button>' : ""}<button type="button" class="btn light" id="ctCancelar">Cancelar</button><button type="button" class="btn gold" id="ctGuardar">Guardar tarifa</button></div>
    </section>` : ""}
  </div></div>`;
}
async function guardarTarifa(){
  const t = catSel; if (!t) return;
  const body = Object.assign({}, t);
  ["pp1","pp2","pp3","pp4","pp5","pp6","pe1","pe2","pe3","pe4","pe5","pe6","termino_fijo_dia","ssaa_kwh","compensacion_kwh"].forEach(k => body[k] = num(t[k]));
  body.permanencia_meses = Math.round(num(t.permanencia_meses));
  try{
    const r = await api("energia.php?recurso=tarifas", {method:"POST", body:JSON.stringify(body)});
    toast("Tarifa guardada: " + r.comercializadora + " · " + r.nombre);
    catSel = null; await cargarCatalogo(true); pintarCatalogo();
  } catch(err){ toast(err.message, 5000); }
}
async function borrarTarifa(btn){
  if (btn.dataset.confirm !== "1"){ btn.dataset.confirm = "1"; btn.textContent = "¿Borrar seguro?"; btn.style.color = "var(--red)"; setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "Borrar"; btn.style.color = ""; }, 3500); return; }
  try { await api("energia.php?recurso=tarifas&id=" + catSel.id, {method:"DELETE"}); toast("Tarifa borrada"); catSel = null; await cargarCatalogo(true); pintarCatalogo(); }
  catch(err){ toast(err.message, 5000); }
}

/* ================= eventos ================= */
function setPath(obj, path, value){
  const ks = path.split("."); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = value;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("button, [data-ctid], #drop"); if (!b) return;
  const d = b.dataset || {};
  if (b.id === "drop"){ $("#fileIn").click(); return; }
  if (d.extab){ exTab = d.extab; const m = document.querySelector(".stage.exp .main"); if (m){ m.className = "main tab-" + exTab; } document.querySelectorAll("[data-extab]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.extab === exTab))); if (exTab === "vista") fitPreview(); return; }
  if (b.id === "segCopia"){ hacerCopia(b); return; }
  if (d.descargar){ descargarCopia(d.descargar, b); return; }
  if (d.etapa){ irA(d.etapa); return; }
  if (d.goto){ if (d.goto === "catalogo"){ abrirCatalogo(); return; } irA(d.goto); return; }
  if ("volver" in d){ state.etapa = etapaPrevia; pintar(); return; }
  if ("back" in d){ const p = state.paso; state.paso = p === 5 ? (state.metodo === "manual" ? 3 : 4) : p - 1; pintar(); return; }
  if (d.tipo){ const cambia = state.tipo !== d.tipo; state.tipo = d.tipo; if (cambia || !PEAJES[state.tipo][state.cliente.peaje]) state.cliente.peaje = d.tipo === "gas" ? "RL.1" : "2.0TD"; state.paso = 2; guardarBorrador(); pintar(); return; }
  if (d.metodo){ state.metodo = d.metodo; state.paso = 3; guardarBorrador(); pintar(); return; }
  if (d.estudio){ state.estudio = d.estudio; state.paso = state.metodo === "manual" ? 5 : 4; guardarBorrador(); pintar(); return; }
  if (d.paso){ state.paso = +d.paso; guardarBorrador(); pintar(); return; }
  if (b.id === "btnSips"){ consultarSips($("#cupsIn").value); return; }
  if (b.id === "btnSips2"){ consultarSips(state.cliente.cups); return; }
  if (b.id === "btnComparar"){ irA("comparativa"); return; }
  if (d.star){ state.comp.estrella = +d.star; state.textos.ventajas = null; state.textos.motivo = ""; guardarBorrador(); pintarComparativa(); pintarStepper(); return; }
  if (b.id === "btnSave"){ guardarInforme(false); return; }
  if (b.id === "btnPdf"){ exportarPdf(); return; }
  if (b.id === "btnRefrescar"){ state.snap = null; guardarBorrador(); pintarExportar(); toast("Precios actualizados con el catálogo"); return; }
  if (b.id === "saveCons"){ try { localStorage.setItem("icc-energia-cargo:" + usuario.id, state.consultora.cargo || ""); } catch(err){} toast("Cargo guardado para tus próximos informes"); return; }
  if (d.load){ abrirInforme(d.load, false); return; }
  if (d.dup){ abrirInforme(d.dup, true); return; }
  if (d.delInf){ borrarInforme(d.delInf, b); return; }
  if (d.ctid){ const x = catalogo.find(t => String(t.id) === d.ctid); catSel = x ? clone(x) : null; pintarCatalogo(); const f = $("#ctForm"); if (f) f.scrollIntoView({behavior:"smooth", block:"start"}); return; }
  if (b.id === "ctNueva"){ catSel = tarifaVacia(); pintarCatalogo(); const f = $("#ctForm"); if (f) f.scrollIntoView({behavior:"smooth"}); return; }
  if (b.id === "ctCancelar"){ catSel = null; pintarCatalogo(); return; }
  if (b.id === "ctGuardar"){ guardarTarifa(); return; }
  if (b.id === "ctBorrar"){ borrarTarifa(b); return; }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#drop, [data-ctid]")){ e.preventDefault(); e.target.click(); }
  if (e.key === "Enter" && e.target.id === "cupsIn"){ e.preventDefault(); consultarSips(e.target.value); }
});
let tRender;
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.path && !el.dataset.struct){
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.path.startsWith("x.")) return;
    setPath(state, el.dataset.path, v);
    if (el.dataset.path === "cliente.inicio" || el.dataset.path === "cliente.fin"){ diasDesdeFechas(); const di = $("#f-cliente-dias"); if (di) di.value = state.cliente.dias; }
    refrescarRevision(); guardarBorrador(); return;
  }
  if (el.dataset.epath){ setPath(state, el.dataset.epath, el.value); clearTimeout(tRender); tRender = setTimeout(() => { renderInforme(); guardarBorrador(); }, 180); return; }
  if (el.dataset.tpath){ state.textos[el.dataset.tpath] = el.value; clearTimeout(tRender); tRender = setTimeout(() => { renderInforme(); guardarBorrador(); }, 180); return; }
  if (el.dataset.ct && catSel){ const k = el.dataset.ct; catSel[k] = el.type === "checkbox" ? el.checked : el.value; if (k === "tipo"){ catSel.peaje = el.value === "gas" ? "RL.1" : "2.0TD"; pintarCatalogo(); } else if (k === "peaje") pintarCatalogo(); return; }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "fileIn"){ const f = el.files && el.files[0]; el.value = ""; subirFactura(f); return; }
  if (el.dataset.path && el.dataset.struct){
    setPath(state, el.dataset.path, el.type === "checkbox" ? el.checked : el.value);
    guardarBorrador(); pintar(); return;
  }
  if (el.dataset.cmp){ state.comp[el.dataset.cmp] = el.type === "checkbox" ? el.checked : el.value; guardarBorrador(); pintarComparativa(); return; }
  if (el.dataset.mk){ const id = +el.dataset.mk, f = new Set(state.comp.fuera || []); el.checked ? f.delete(id) : f.add(id); state.comp.fuera = [...f]; guardarBorrador(); return; }
  if (el.dataset.ppdf){ const id = +el.dataset.ppdf, f = new Set(state.comp.propiasPdf || []); el.checked ? f.add(id) : f.delete(id); state.comp.propiasPdf = [...f]; guardarBorrador(); return; }
  if (el.dataset.cf){ catFiltro[el.dataset.cf] = el.value; if (el.dataset.cf === "tipo") catFiltro.peaje = ""; pintarCatalogo(); return; }
});
["dragover","dragenter"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d){ e.preventDefault(); d.classList.add("over"); } }));
document.addEventListener("dragleave", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", e => { const d = e.target.closest && e.target.closest("#drop"); if (d){ e.preventDefault(); d.classList.remove("over"); subirFactura(e.dataTransfer.files[0]); } });

$("#btnNew").addEventListener("click", () => { state = nuevoEstado(); state.presupuesto.numero = cfg.prefijo + cfg.siguiente; state.consultora = consultoraUsuario(); guardarBorrador(); pintar(); toast("Nuevo estudio"); });
$("#btnHist").addEventListener("click", async () => { if (!["informes","catalogo","seguridad"].includes(state.etapa)) etapaPrevia = state.etapa; state.etapa = "informes"; await cargarInformes(); pintar(); });
$("#btnCat").addEventListener("click", abrirCatalogo);
$("#btnSeg").addEventListener("click", async () => { if (!["informes","catalogo","seguridad"].includes(state.etapa)) etapaPrevia = state.etapa; state.etapa = "seguridad"; pintar(); });
$("#btnMenu").addEventListener("click", () => { const a = $("#acciones"), abierto = a.classList.toggle("open"); $("#btnMenu").setAttribute("aria-expanded", String(abierto)); });
document.addEventListener("click", e => { if (!e.target.closest("#acciones, #btnMenu")){ $("#acciones").classList.remove("open"); $("#btnMenu").setAttribute("aria-expanded","false"); } else if (e.target.closest("#acciones button, #acciones a")){ $("#acciones").classList.remove("open"); $("#btnMenu").setAttribute("aria-expanded","false"); } });
async function abrirCatalogo(){
  if (!["informes","catalogo","seguridad"].includes(state.etapa)) etapaPrevia = state.etapa;
  catFiltro.tipo = state.tipo; catFiltro.peaje = state.cliente.peaje;
  state.etapa = "catalogo"; await cargarCatalogo(true); pintar();
}

/* ================= sesión ================= */
function consultoraUsuario(){
  let cargo = CONSULTORA_DEF.cargo;
  try { const c = localStorage.getItem("icc-energia-cargo:" + (usuario && usuario.id)); if (c) cargo = c; } catch(e){}
  return {nombre:(usuario && usuario.nombre) || "", cargo, email:(usuario && usuario.email) || ""};
}
function guardarBorrador(){ if (!usuario) return; try { localStorage.setItem(LS + ":" + usuario.id, JSON.stringify(state)); } catch(e){} }
function mostrarLogin(){ $("#login").hidden = false; $("#app").hidden = true; setTimeout(() => { const e = $("#lg-email"); if (e) e.focus(); }, 50); }
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const msg = $("#lg-msg"); msg.textContent = "";
  try {
    await api("auth.php?action=login", {method:"POST", body:JSON.stringify({email:$("#lg-email").value.trim(), password:$("#lg-pass").value})});
    $("#lg-pass").value = "";
    const me = await api("auth.php?action=me");
    usuario = me && me.user; crmCliente = me && me.crm_cliente;
    if (!usuario){ msg.textContent = (me && me.aviso) || "No se pudo iniciar sesión."; return; }
    await arrancar();
  }
  catch(err){ msg.textContent = err.message; }
});
$("#btnSalir").addEventListener("click", async () => { try { await api("auth.php?action=logout", {method:"POST", body:"{}"}); } catch(e){} usuario = null; mostrarLogin(); });

async function arrancar(){
  $("#login").hidden = true; $("#app").hidden = false;
  $("#userName").textContent = usuario.nombre || usuario.email;
  $("#btnCat").hidden = !COMERCIALES.includes(usuario.rol);
  $("#btnSeg").hidden = true; // las copias de seguridad las gestiona el CRM
  try { const cf = await api("energia.php?recurso=config"); Object.assign(cfg, {prefijo:cf.prefijo, siguiente:cf.siguiente, ia:cf.ia, sips:cf.sips}); }
  catch(err){ if (err.status === 401){ mostrarLogin(); return; } }
  cfg.consultora = consultoraUsuario();
  await cargarCatalogo(false);
  let b = null;
  try { const raw = localStorage.getItem(LS + ":" + usuario.id); if (raw) b = JSON.parse(raw); } catch(e){}
  if (b && b.v === 1 && b.cliente){ state = Object.assign(nuevoEstado(), b); if (state.etapa === "catalogo" || state.etapa === "informes" || state.etapa === "seguridad") state.etapa = "factura"; }
  else { state = nuevoEstado(); state.presupuesto.numero = cfg.prefijo + cfg.siguiente; }
  if (!state.consultora || !state.consultora.nombre) state.consultora = consultoraUsuario();
  if (!state.presupuesto.numero) state.presupuesto.numero = cfg.prefijo + cfg.siguiente;
  if ((state.etapa === "comparativa" || state.etapa === "exportar") && !puedeComparar()) state.etapa = "factura";
  if (state.etapa === "exportar" && !resultados(state).star) state.etapa = "comparativa";
  // Abierto desde la ficha de un cliente del CRM: estudio nuevo con sus datos.
  if (crmCliente){
    state = nuevoEstado(); state.presupuesto.numero = cfg.prefijo + cfg.siguiente; state.consultora = consultoraUsuario();
    state.crmClienteId = crmCliente.id;
    Object.assign(state.cliente, {nombre:crmCliente.razon_social || "", cif:crmCliente.cif || "", direccion:crmCliente.direccion_suministro || "",
      tipoCliente:crmCliente.tipo_cliente === "residencial" ? "residencial" : "pyme"});
    guardarBorrador();
    toast("Estudio nuevo para " + (crmCliente.razon_social || "el cliente"));
  }
  history.replaceState(null, "", location.pathname);
  pintar();
  const informeUrl = PARAMS.get("informe");
  if (/^\d+$/.test(informeUrl || "")) await abrirInforme(informeUrl, false);
}
(async () => {
  try { const r = await api("auth.php?action=me"); usuario = r && r.user; crmCliente = r && r.crm_cliente; } catch(e){ usuario = null; }
  if (usuario) arrancar(); else mostrarLogin();
})();
})();
