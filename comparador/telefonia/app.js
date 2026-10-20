(function(){
"use strict";

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
function eur(n, dec = 2){
  const neg = n < 0; n = Math.abs(r2(n));
  let [i, d] = n.toFixed(dec).split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "−" : "") + i + (dec ? "," + d : "") + " €";
}
const pct = n => (Math.round(n * 10) / 10).toString().replace(".", ",") + " %";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso){ const d = new Date(iso + "T12:00:00"); if (isNaN(d)) return iso; return d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear(); }
function hoyISO(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
const corto = n => String(n || "").trim().split(/\s+/)[0] || "—";
const lc1 = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const clone = o => JSON.parse(JSON.stringify(o));
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "x";
function listaY(arr){ return arr.length <= 1 ? (arr[0] || "") : arr.slice(0,-1).join(", ") + " y " + arr[arr.length-1]; }

/* ================= catálogo de diagnósticos ================= */
const TAGS = {
  "SOBREDIMENSIONADA": {c:"a", cat:"servicio"},
  "PRECIO MEDIO":      {c:"g", cat:"servicio"},
  "CORRECTO":          {c:"g", cat:"servicio"},
  "CADUCARÁ":          {c:"a", cat:"servicio"},
  "PRESCINDIBLE":      {c:"r", cat:"extra"},
  "FUGA DE COSTE":     {c:"r", cat:"extra"},
  "CARGO OCULTO":      {c:"r", cat:"extra"},
  "REVISABLE":         {c:"r", cat:"extra"},
  "SE MANTIENE":       {c:"g", cat:"mantiene"},
  "PUNTUAL":           {c:"r", cat:"mantiene"}
};

/* ================= perfiles de tarifas de ejemplo (de los informes enviados) ================= */
const V1 = ["**2 líneas ilimitadas 5G** y MultiSIM para trabajar desde cualquier dispositivo.","**Soporte informático 24/7** y Secure Net incluidos.","**Vodafone TV con Netflix** y 200 minutos internacionales.","**Sin cargos sorpresa:** bloqueamos terceros, adultos y contenidos a la carta."];
const V2 = ["**2 líneas ilimitadas**: nunca más se quedará sin datos.","**Plataforma de streaming incluida**: Netflix, HBO Max, Disney+ o Prime Video.","**Red y atención de primer nivel** para su actividad.","**Sin seguro innecesario** y con vigilancia de subidas de precio."];
const op = (nombre, cuota, promoTexto, valoracion, extra) => Object.assign({nombre, cuota, promoPrecio:"", promoMeses:"", promoTexto, valoracion, residencial:false, ventajas:[], comision:""}, extra || {});
const BUILTIN_PERFILES = [
  { id:"ej-1gb-3moviles", nombre:"Fibra 1 Gb + fijo + 3 móviles + TV (ejemplo)",
    config:"fibra 1 Gb, fijo, 3 líneas móviles (2 con muchos datos) y TV",
    fechaTarifas:"2026-10-06",
    nota:"Digi: cobertura por verificar.",
    ops:[
      op("Vodafone Business",82.66,"Precio estable","2 líneas ilimitadas, soporte 24/7, MultiSIM, Netflix",{ventajas:V1}),
      op("Lowi",55,"Precio fijo","Residencial; sin atención de empresa",{residencial:true}),
      op("Digi",55,"—","Residencial; cobertura por verificar",{residencial:true}),
      op("O2",60,"Sin permanencia","Residencial; sin soporte de empresa",{residencial:true}),
      op("Telecable",71.90,"2.ª línea gratis","Solo Asturias; sin servicios de empresa"),
      op("MásMóvil Empresas",82.91,"","Sube tras la promoción; TV aparte",{promoPrecio:79.28,promoMeses:3}),
      op("Yoigo Empresas",91.86,"","Fuerte subida tras la promoción",{promoPrecio:61.61,promoMeses:3}),
      op("Orange Empresas",97.41,"Precio definitivo","La más cara; permanencia 12 meses")
    ]},
  { id:"ej-600mb-2moviles", nombre:"Fibra 500–600 Mb + fijo + 2 móviles + TV básica (ejemplo)",
    config:"fibra 500–600 Mb, fijo, 2 líneas móviles y TV básica",
    fechaTarifas:"2026-10-06",
    nota:"Digi: cobertura por verificar. Ahorros del primer año, sin seguro ni financiación.",
    ops:[
      op("Vodafone Business",52.06,"40,50 € hasta 2027","2 líneas ilimitadas + streaming incluido",{promoPrecio:40.50,promoMeses:3,ventajas:V2}),
      op("Lowi",40,"Precio fijo","Residencial; datos limitados",{residencial:true}),
      op("O2",50,"Sin permanencia","Residencial; 2.ª línea justa de datos",{residencial:true}),
      op("Digi",52,"—","Residencial; cobertura por verificar",{residencial:true}),
      op("Telecable",59.90,"2.ª línea gratis","Apenas varía su coste"),
      op("MásMóvil Empresas",64.60,"—","Más cara que su tarifa"),
      op("Yoigo Empresas",70.01,"","Oferta actual más cara que la suya",{promoPrecio:55.01,promoMeses:3}),
      op("Orange Empresas",81.68,"Precio definitivo","La más cara para su perfil")
    ]}
];
// Datos para calcular la comisión en los perfiles de ejemplo (editables en cada operadora).
BUILTIN_PERFILES[0].ops.forEach(o => { o.fibra = 1000; o.lineas = "∞, ∞, 25"; if (/yoigo/i.test(o.nombre)) o.lineasGratis = 1; });
BUILTIN_PERFILES[1].ops.forEach(o => { o.fibra = 600; o.lineas = "∞, ∞"; if (/yoigo/i.test(o.nombre)) o.lineasGratis = 1; });
const CONSULTORA_DEF = {nombre:"María Álvarez", cargo:"Consultora senior de optimización de telecomunicaciones", email:"maria.alvarez@integralconnectionconsulting.es"};

const EJEMPLOS = [
  { etiqueta:"María L. · Movistar (ejemplo)", state:{
    cliente:{nombre:"María L.", ubicacion:"Gijón (Asturias)", operador:"Movistar Fusión Total Plus", periodo:"18 jul – 17 ago 2026"},
    presupuesto:{numero:"ICC-09-2838363", fecha:"2026-10-06", validez:30},
    lineas:[
      {concepto:"Cuota Fusión Total Plus (fibra 1 Gb, fijo, 3 móviles, TV)", importe:218, tag:"SOBREDIMENSIONADA"},
      {concepto:"Paquete Adultos", importe:20, tag:"PRESCINDIBLE"},
      {concepto:"Contenidos de TV a la carta", importe:67.5, tag:"FUGA DE COSTE"},
      {concepto:"Cargos de terceros y llamadas fuera de tarifa", importe:10.54, tag:"CARGO OCULTO"}],
    anterior:{importe:"", mes:""},
    perfil:clone(BUILTIN_PERFILES[0]), rec:0, propuestaNota:"" }},
  { etiqueta:"Andrea Alonso · Yoigo (ejemplo)", state:{
    cliente:{nombre:"Andrea Alonso Díaz", ubicacion:"Gijón (Asturias)", operador:"Yoigo Empresas", periodo:"Agosto 2026"},
    presupuesto:{numero:"ICC-09-2838364", fecha:"2026-10-06", validez:30},
    lineas:[
      {concepto:"Fibra 600 Mb + fijo + móvil 80 GB", importe:53.24, tag:"PRECIO MEDIO"},
      {concepto:"TV Premium", importe:6, tag:"CORRECTO"},
      {concepto:"2.ª línea (6 €) con descuento temporal (−6 €)", importe:0, tag:"CADUCARÁ"},
      {concepto:"Seguro de dispositivo", importe:4, tag:"REVISABLE"},
      {concepto:"Financiación de 3 terminales", importe:9, tag:"SE MANTIENE"}],
    anterior:{importe:64.21, mes:"marzo"},
    perfil:clone(BUILTIN_PERFILES[1]), rec:0,
    propuestaNota:"Gana 2 líneas ilimitadas (hoy tiene 80 GB + 50 GB) y una plataforma de streaming." }}
];

function baseState(){
  return Object.assign({
    id:null, ahorroEtiqueta:"Ahorro anual estimado", obs:null,
    consultora:clone(cfg.consultora || CONSULTORA_DEF)
  }, clone(EJEMPLOS[0].state));
}

/* ================= estado ================= */
let cfg = {consultora:clone(CONSULTORA_DEF), prefijo:"ICC-09-", siguiente:2838365};
let state;
let usuario = null;
let savedPerfiles = [];   // perfiles de tarifas guardados en el servidor
let informes = [];        // resumen de informes visibles para el usuario
const LS = "icc-informe-borrador";
state = baseState();

/* ================= comisiones (MR_comisiones.xlsx) =================
   Grupo +O (hojas NEKSUS y ORANGE) y Vodafone (anexo VS0626). Importes por venta.
   Las marcas sin hoja (Lowi, Adamo, Avatel, Digi, O2, Telecable…) quedan "sin dato"
   y se pueden escribir a mano en cada operadora. */
const MARCAS = ["Vodafone","Yoigo","MásMóvil","Jazztel","Orange","Pepephone","Lowi","Adamo","Avatel","Digi","O2","Telecable","Movistar","Otra"];
const GRUPO_O = ["Yoigo","MásMóvil","Jazztel","Pepephone","Orange","Simyo","Telecable","Euskaltel"];
function detectaMarca(txt){
  const t = String(txt || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const pares = [["vodafone","Vodafone"],["lowi","Lowi"],["yoigo","Yoigo"],["masmovil","MásMóvil"],["mas movil","MásMóvil"],["jazztel","Jazztel"],["orange","Orange"],["pepephone","Pepephone"],["adamo","Adamo"],["caaalma","Adamo"],["avatel","Avatel"],["digi","Digi"],["o2","O2"],["telecable","Telecable"],["movistar","Movistar"],["simyo","Simyo"],["euskaltel","Euskaltel"]];
  for (const [k,v] of pares) if (t.includes(k)) return v;
  return "";
}
function parseGB(x){
  const t = String(x).trim().toLowerCase();
  if (!t) return null;
  if (/∞|inf|ilim/.test(t)) return Infinity;
  const n = parseFloat(t.replace(",", "."));
  return isFinite(n) ? n : null;
}
/* Valores por defecto (los mismos que sql/004). En la web se sustituyen por la
   tabla `comisiones` de la base de datos al cargar la página. */
const COMISIONES_DEFECTO = [{"marca": "Yoigo", "concepto": "fibra", "tramo": "2000", "importe": 47.25, "importe_alta": null}, {"marca": "Yoigo", "concepto": "fibra", "tramo": "1000", "importe": 43.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "fibra", "tramo": "600", "importe": 36.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "fibra", "tramo": "500", "importe": 36.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "fibra", "tramo": "400", "importe": 29.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "fibra", "tramo": "300", "importe": 29.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "movil", "tramo": "40", "importe": 8.75, "importe_alta": null}, {"marca": "Yoigo", "concepto": "movil", "tramo": "90", "importe": 10.5, "importe_alta": null}, {"marca": "Yoigo", "concepto": "movil", "tramo": "mas90", "importe": 14, "importe_alta": null}, {"marca": "Yoigo", "concepto": "movil", "tramo": "ilimitada", "importe": 17.5, "importe_alta": null}, {"marca": "Yoigo", "concepto": "extra_portabilidad", "tramo": "fibra", "importe": 14, "importe_alta": null}, {"marca": "Yoigo", "concepto": "extra_portabilidad", "tramo": "linea", "importe": 14, "importe_alta": null}, {"marca": "Yoigo", "concepto": "extra_empresa", "tramo": "linea", "importe": 7, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "fibra", "tramo": "1000", "importe": 23.625, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "fibra", "tramo": "600", "importe": 18.725, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "fibra", "tramo": "500", "importe": 18.725, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "fibra", "tramo": "400", "importe": 13.825, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "fibra", "tramo": "300", "importe": 13.825, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "movil", "tramo": "40", "importe": 8.75, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "movil", "tramo": "90", "importe": 10.5, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "movil", "tramo": "mas90", "importe": 14, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "movil", "tramo": "ilimitada", "importe": 17.5, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "extra_portabilidad", "tramo": "fibra", "importe": 14, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "extra_portabilidad", "tramo": "linea", "importe": 14, "importe_alta": null}, {"marca": "MásMóvil", "concepto": "extra_empresa", "tramo": "linea", "importe": 7, "importe_alta": null}, {"marca": "Jazztel", "concepto": "fibra", "tramo": "1000", "importe": 29.75, "importe_alta": null}, {"marca": "Jazztel", "concepto": "fibra", "tramo": "600", "importe": 22.75, "importe_alta": null}, {"marca": "Jazztel", "concepto": "fibra", "tramo": "500", "importe": 22.75, "importe_alta": null}, {"marca": "Jazztel", "concepto": "fibra", "tramo": "400", "importe": 19.25, "importe_alta": null}, {"marca": "Jazztel", "concepto": "fibra", "tramo": "300", "importe": 19.25, "importe_alta": null}, {"marca": "Jazztel", "concepto": "movil", "tramo": "40", "importe": 8.75, "importe_alta": null}, {"marca": "Jazztel", "concepto": "movil", "tramo": "90", "importe": 10.5, "importe_alta": null}, {"marca": "Jazztel", "concepto": "movil", "tramo": "mas90", "importe": 14, "importe_alta": null}, {"marca": "Jazztel", "concepto": "movil", "tramo": "ilimitada", "importe": 17.5, "importe_alta": null}, {"marca": "Jazztel", "concepto": "extra_portabilidad", "tramo": "fibra", "importe": 14, "importe_alta": null}, {"marca": "Jazztel", "concepto": "extra_portabilidad", "tramo": "linea", "importe": 14, "importe_alta": null}, {"marca": "Jazztel", "concepto": "extra_empresa", "tramo": "linea", "importe": 7, "importe_alta": null}, {"marca": "Pepephone", "concepto": "fibra", "tramo": "1000", "importe": 19.25, "importe_alta": null}, {"marca": "Pepephone", "concepto": "fibra", "tramo": "600", "importe": 15.225, "importe_alta": null}, {"marca": "Pepephone", "concepto": "fibra", "tramo": "500", "importe": 15.225, "importe_alta": null}, {"marca": "Pepephone", "concepto": "fibra", "tramo": "400", "importe": 10.325, "importe_alta": null}, {"marca": "Pepephone", "concepto": "fibra", "tramo": "300", "importe": 10.325, "importe_alta": null}, {"marca": "Pepephone", "concepto": "movil", "tramo": "40", "importe": 8.75, "importe_alta": null}, {"marca": "Pepephone", "concepto": "movil", "tramo": "90", "importe": 10.5, "importe_alta": null}, {"marca": "Pepephone", "concepto": "movil", "tramo": "mas90", "importe": 14, "importe_alta": null}, {"marca": "Pepephone", "concepto": "movil", "tramo": "ilimitada", "importe": 17.5, "importe_alta": null}, {"marca": "Pepephone", "concepto": "extra_portabilidad", "tramo": "fibra", "importe": 14, "importe_alta": null}, {"marca": "Pepephone", "concepto": "extra_portabilidad", "tramo": "linea", "importe": 14, "importe_alta": null}, {"marca": "Pepephone", "concepto": "extra_empresa", "tramo": "linea", "importe": 7, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "2000", "importe": 47.25, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "1000", "importe": 43.75, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "600", "importe": 36.75, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "500", "importe": 36.75, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "400", "importe": 29.75, "importe_alta": null}, {"marca": "Orange", "concepto": "fibra", "tramo": "300", "importe": 29.75, "importe_alta": null}, {"marca": "Orange", "concepto": "movil", "tramo": "40", "importe": 8.75, "importe_alta": null}, {"marca": "Orange", "concepto": "movil", "tramo": "90", "importe": 10.5, "importe_alta": null}, {"marca": "Orange", "concepto": "movil", "tramo": "mas90", "importe": 14, "importe_alta": null}, {"marca": "Orange", "concepto": "movil", "tramo": "ilimitada", "importe": 17.5, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_portabilidad", "tramo": "fibra", "importe": 3.5, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_portabilidad", "tramo": "linea", "importe": 3.5, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_empresa", "tramo": "1", "importe": 5.25, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_empresa", "tramo": "3", "importe": 7, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_empresa", "tramo": "5", "importe": 8.75, "importe_alta": null}, {"marca": "Orange", "concepto": "extra_empresa", "tramo": "10", "importe": 14, "importe_alta": null}, {"marca": "Orange", "concepto": "descuento_digi", "tramo": "fibra", "importe": -25, "importe_alta": null}, {"marca": "Vodafone", "concepto": "fibra", "tramo": "1000", "importe": 76.55, "importe_alta": null}, {"marca": "Vodafone", "concepto": "fibra", "tramo": "600", "importe": 54.7, "importe_alta": null}, {"marca": "Vodafone", "concepto": "movil_principal", "tramo": "ilimitada", "importe": 90.15, "importe_alta": 45.05}, {"marca": "Vodafone", "concepto": "movil_principal", "tramo": "300", "importe": 75.1, "importe_alta": 37.55}, {"marca": "Vodafone", "concepto": "movil_principal", "tramo": "160", "importe": 60.1, "importe_alta": 30.05}, {"marca": "Vodafone", "concepto": "movil_principal", "tramo": "60", "importe": 45.05, "importe_alta": 22.55}, {"marca": "Vodafone", "concepto": "movil_2a4", "tramo": "ilimitada", "importe": 26.3, "importe_alta": 13.15}, {"marca": "Vodafone", "concepto": "movil_2a4", "tramo": "300", "importe": 21.9, "importe_alta": 10.95}, {"marca": "Vodafone", "concepto": "movil_2a4", "tramo": "160", "importe": 17.5, "importe_alta": 8.75}, {"marca": "Vodafone", "concepto": "movil_2a4", "tramo": "60", "importe": 13.15, "importe_alta": 6.55}, {"marca": "Vodafone", "concepto": "movil_5mas", "tramo": "ilimitada", "importe": 53, "importe_alta": 26.5}, {"marca": "Vodafone", "concepto": "movil_5mas", "tramo": "300", "importe": 44.2, "importe_alta": 22.1}, {"marca": "Vodafone", "concepto": "movil_5mas", "tramo": "160", "importe": 35.35, "importe_alta": 17.65}, {"marca": "Vodafone", "concepto": "movil_5mas", "tramo": "60", "importe": 26.5, "importe_alta": 13.25}];
let COMISIONES = COMISIONES_DEFECTO;
let CM = construirCM(COMISIONES);
function construirCM(filas){
  const m = {};
  (filas || []).forEach(f => {
    const a = m[f.marca] || (m[f.marca] = {});
    const c = a[f.concepto] || (a[f.concepto] = {});
    c[String(f.tramo)] = (f.importe_alta === null || f.importe_alta === undefined || f.importe_alta === "") ? num(f.importe) : [num(f.importe), num(f.importe_alta)];
  });
  return m;
}
function porVelocidad(tabla, fibra){
  const ks = Object.keys(tabla).map(Number).filter(isFinite).sort((a,b)=>b-a);
  for (const k of ks) if (fibra >= k) return num(tabla[k]);
  return ks.length ? num(tabla[ks[ks.length-1]]) : 0;
}
const tramoO = gb => gb === Infinity ? "ilimitada" : gb > 90 ? "mas90" : gb > 40 ? "90" : "40";
const tramoVF = gb => gb === Infinity ? "ilimitada" : gb >= 300 ? "300" : gb >= 160 ? "160" : gb >= 60 ? "60" : null;
/* Devuelve {total, nota} o null si no hay comisiones para esa marca/configuración. */
function comisionAuto(o, s){
  const marca = o.marca || detectaMarca(o.nombre);
  const lineas = String(o.lineas || "").split(/[,;+]/).map(parseGB).filter(v => v !== null);
  const fibra = num(o.fibra) || 0;
  const R = CM[marca];
  if (!marca || !R || (!lineas.length && !fibra)) return null;
  const gratis = Math.max(0, Math.min(lineas.length, Math.round(num(o.lineasGratis))));
  const pagadas = lineas.slice(0, lineas.length - gratis);
  const origen = detectaMarca(s.cliente.operador);
  const porta = !s.altasNuevas;
  const empresa = !o.residencial;
  if (R.movil){ // esquema grupo +O
    const fueraO = porta && !GRUPO_O.includes(origen);
    const ep = R.extra_portabilidad || {};
    let t = (fibra && R.fibra) ? porVelocidad(R.fibra, fibra) + (fueraO ? num(ep.fibra) : 0) : 0;
    if (origen === "Digi" && fibra && lineas.length && R.descuento_digi) t += num(R.descuento_digi.fibra);
    let extraEmp = 0;
    if (empresa && R.extra_empresa){
      const e = R.extra_empresa;
      if (e.linea !== undefined) extraEmp = num(e.linea);
      else { const n = pagadas.length; const k = Object.keys(e).map(Number).filter(isFinite).sort((a,b)=>b-a).find(x => n >= x); extraEmp = num(e[k !== undefined ? k : Object.keys(e)[0]]); }
    }
    pagadas.forEach(gb => { t += num(R.movil[tramoO(gb)]) + (fueraO ? num(ep.linea) : 0) + extraEmp; });
    return {total:r2(t), nota: fueraO ? "con portabilidad de fuera del grupo +O" : (porta ? "portabilidad dentro del grupo +O, sin extra" : "altas nuevas")};
  }
  if (R.movil_principal){ // esquema Vodafone (anexo de residencial)
    if (empresa) return null;
    const k = (porta && !["Vodafone","Lowi"].includes(origen)) ? 0 : 1;
    const v = x => Array.isArray(x) ? x[k] : num(x);
    let t = (fibra && R.fibra) ? porVelocidad(R.fibra, fibra) : 0;
    pagadas.forEach((gb, idx) => {
      const b = tramoVF(gb); if (!b) return;
      const tabla = idx === 0 ? R.movil_principal : idx < 4 ? R.movil_2a4 : R.movil_5mas;
      if (tabla && tabla[b] !== undefined) t += v(tabla[b]);
    });
    return {total:r2(t), nota: k === 0 ? "líneas por portabilidad" : "altas nuevas"};
  }
  return null;
}
function comisionDe(o, s){
  if (o.comision !== "" && o.comision != null && isFinite(num(o.comision)) && String(o.comision).trim() !== "") return {total:num(o.comision), manual:true};
  const a = comisionAuto(o, s);
  return a ? Object.assign(a, {manual:false}) : null;
}

/* ================= cálculo ================= */
function calcular(s){
  const L = s.lineas.map(l => ({...l, importe:num(l.importe), cat:(TAGS[l.tag]||{}).cat || "servicio"}));
  const sum = cat => r2(L.filter(l => l.cat === cat).reduce((a,l) => a + l.importe, 0));
  const servicios = sum("servicio"), extras = sum("extra"), mantiene = sum("mantiene");
  const total = r2(servicios + extras + mantiene);
  const pagaHoy = r2(servicios + extras);
  const anualHoy = r2(pagaHoy * 12);
  const ops = s.perfil.ops.map((o, i) => {
    const cuota = num(o.cuota), pp = num(o.promoPrecio), pm = Math.min(12, Math.max(0, Math.round(num(o.promoMeses))));
    const conPromo = pp > 0 && pm > 0;
    const meses = s.estudio === "24m" ? 24 : 12;
    const coste = r2((conPromo ? pp*pm + cuota*(meses-pm) : cuota*meses) * 12 / meses);
    const promoTxt = (o.promoTexto && o.promoTexto.trim()) ? o.promoTexto : (conPromo ? eur(pp) + " × " + pm + " meses" : "—");
    return {...o, i, cuota, coste, ahorro:r2(anualHoy - coste), promoTxt, conPromo};
  });
  const rec = ops[Math.min(Math.max(0, s.rec|0), ops.length-1)] || null;
  // Primer año: factura contra factura (cuota final). 24 meses: media real con la subida tras la promoción.
  const ahorroAnual = rec ? (s.estudio === "24m" ? rec.ahorro : r2((pagaHoy - rec.cuota) * 12)) : 0;
  const difMes = r2(ahorroAnual / 12);
  const ahorroPrimerAno = rec ? r2(anualHoy - rec.coste) : 0;
  const minCuota = ops.length ? Math.min(...ops.map(o => o.cuota)) : 0;
  return {L, servicios, extras, mantiene, total, pagaHoy, anualHoy, ops, rec, difMes, ahorroAnual, ahorroPrimerAno, minCuota};
}

/* ================= textos automáticos ================= */
function observacionesAuto(s, c){
  const out = [];
  const cuotaPrincipal = c.L.filter(l => l.cat === "servicio").sort((a,b) => b.importe - a.importe)[0];
  if (cuotaPrincipal && c.minCuota > 0 && c.servicios >= c.minCuota * 1.5){
    const ratio = c.servicios / c.minCuota;
    out.push({t: ratio >= 2 ? "Cuota " + (Math.round(ratio*10)/10).toString().replace(".",",") + " veces por encima del mercado" : "Cuota un " + Math.round((ratio-1)*100) + " % por encima del mercado",
              b: "Solo los servicios cuestan " + eur(c.servicios) + "/mes; el mercado ofrece una configuración equivalente desde " + eur(c.minCuota) + "."});
  }
  if (num(s.anterior.importe) > 0 && c.total > num(s.anterior.importe)){
    const sub = (c.total / num(s.anterior.importe) - 1) * 100;
    out.push({t:"+" + pct(sub) + " desde " + (s.anterior.mes || "la factura anterior"),
              b:"De " + eur(num(s.anterior.importe)) + (s.anterior.mes ? " en " + s.anterior.mes : "") + " a " + eur(c.total) + ", sin cambiar el servicio."});
  }
  const extrasL = c.L.filter(l => l.cat === "extra" && l.importe > 0);
  if (extrasL.length){
    out.push({t: eur(c.extras*12) + " al año en extras",
              b: listaY(extrasL.map((l,i) => i ? lc1(l.concepto) : l.concepto)) + ": " + (extrasL.length > 1 ? "cargos prescindibles, sin control." : "un cargo prescindible.")});
  }
  const cad = c.L.find(l => l.tag === "CADUCARÁ");
  if (cad) out.push({t:"Descuento con fecha de caducidad", b:"Cuando termine, «" + cad.concepto.replace(/\s*\(.*$/,"") + "» volverá a cobrarse a precio completo."});
  if (c.L.some(l => l.tag === "CARGO OCULTO")) out.push({t:"Factura imprevisible", b:"Los consumos variables no tienen límite ni aviso."});
  if (out.length < 3 && c.rec) out.push({t:"Tarifa estable con " + corto(c.rec.nombre), b:"Pasará a una cuota cerrada de " + eur(c.rec.cuota) + " al mes, con vigilancia de subidas de precio."});
  if (out.length < 3) out.push({t:"Gestión sin llamadas", b:"Nos ocupamos de la portabilidad, la baja y la revisión de la primera factura."});
  return out.slice(0,3);
}

function textoDiagnostico(c){
  let t = "<b>Paga " + eur(c.total) + " al mes";
  const mant = c.L.filter(l => l.cat === "mantiene" && l.importe > 0);
  const extr = c.L.filter(l => l.cat === "extra" && l.importe > 0);
  if (mant.length || (extr.length && c.extras/c.total < .15)){
    const parts = [eur(c.servicios) + " de servicios"];
    extr.forEach(l => parts.push(eur(l.importe) + " de " + lc1(l.concepto).replace(/^seguro de dispositivo$/,"seguro")));
    mant.forEach(l => parts.push(eur(l.importe) + " de " + lc1(l.concepto).replace(/ de \d+ terminales?$/," de terminales")));
    t += ": " + listaY(parts) + ".</b>";
  } else if (extr.length){
    const f = c.extras / c.total;
    const frase = f > .5 ? "Más de la mitad" : f > .4 ? "Casi la mitad" : f > .34 ? "Más de un tercio" : f > .28 ? "Casi un tercio" : f > .24 ? "Una cuarta parte" : "El " + Math.round(f*100) + " %";
    t += ". " + frase + " (" + eur(c.extras) + ") son cargos que no aportan valor" + (state.wz && state.wz.tipo === "hogar" ? "" : " a su negocio") + ".</b>";
  } else t += ".</b>";
  if (state.anterior && num(state.anterior.importe) > 0 && c.total > num(state.anterior.importe))
    t += " Su factura ha subido un " + pct((c.total / num(state.anterior.importe) - 1) * 100) + (state.anterior.mes ? " desde " + esc(state.anterior.mes) : "") + ".";
  return t;
}
function textoComparativa(c){
  const mejoran = c.ops.filter(o => o.ahorro > 0);
  const rn = c.rec ? c.rec.nombre : "";
  if (mejoran.length === c.ops.length && c.ops.length){
    const minA = Math.min(...c.ops.map(o => o.ahorro));
    const umbral = minA >= 1000 ? Math.floor(minA/100)*100 : minA >= 100 ? Math.floor(minA/10)*10 : Math.floor(minA);
    return "<b>Todas las alternativas le ahorran más de " + eur(umbral,0) + " al año. " + esc(rn) + " es la que mejor combina prestaciones" + (state.wz && state.wz.tipo === "hogar" ? "" : " de empresa") + " y ahorro.</b>";
  }
  const peor = Math.min(...c.ops.map(o => o.ahorro));
  return "<b>Solo " + mejoran.length + " de las " + c.ops.length + " operadoras mejoran su tarifa actual" + (peor < 0 ? "; cambiar sin asesoramiento podría encarecerla hasta " + eur(Math.floor(-peor),0) + " al año." : ".") + "</b> " + esc(rn) + " le da más prestaciones y reduce su coste.";
}
function textoPropuesta(s, c){
  const r = c.rec; if (!r) return "";
  const extrasN = c.L.filter(l => l.cat === "extra" && l.importe > 0);
  let t = "<b>Con " + esc(r.nombre) + (extrasN.length && c.mantiene > 0 ? " y sin " + esc(lc1(extrasN.map(l=>l.concepto.replace(/ de dispositivo$/,"")).join(" ni "))) : "") +
          ", su factura " + (c.difMes >= 0 ? "baja" : "pasa") + " de " + eur(c.pagaHoy) + " a " + eur(r.cuota) + " al mes</b>";
  t += s.propuestaNota ? ". " + esc(s.propuestaNota.trim().replace(/\.$/,"")) + "." : ", con una tarifa estable y soporte para empresa.";
  const masBaratas = c.ops.filter(o => o.i !== r.i && o.residencial && o.cuota < r.cuota - 0.5);
  if (masBaratas.length){
    const d = masBaratas.map(o => r.cuota - o.cuota);
    const a = Math.round(Math.min(...d)), b = Math.round(Math.max(...d));
    t += " " + esc(listaY(masBaratas.map(o => corto(o.nombre)))) + (masBaratas.length > 1 ? " cuestan " : " cuesta ") +
         (a === b ? a + " €" : "entre " + a + " € y " + b + " €") + " menos al mes, pero " + (masBaratas.length > 1 ? "son ofertas residenciales" : "es una oferta residencial") + " sin servicios para empresa.";
  }
  c.L.filter(l => l.cat === "mantiene" && l.importe > 0 && l.tag !== "PUNTUAL").forEach(l => {
    t += " " + esc(l.concepto.replace(/ de \d+ terminales?/, " de sus terminales")) + " (" + eur(l.importe) + " al mes) sigue igual hasta su vencimiento.";
  });
  return t;
}

/* ================= render del informe ================= */
const HEX = (w) => `<svg width="${w}" height="${w}" viewBox="0 0 64 64"><defs><linearGradient id="hxg${w}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c040"/><stop offset=".55" stop-color="#d9a21f"/><stop offset="1" stop-color="#a87810"/></linearGradient></defs><polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill="url(#hxg${w})"/><polygon points="32,10 51,21 51,43 32,54 13,43 13,21" fill="#fff"/><text x="32" y="40.5" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="21" letter-spacing="-1" fill="#1a202c">IC</text></svg>`;

function render(){
  const s = state, c = calcular(s);
  const head = `<header class="ph"><div class="logo"><img src="logo.png" alt="Integral Connection Consulting"></div>
    <div class="meta">Presupuesto <b>${esc(s.presupuesto.numero)}</b><br>Emitido el <b>${esc(fechaLarga(s.presupuesto.fecha))}</b> · Válido ${num(s.presupuesto.validez)||30} días</div></header>`;
  const foot = n => `<footer class="pf"><span>Integral Connection Consulting · Informe de auditoría de telecomunicaciones · ${esc(s.cliente.nombre)}</span><span>Página ${n} de 3</span></footer>`;
  const r = c.rec;
  const recN = r ? r.nombre : "—";
  const subHoy = c.mantiene > 0 ? "al mes · sin " + lc1(c.L.filter(l=>l.cat==="mantiene").map(l=>l.concepto.replace(/ de \d+ terminales?/,"")).join(" ni ")) : "al mes · " + eur(c.anualHoy) + " al año";
  const obs = (s.obs && s.obs.length) ? s.obs : observacionesAuto(s, c);
  const etiqueta = (s.ahorroEtiqueta || "Ahorro anual estimado");

  /* ---------- página 1 ---------- */
  const p1 = `<section class="pg">${head}
    <div class="hero">
      <div class="eyebrow">Informe de auditoría y optimización · 9 años optimizando costes de empresas</div>
      <h1>Informe de Auditoría y Optimización de Telecomunicaciones</h1>
      <p><b>Trabajamos con el 100 % de los servicios y el 100 % de las compañías</b> para garantizar la solución perfecta para ${s.wz && s.wz.tipo === "hogar" ? "su hogar" : "su negocio"}.</p>
      <div class="hmeta">
        <div><small>Cliente</small><b>${esc(s.cliente.nombre)}</b></div>
        <div><small>Ubicación</small><b>${esc(s.cliente.ubicacion)}</b></div>
        <div><small>Operador actual</small><b>${esc(s.cliente.operador)}</b></div>
        <div><small>Factura analizada</small><b>${esc(s.cliente.periodo)}</b></div>
      </div>
    </div>
    <div class="gbar"></div>
    <div class="kpis">
      <div class="kpi k1"><small>Lo que paga hoy</small><div class="big">${eur(c.pagaHoy)}</div><span>${esc(subHoy)}</span></div>
      <div class="kpi k2"><small>Con nuestra propuesta</small><div class="big">${r ? eur(r.cuota) : "—"}</div><span>al mes · ${esc(recN)}</span></div>
      <div class="kpi k3"><small>${esc(etiqueta)}</small><div class="big">${eur(c.ahorroAnual)}</div><span>${eur(c.difMes)} al mes × 12 meses · IVA incl.</span></div>
    </div>
    <div class="sec"><div class="num">1</div><h2>Diagnóstico: lo que está pagando</h2></div>
    <p class="lead">${textoDiagnostico(c)}</p>
    <table class="t"><thead><tr><th>Concepto</th><th class="r">Importe / mes (IVA incl.)</th><th style="width:150px">Diagnóstico</th></tr></thead><tbody>
      ${c.L.map(l => `<tr><td>${esc(l.concepto)}</td><td class="r">${eur(l.importe)}</td><td><span class="tag ${(TAGS[l.tag]||{c:"g"}).c}">${esc(l.tag)}</span></td></tr>`).join("")}
      <tr class="total"><td>Total factura</td><td class="r">${eur(c.total)}</td><td></td></tr>
    </tbody></table>
    <div class="cards3">${obs.map(o => `<div class="ic"><b>${esc(o.t)}</b><span>${esc(o.b)}</span></div>`).join("")}</div>
    ${foot(1)}</section>`;

  /* ---------- página 2 ---------- */
  const sorted = [...c.ops].sort((a,b) => a.coste - b.coste);
  const W = 470, rowH = 30;
  const maxV = Math.max(c.anualHoy, ...c.ops.map(o => o.coste)) * 1.0 || 1;
  const scale = v => Math.max(2, v / maxV * W);
  const chartH = sorted.length * rowH;
  const todayX = 174 + scale(c.anualHoy);
  const bars = sorted.map((o, k) => `<div class="bar-row${r && o.i === r.i ? " hi" : ""}" style="top:${k*rowH}px"><div class="lab">${esc(corto(o.nombre))}</div><div class="bar" style="width:${scale(o.coste)}px"></div><div class="val">${eur(o.coste)}</div></div>`).join("");
  const tableRows = [];
  if (r) tableRows.push(r);
  c.ops.forEach(o => { if (!r || o.i !== r.i) tableRows.push(o); });
  const nombres = c.ops.map(o => corto(o.nombre));
  const p2 = `<section class="pg">${head}
    <div class="sec" style="margin-top:28px"><div class="num">2</div><h2>Comparativa de mercado: ${c.ops.length} operadoras</h2></div>
    <p class="lead">${textoComparativa(c)}</p>
    <div class="chart" style="--ch:${chartH + 34}px">${bars}
      <div class="today" style="left:${todayX}px;height:${chartH + 8}px"></div>
      <div class="today-l" style="left:${todayX + 2}px;top:${chartH + 10}px">Hoy: ${eur(c.anualHoy)} / año</div>
    </div>
    <p class="cap">${s.estudio === "24m" ? "Coste anual medio en 24 meses, con IVA incluido, contando la subida al acabar cada promoción" : "Coste del primer año con IVA incluido"} para una configuración equivalente a la actual. Línea roja: lo que paga hoy.</p>
    <table class="t t2"><thead><tr><th>Operador</th><th class="r">Cuota / mes</th><th>Promoción</th><th class="r">Coste anual</th><th class="r">Ahorro anual</th><th>Valoración</th></tr></thead><tbody>
      ${tableRows.map(o => {
        const isRec = r && o.i === r.i;
        return `<tr class="${isRec ? "rec" : ""}"><td style="width:118px">${isRec ? '<span class="star">★</span> ' : ""}${esc(o.nombre)}</td><td class="r">${eur(o.cuota)}</td><td style="width:104px">${esc(o.promoTxt)}</td><td class="r">${eur(o.coste)}</td><td class="r ${o.ahorro >= 0 ? "pos" : "neg"}">${eur(o.ahorro)}</td><td class="val" style="width:178px">${esc(o.valoracion)}</td></tr>`;
      }).join("")}
      <tr class="now"><td>Situación actual (${esc(corto(s.cliente.operador))})</td><td class="r">${eur(c.pagaHoy)}</td><td>—</td><td class="r">${eur(c.anualHoy)}</td><td class="r">—</td><td class="val">${c.L.some(l=>l.tag==="CARGO OCULTO") ? "Gasto variable sin límite" : c.mantiene > 0 ? "Sin " + esc(lc1(c.L.filter(l=>l.cat==="mantiene").map(l=>l.concepto.replace(/ de \d+ terminales?/,"")).join(" ni "))) : "Precio actual"}</td></tr>
    </tbody></table>
    <p class="fn">Importes con IVA (21 %) incluido. Tarifas publicadas a ${esc(fechaLarga(s.perfil.fechaTarifas || s.presupuesto.fecha))} por ${esc(listaY(nombres))}; las líneas adicionales y la TV no publicadas en el pack son estimaciones.${s.perfil.nota ? " " + esc(s.perfil.nota) : ""} Configuración comparada: ${esc(s.perfil.config)}.</p>
    ${foot(2)}</section>`;

  /* ---------- página 3 ---------- */
  const k = s.consultora;
  const ventajas = (r && r.ventajas && r.ventajas.filter(Boolean).length) ? r.ventajas.filter(Boolean).slice(0,4) :
    ["**Tarifa estable** y sin cargos sorpresa.","**Soporte para empresa** con atención prioritaria.","**Portabilidad sin cortes** conservando sus números.","**Vigilancia de subidas** de precio y caducidad de descuentos."];
  const subSave = (r && r.conPromo) ? "IVA incluido · " + eur(c.ahorroPrimerAno) + " el primer año con la promoción" : "IVA incluido · " + eur(c.ahorroAnual * 3) + " en 3 años";
  const p3 = `<section class="pg p3">${head}
    <div class="sec" style="margin-top:28px"><div class="num">3</div><h2>Nuestra propuesta: ${esc(recN)}</h2></div>
    <p class="lead">${textoPropuesta(s, c)}</p>
    <div class="p3top">
      <div class="calc">
        <div>Paga hoy (${c.mantiene > 0 ? (c.extras > 0 ? "servicios + " + (c.L.filter(l=>l.cat==="extra"&&l.importe>0).length === 1 ? esc(lc1(c.L.find(l=>l.cat==="extra"&&l.importe>0).concepto.replace(/ de dispositivo$/,""))) : "extras") : "servicios") : esc(corto(s.cliente.operador))})<b>${eur(c.pagaHoy)} / mes</b></div>
        <div>Pagará con ${esc(recN)}<b>${r ? eur(r.cuota) : "—"} / mes</b></div>
        <div>Diferencia mensual<b>${eur(c.difMes)} / mes</b></div>
        <div>× 12 meses<b></b></div>
        <div>${esc(etiqueta)}, IVA incluido<b>${eur(c.ahorroAnual)}</b></div>
      </div>
      <div class="save"><small>${esc(etiqueta)}</small><div class="big">${eur(c.ahorroAnual)}</div><span>${subSave}</span></div>
    </div>
    <div class="h3">Por qué ${esc(recN)}</div>
    <div class="ticks">${ventajas.map(v => `<div>${md(v)}</div>`).join("")}</div>
    <div class="h3">Por qué con Integral Connection Consulting</div>
    <div class="ticks">
      <div><b>100 % independientes.</b> Trabajamos con todas las compañías y le mostramos el mercado completo.</div>
      <div><b>Gestión integral.</b> Portabilidad, bajas, instalación y revisión de la primera factura. Usted no hace ninguna llamada.</div>
      <div><b>Cero tarifas ocultas.</b> Vigilamos cargos de terceros, caducidad de descuentos y subidas de precio.</div>
      <div><b>Una consultora, no un call center.</b> ${esc(k.nombre)} lleva su caso de principio a fin, con contacto directo.</div>
    </div>
    <div class="cta">
      <div>
        <h3>Cada mes sin cambiar le cuesta<br><em>${eur(c.difMes)}</em>.</h3>
        <p>Firme hoy y nos encargamos de todo. Migración en 5–14 días, sin cortes de servicio y conservando sus números.</p>
        <div class="steps"><div><b>1 · Firme</b><span>Este presupuesto</span></div><div><b>2 · Gestionamos</b><span>Portabilidad y alta</span></div><div><b>3 · Ahorra</b><span>Desde la primera factura</span></div></div>
        <div class="mail">Escriba a ${esc(k.nombre)}:<br>${esc(k.email)}</div>
      </div>
      <div class="accept">
        <small>Aceptación del presupuesto</small>
        <div class="opt"><span class="box"></span><span><b>${esc(recN)}</b> (recomendada) · ahorro ${eur(c.ahorroAnual)}/año</span></div>
        <div class="opt"><span class="box"></span><span>Otra opción: ____________________</span></div>
        <div class="ln">Nombre y apellidos</div>
        <div class="ln">DNI / CIF</div>
        <div class="ln">Fecha y firma del cliente</div>
      </div>
    </div>
    <div class="sign"><img src="icono.png" alt="" width="72" height="72"><div class="who"><b>${esc(k.nombre)}</b><br>${esc(k.cargo)}<br>Integral Connection Consulting<br>${esc(k.email)}</div><div class="sl">Firma de ${esc(k.nombre || "Integral Connection Consulting")}</div></div>
    ${foot(3)}</section>`;

  $("#pages").innerHTML = p1 + p2 + p3;
  $("#chips").innerHTML = `<span class="chipk">Hoy ${eur(c.pagaHoy)}/mes</span><span class="chipk">${esc(corto(recN))} ${r ? eur(r.cuota) : "—"}/mes</span><span class="chipk g">${eur(c.ahorroAnual)}/año</span>`;
  fitPreview();
  updateLiveForm(c);
  if (usuario) { try { localStorage.setItem(LS + ":" + usuario.id, JSON.stringify(state)); } catch(e){} }
}

function fitPreview(){
  const w = $("#scaler").clientWidth; const sc = Math.min(1, w / 924);
  const pages = $("#pages"); pages.style.transform = `scale(${sc})`;
  $("#scaler").style.height = (pages.scrollHeight * sc) + "px";
}
window.addEventListener("resize", fitPreview);

/* ================= formulario ================= */
function field(label, path, val, type = "text", extra = ""){
  const id = "f-" + path.replace(/\./g,"-");
  return `<label class="f" for="${id}">${label}<input id="${id}" type="${type}" data-path="${path}" value="${esc(val)}" ${type==="number"?'step="0.01" inputmode="decimal"':""} ${extra}></label>`;
}
function renderForm(){
  const s = state;
  const perfOpts = [...BUILTIN_PERFILES.map(p => `<option value="b:${p.id}">${esc(p.nombre)}</option>`),
                    ...savedPerfiles.map(p => `<option value="s:${esc(p.id)}">${esc(p.nombre)}</option>`)].join("");
  $("#form").innerHTML = `
  <details class="card" data-sec="cliente" open><summary><span class="n">1</span>Cliente y presupuesto<span class="hint" id="h-cli"></span></summary><div class="body">
    <div class="grid2">${field("Cliente","cliente.nombre",s.cliente.nombre)}${field("Ubicación","cliente.ubicacion",s.cliente.ubicacion)}</div>
    <div class="grid2">${field("Operador y tarifa actual","cliente.operador",s.cliente.operador)}${field("Factura analizada","cliente.periodo",s.cliente.periodo)}</div>
    <div class="grid2">${field("N.º de presupuesto","presupuesto.numero",s.presupuesto.numero)}${field("Fecha de emisión","presupuesto.fecha",s.presupuesto.fecha,"date")}</div>
    <div class="note">Cargar un caso de ejemplo:
      ${EJEMPLOS.map((e,i) => `<button type="button" class="btn light sm" data-ej="${i}">${esc(e.etiqueta)}</button>`).join(" ")}</div>
  </div></details>

  <details class="card" data-sec="factura" open><summary><span class="n">2</span>Factura actual<span class="hint" id="h-fac"></span></summary><div class="body">
    <div class="note">Cada concepto con su importe mensual con IVA. La etiqueta decide el cálculo: <b>Prescindible, Fuga de coste, Cargo oculto y Revisable</b> son extras que desaparecen con la propuesta; <b>Se mantiene</b> (p. ej. financiación) no entra en la comparación.</div>
    <div class="row-list">${s.lineas.map((l,i) => `<div class="lrow">
      <input type="text" id="ln-${i}-c" data-path="lineas.${i}.concepto" value="${esc(l.concepto)}" aria-label="Concepto">
      <input type="number" id="ln-${i}-i" data-path="lineas.${i}.importe" value="${esc(l.importe)}" step="0.01" inputmode="decimal" aria-label="Importe">
      <select id="ln-${i}-t" data-path="lineas.${i}.tag" aria-label="Diagnóstico">${Object.keys(TAGS).map(t => `<option ${t===l.tag?"selected":""}>${t}</option>`).join("")}</select>
      <button type="button" class="btn ghost" data-del-line="${i}" aria-label="Quitar concepto">✕</button></div>`).join("")}</div>
    <div><button type="button" class="btn light sm" id="addLine">+ Añadir concepto</button></div>
    <div id="w-lines"></div>
    <div class="grid2">${field("Importe de una factura anterior (opcional)","anterior.importe",s.anterior.importe,"number")}${field("Mes de esa factura","anterior.mes",s.anterior.mes,"text",'placeholder="marzo"')}</div>
  </div></details>

  <details class="card" data-sec="tarifas" open><summary><span class="n">3</span>Tarifas del mercado<span class="hint">${s.perfil.ops.length} operadoras</span></summary><div class="body">
    <div class="inline"><label class="f" for="perfilSel">Cargar perfil de tarifas<select id="perfilSel"><option value="">Elegir…</option>${perfOpts}</select></label></div>
    ${field("Configuración comparada","perfil.config",s.perfil.config)}
    <div class="grid2">${field("Tarifas consultadas el","perfil.fechaTarifas",s.perfil.fechaTarifas || s.presupuesto.fecha,"date")}${field("Nota al pie","perfil.nota",s.perfil.nota || "")}</div>
    <div class="note">Precios mensuales con IVA. Si hay promoción, indica su precio y meses: el coste anual se calcula solo. Marca la operadora que recomiendas con ★.</div>
    <div class="row-list" id="opsList">${s.perfil.ops.map((o,i) => opCard(o,i)).join("")}</div>
    <div><button type="button" class="btn light sm" id="addOp">+ Añadir operadora</button></div>
    <div class="inline">${field("Guardar estas tarifas como perfil","perfilNombre",s.perfil.nombre || "")}<button type="button" class="btn light" id="savePerfil">Guardar perfil</button></div>
  </div></details>

  <details class="card" data-sec="ranking" open><summary><span class="n">€</span>Ofertas que entran en precio<span class="internal">Interno · no sale en el PDF</span></summary><div class="body">
    <div class="note">Operadoras que ahorran al cliente al menos el mínimo que fijes, ordenadas por comisión. La comisión se calcula con tu tabla (grupo +O y Vodafone residencial) a partir de la marca, la fibra y los GB de cada línea; para el resto, escríbela a mano. Pulsa ★ para recomendarla en el informe.</div>
    <div class="rank-tools">
      <label class="f" for="f-minAhorro">Ahorro mínimo para el cliente (€/año)<input type="number" step="1" min="0" inputmode="numeric" id="f-minAhorro" data-path="minAhorro" value="${esc(s.minAhorro ?? 0)}"></label>
      <label class="chk" for="f-altasNuevas" style="flex:1 1 100%"><input type="checkbox" id="f-altasNuevas" data-path="altasNuevas" ${s.altasNuevas ? "checked" : ""}> Las líneas son altas nuevas (sin portabilidad)</label>
      <button type="button" class="btn light" id="rankOrder">${s.rankDesc ? "Mayor comisión primero" : "Menor comisión primero"} ⇅</button>
    </div>
    <div class="rank" id="ranking"></div>
  </div></details>

  <details class="card" data-sec="textos"><summary><span class="n">4</span>Textos de la propuesta<span class="hint">automáticos, editables</span></summary><div class="body">
    ${field("Etiqueta del ahorro","ahorroEtiqueta",s.ahorroEtiqueta)}
    <label class="f" for="f-propuestaNota">Frase extra en la propuesta (opcional)<textarea id="f-propuestaNota" data-path="propuestaNota" rows="2">${esc(s.propuestaNota||"")}</textarea></label>
    <div class="note"><b>Observaciones de la página 1.</b> Se generan con los datos de la factura. ${s.obs ? 'Estás usando textos personalizados. <button type="button" class="btn light sm" id="obsAuto">Volver a automáticas</button>' : '<button type="button" class="btn light sm" id="obsEdit">Personalizar textos</button>'}</div>
    ${s.obs ? s.obs.map((o,i) => `<div class="obs"><input type="text" id="ob-${i}-t" data-path="obs.${i}.t" value="${esc(o.t)}" aria-label="Título"><textarea id="ob-${i}-b" data-path="obs.${i}.b" rows="2" aria-label="Texto">${esc(o.b)}</textarea></div>`).join("") : ""}
  </div></details>

  <details class="card" data-sec="consultora"><summary><span class="n">5</span>Consultora<span class="hint">${esc(s.consultora.nombre)}</span></summary><div class="body">
    ${field("Nombre","consultora.nombre",s.consultora.nombre)}
    ${field("Cargo","consultora.cargo",s.consultora.cargo)}
    ${field("Correo","consultora.email",s.consultora.email,"email")}
    <div><button type="button" class="btn light sm" id="saveCons">Recordar mi cargo</button></div>
  </div></details>

  <details class="card" id="comCard" hidden><summary><span class="n">€</span>Tabla de comisiones<span class="internal">Solo administradores</span></summary><div class="body">
    <div class="note">Importes por venta cargados de la base de datos. Los cambios se aplican al momento en el ranking y se guardan para todo el equipo.</div>
    <div id="comEditor"></div>
  </div></details>

  <details class="card" id="segCard" hidden><summary><span class="n">✓</span>Seguridad y copias<span class="internal">Solo administradores</span></summary><div class="body" id="segBody">
    <div class="note">Cargando estado…</div>
  </div></details>

  <details class="card" data-sec="historial"><summary><span class="n">6</span>Informes guardados<span class="hint" id="h-hist"></span></summary><div class="body">
    <div class="hist" id="hist"></div>
  </div></details>`;
  renderHist();
  renderEditorComisiones();
  renderSeguridad();
}
function opCard(o,i){
  const isRec = (state.rec|0) === i;
  return `<div class="op${isRec?" rec":""}" data-op="${i}">
    <div class="op-head">
      <button type="button" class="btn ${isRec?"gold":"light"} sm" data-rec="${i}" aria-pressed="${isRec}" title="Recomendar">★</button>
      <input type="text" id="op-${i}-n" data-path="perfil.ops.${i}.nombre" value="${esc(o.nombre)}" aria-label="Operadora">
      <button type="button" class="btn ghost" data-del-op="${i}" aria-label="Quitar operadora">✕</button>
    </div>
    <div class="op-grid">
      <label class="f" for="op-${i}-q">Cuota/mes<input type="number" step="0.01" inputmode="decimal" id="op-${i}-q" data-path="perfil.ops.${i}.cuota" value="${esc(o.cuota)}"></label>
      <label class="f" for="op-${i}-pp">Precio promo<input type="number" step="0.01" inputmode="decimal" id="op-${i}-pp" data-path="perfil.ops.${i}.promoPrecio" value="${esc(o.promoPrecio)}"></label>
      <label class="f" for="op-${i}-pm">Meses promo<input type="number" step="1" min="0" max="12" id="op-${i}-pm" data-path="perfil.ops.${i}.promoMeses" value="${esc(o.promoMeses)}"></label>
    </div>
    <div class="op-grid2">
      <label class="f" for="op-${i}-pt">Texto promoción<input type="text" id="op-${i}-pt" data-path="perfil.ops.${i}.promoTexto" value="${esc(o.promoTexto)}" placeholder="automático"></label>
      <label class="f" for="op-${i}-v">Valoración<input type="text" id="op-${i}-v" data-path="perfil.ops.${i}.valoracion" value="${esc(o.valoracion)}"></label>
    </div>
    <div class="op-grid"><span class="internal" style="grid-column:1/-1;justify-self:start">Comisión · interno</span>
      <label class="f" for="op-${i}-mk">Marca<select id="op-${i}-mk" data-path="perfil.ops.${i}.marca"><option value="">Auto (${esc(detectaMarca(o.nombre) || "—")})</option>${MARCAS.map(m => `<option ${o.marca === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="f" for="op-${i}-fb">Fibra (Mb)<input type="number" step="100" min="0" inputmode="numeric" id="op-${i}-fb" data-path="perfil.ops.${i}.fibra" value="${esc(o.fibra ?? "")}" placeholder="1000"></label>
      <label class="f" for="op-${i}-lg">Líneas gratis<input type="number" step="1" min="0" inputmode="numeric" id="op-${i}-lg" data-path="perfil.ops.${i}.lineasGratis" value="${esc(o.lineasGratis ?? "")}" placeholder="0"></label>
    </div>
    <div class="op-grid2">
      <label class="f" for="op-${i}-ln">GB de cada línea móvil<input type="text" id="op-${i}-ln" data-path="perfil.ops.${i}.lineas" value="${esc(o.lineas ?? "")}" placeholder="∞, ∞  ·  100, 25"></label>
      <label class="f" for="op-${i}-cm">Comisión manual (€)<input type="number" step="0.01" inputmode="decimal" id="op-${i}-cm" data-path="perfil.ops.${i}.comision" value="${esc(o.comision ?? "")}" placeholder="Calculada"></label>
    </div>
    <label class="chk" for="op-${i}-r"><input type="checkbox" id="op-${i}-r" data-path="perfil.ops.${i}.residencial" ${o.residencial?"checked":""}> Oferta residencial (sin servicios de empresa)</label>
    ${isRec ? `<label class="f" for="op-${i}-ve">Ventajas para la página 3 (una por línea; **negrita**)<textarea id="op-${i}-ve" data-path="perfil.ops.${i}.ventajas" rows="4">${esc((o.ventajas||[]).join("\n"))}</textarea></label>` : ""}
    <div class="sum" id="sum-${i}"></div>
  </div>`;
}
function renderRanking(c){
  const box = document.getElementById("ranking"); if (!box) return;
  const min = num(state.minAhorro);
  const entran = c.ops.filter(o => o.ahorro > 0 && o.ahorro >= min);
  const fuera = c.ops.length - entran.length;
  const com = o => { const c = comisionDe(o, state); return c ? c.total : null; };
  const dir = state.rankDesc ? -1 : 1;
  entran.sort((a,b) => {
    const ca = com(a), cb = com(b);
    if (ca === null && cb === null) return b.ahorro - a.ahorro;
    if (ca === null) return 1;   // sin comisión conocida, siempre al final
    if (cb === null) return -1;
    return (ca - cb) * dir || b.ahorro - a.ahorro;
  });
  if (!entran.length){ box.innerHTML = '<div class="warn">Ninguna operadora mejora lo que paga hoy el cliente con el ahorro mínimo indicado.</div>'; return; }
  box.innerHTML = entran.map((o,k) => {
    const isRec = c.rec && o.i === c.rec.i;
    const cm = com(o);
    return `<div class="rk${isRec ? " rec" : ""}"><span class="pos-n">${k+1}</span>
      <div style="min-width:0"><b>${esc(o.nombre)}</b><small>${eur(o.cuota)}/mes · ahorro ${eur(o.ahorro)}/año</small></div>
      <span class="hide-m">${esc(o.residencial ? "Residencial" : "Empresa")}</span>
      <span class="com${cm === null ? " none" : ""}" title="${esc((comisionDe(o, state) || {}).nota || "")}">${cm === null ? "Sin dato" : eur(cm)}</span>
      <button type="button" class="btn ${isRec ? "gold" : "light"} sm" data-rec="${o.i}" title="Recomendar en el informe" aria-pressed="${isRec}">★</button></div>`;
  }).join("") + (fuera ? `<div class="rank-out">${fuera} ${fuera === 1 ? "operadora no entra" : "operadoras no entran"} en precio.</div>` : "");
}
function updateLiveForm(c){
  renderFlow();
  renderRanking(c);
  c.ops.forEach(o => { const el = document.getElementById("sum-" + o.i); if (!el) return; const cm = comisionDe(o, state);
    el.innerHTML = `<span>Coste anual <b>${eur(o.coste)}</b></span><span>Ahorro <b class="${o.ahorro>=0?"pos":"neg"}">${eur(o.ahorro)}</b></span><span>Comisión <b>${cm ? eur(cm.total) + (cm.manual ? " (manual)" : "") : "sin dato"}</b></span>`; });
  const hf = $("#h-fac"); if (hf) hf.textContent = "Total " + eur(c.total) + " · compara " + eur(c.pagaHoy);
  const hc = $("#h-cli"); if (hc) hc.textContent = state.presupuesto.numero;
  const w = $("#w-lines"); if (w) w.innerHTML = state.lineas.length > 7 ? '<div class="warn">Con más de 7 conceptos la tabla puede no caber en la página 1. Agrupa los cargos menores.</div>' : (c.rec && c.difMes <= 0 ? '<div class="warn">La operadora recomendada no mejora lo que paga hoy: el informe mostraría un ahorro negativo.</div>' : "");
}

function setPath(path, value){
  const parts = path.split("."); let o = state;
  for (let k = 0; k < parts.length - 1; k++) o = o[parts[k]];
  o[parts[parts.length-1]] = value;
}
let tmr = null;
const schedule = () => { clearTimeout(tmr); tmr = setTimeout(render, 120); };

document.addEventListener("input", e => {
  const el = e.target; const p = el.dataset && el.dataset.path; if (!p) return;
  if (p === "perfilNombre"){ state.perfil.nombre = el.value; return; }
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (p.endsWith(".ventajas")) v = el.value.split("\n").map(x => x.trim()).filter(Boolean);
  setPath(p, v); schedule();
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "perfilSel" && el.value){
    const [t, id] = [el.value.slice(0,1), el.value.slice(2)];
    const p = t === "b" ? BUILTIN_PERFILES.find(x => x.id === id) : savedPerfiles.find(x => x.id === id);
    if (p){ const pc = clone(p); state.perfil = {nombre:pc.nombre, config:pc.config, fechaTarifas:pc.fechaTarifas || hoyISO(), nota:pc.nota || "", ops:pc.ops};
      state.rec = Math.max(0, pc.ops.findIndex(o => /vodafone/i.test(o.nombre)));
      renderForm(); render(); toast("Tarifas cargadas: " + pc.nombre); }
  }
  if (el.dataset && el.dataset.path && (el.type === "checkbox" || el.tagName === "SELECT")) render();
});
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.ej != null){ const ej = EJEMPLOS[+b.dataset.ej]; state = Object.assign(baseState(), clone(ej.state), {id:null, consultora:clone(cfg.consultora)}); state.presupuesto.numero = cfg.prefijo + cfg.siguiente; state.presupuesto.fecha = hoyISO(); renderForm(); render(); toast("Ejemplo cargado"); }
  else if (b.dataset.delLine != null){ state.lineas.splice(+b.dataset.delLine,1); renderForm(); render(); }
  else if (b.id === "addLine"){ state.lineas.push({concepto:"", importe:0, tag:"PRECIO MEDIO"}); renderForm(); render(); const i = state.lineas.length-1; document.getElementById("ln-"+i+"-c").focus(); }
  else if (b.dataset.delOp != null){ const i = +b.dataset.delOp; state.perfil.ops.splice(i,1); if (state.rec >= state.perfil.ops.length || state.rec === i) state.rec = 0; else if (state.rec > i) state.rec--; renderForm(); render(); }
  else if (b.id === "rankOrder"){ state.rankDesc = !state.rankDesc; renderForm(); render(); }
  else if (b.id === "addOp"){ state.perfil.ops.push(op("Nueva operadora",0,"","")); renderForm(); render(); }
  else if (b.dataset.rec != null){ state.rec = +b.dataset.rec; renderForm(); render(); }
  else if (b.id === "obsEdit"){ state.obs = clone(observacionesAuto(state, calcular(state))); renderForm(); render(); }
  else if (b.id === "obsAuto"){ state.obs = null; renderForm(); render(); }
  else if (b.id === "savePerfil") savePerfil();
  else if (b.id === "saveCons") saveConsultora();
  else if (b.dataset.load != null) loadInforme(b.dataset.load);
  else if (b.dataset.dup != null) loadInforme(b.dataset.dup, true);
  else if (b.dataset.delInf != null) delInforme(b.dataset.delInf, b);
});

/* ================= asistente por pasos ================= */
const PASOS = [{k:"cliente", t:"Cliente"}, {k:"tipo", t:"Tipo de cliente"}, {k:"servicios", t:"Servicios contratados"}, {k:"estudio", t:"Tipo de estudio"}, {k:"datos", t:"Datos de la factura"}];
const ICON = {
  hogar:'<svg viewBox="0 0 40 40"><path d="M6 19 20 7l14 12"/><path d="M10 16v17h20V16"/><path d="M17 33v-9h6v9"/></svg>',
  empresa:'<svg viewBox="0 0 40 40"><rect x="8" y="6" width="16" height="28" rx="1.5"/><path d="M24 15h8v19h-8"/><path d="M13 12h2M17 12h2M13 17h2M17 17h2M13 22h2M17 22h2M13 27h2M17 27h2M28 20h0M28 25h0"/></svg>',
  mes:'<svg viewBox="0 0 40 40"><path d="M11 5h13l7 7v23H11z"/><path d="M24 5v7h7"/><path d="M15 19h12M15 24h12M15 29h8"/></svg>',
  anio:'<svg viewBox="0 0 40 40"><rect x="6" y="9" width="28" height="25" rx="3"/><path d="M6 16h28M13 5v7M27 5v7"/><path d="M12 22h3M18.5 22h3M25 22h3M12 28h3M18.5 28h3"/></svg>',
  mano:'<svg viewBox="0 0 40 40"><path d="M9 31l3-9L27 7l6 6-15 15z"/><path d="M24 10l6 6"/><path d="M9 31l7-2"/></svg>',
  carpeta:'<svg viewBox="0 0 40 40"><path d="M5 12h11l3 4h16v16H5z"/><path d="M5 12V9h10l3 3"/></svg>'
};
const GB_OPC = [["25","Hasta 25GB"],["50","Hasta 50GB"],["100","Hasta 100GB"],["∞","Ilimitados"]];
function wz(){
  if (!state.wz) state.wz = {fase:"comparativa", paso:4};
  if (!state.wz.serv) state.wz.serv = {fibra:600, fijo:true, tv:false, lineas:["∞","∞"]};
  return state.wz;
}
let wzPintado = "";
function renderFlow(){
  const w = wz();
  const b = document.body;
  b.classList.toggle("fase-factura", w.fase === "factura");
  b.classList.toggle("fase-comparativa", w.fase === "comparativa");
  b.classList.toggle("fase-exportar", w.fase === "exportar");
  b.classList.toggle("paso-datos", w.fase === "factura" && w.paso === 4 && !!w.datosElegido);
  const lbl = document.getElementById("wzLabel"), bar = document.getElementById("wzBar"), back = document.getElementById("wzBack");
  if (lbl){
    if (w.fase === "factura"){ lbl.textContent = "Paso " + (w.paso + 1) + " de 5 — " + PASOS[w.paso].t; bar.style.width = ((w.paso + 1) * 20) + "%"; }
    else if (w.fase === "comparativa"){ lbl.textContent = "Comparativa — elige la operadora que recomiendas"; bar.style.width = "100%"; }
    else { lbl.textContent = "Exportar — revisa el informe y descárgalo"; bar.style.width = "100%"; }
    back.hidden = w.fase === "factura" && w.paso === 0;
  }
  document.querySelectorAll(".pills button").forEach(x => x.classList.toggle("on", x.dataset.fase === w.fase));
  const clave = w.fase + "-" + w.paso + "-" + (w.datosElegido ? 1 : 0);
  if (w.fase === "factura" && !(w.paso === 4 && w.datosElegido) && wzPintado !== clave){ wzPintado = clave; pintarPaso(); }
  if (w.fase !== "factura") wzPintado = "";
  if (w.fase === "exportar") pintarExport();
}
function opcion(attr, val, icon, titulo, texto, sel, fila){
  return `<button type="button" class="wz-opt${fila ? " wz-row" : ""}${sel ? " sel" : ""}" ${attr}="${val}">${ICON[icon]}<div><strong>${titulo}</strong><span>${texto}</span></div></button>`;
}
function pintarPaso(){
  const w = wz(), box = document.getElementById("wizard"), s = state;
  const k = PASOS[w.paso].k;
  let h = "";
  if (k === "cliente"){
    const origen = detectaMarca(s.cliente.operador);
    h = `<h2>¿Para quién es el informe?</h2><p class="wz-sub">Estos datos aparecen en la portada. El operador actual decide qué promociones y comisiones se aplican.</p>
    <div class="grid2">${field("Nombre del cliente o empresa","cliente.nombre",s.cliente.nombre)}${field("Ubicación","cliente.ubicacion",s.cliente.ubicacion)}</div>
    <div class="wz-field"><span>Operador actual</span><div class="chips">${["Movistar","Vodafone","Orange","Yoigo","MásMóvil","Jazztel","Digi","Lowi","O2","Adamo","Avatel","Otra"].map(m => `<button type="button" class="chip${origen === m ? " on" : ""}" data-wz-op="${m}">${m}</button>`).join("")}</div></div>
    <div class="grid2">${field("Tarifa contratada (tal como aparece en la factura)","cliente.operador",s.cliente.operador)}${field("Factura analizada","cliente.periodo",s.cliente.periodo,"text",'placeholder="Septiembre 2026"')}</div>
    <div class="wz-actions"><span></span><button type="button" class="btn navy" data-wz-next="1">Continuar →</button></div>`;
  }
  if (k === "tipo"){
    h = `<h2>¿Qué tipo de cliente es?</h2><p class="wz-sub">Solo se compararán las tarifas pensadas para este tipo de cliente.</p>
    <div class="wz-opts">${opcion("data-wz-tipo","hogar","hogar","Doméstico (hogar)","Vivienda particular. Precios con IVA.", w.tipo === "hogar")}${opcion("data-wz-tipo","empresa","empresa","Pymes y autónomos","Negocios, locales, empresas y trabajadores autónomos.", w.tipo === "empresa")}</div>`;
  }
  if (k === "servicios"){
    const sv = w.serv;
    h = `<h2>¿Qué tiene contratado hoy?</h2><p class="wz-sub">Con esto elegimos el perfil de tarifas y montamos una oferta igual o mejor que lo que tiene.</p>
    <div class="wz-field"><span>Fibra</span><div class="chips">${[[0,"Sin fibra"],[300,"300 Mb"],[600,"500–600 Mb"],[1000,"1 Gb"]].map(([v,t]) => `<button type="button" class="chip${num(sv.fibra) === v ? " on" : ""}" data-wz-fibra="${v}">${t}</button>`).join("")}</div></div>
    <div class="wz-field"><span>Otros servicios</span><div class="chips"><button type="button" class="chip${sv.fijo ? " on" : ""}" data-wz-tog="fijo">Teléfono fijo</button><button type="button" class="chip${sv.tv ? " on" : ""}" data-wz-tog="tv">Televisión</button></div></div>
    <div class="wz-field"><span>Líneas móviles · lo que gasta cada una</span><div class="wz-lines">${sv.lineas.map((g,i) => `<div class="wz-line"><b>Línea ${i+1}</b><select id="wz-l-${i}" data-wz-gb="${i}" aria-label="Datos de la línea ${i+1}">${GB_OPC.map(([v,t]) => `<option value="${v}" ${g === v ? "selected" : ""}>${t}</option>`).join("")}</select><button type="button" class="btn ghost" data-wz-quita="${i}" aria-label="Quitar línea">✕</button></div>`).join("")}</div>
      <div>${sv.lineas.length < 8 ? '<button type="button" class="btn light sm" data-wz-anade="1">+ Añadir línea</button>' : ""}</div></div>
    <div class="wz-actions"><span></span><button type="button" class="btn navy" data-wz-next="1">Continuar →</button></div>`;
  }
  if (k === "estudio"){
    h = `<h2>¿Estudio del primer año o a 24 meses?</h2><p class="wz-sub">Elige cómo quieres calcular el ahorro para este cliente.</p>
    <div class="wz-opts">${opcion("data-wz-estudio","anual","mes","Primer año","Factura contra factura. El ahorro anual es la factura actual × 12 frente al coste del primer año, con las promociones vigentes.", (s.estudio || "anual") === "anual")}${opcion("data-wz-estudio","24m","anio","Media a 24 meses","Incluye la subida de precio al acabar cada promoción. Es la comparación más prudente cuando hay ofertas de 3 o 12 meses.", s.estudio === "24m")}</div>`;
  }
  if (k === "datos"){
    h = `<h2>¿Cómo quieres introducir los datos?</h2><p class="wz-sub">Copia los conceptos de la factura del cliente o parte de un informe que ya hiciste para alguien parecido.</p>
    <div class="wz-rows">${opcion("data-wz-datos","manual","mano","Introducir la factura manualmente","Escribe cada concepto con su importe y su diagnóstico en el siguiente paso.", false, true)}${opcion("data-wz-datos","guardado","carpeta","Partir de un informe guardado","Duplica un informe anterior y cambia solo lo que difiere.", false, true)}</div>`;
  }
  box.innerHTML = `<div class="wz-card">${h.replace(/(id|for)="f-/g, '$1="wz-f-')}</div>`;
  const f = box.querySelector("input"); if (f && k === "cliente" && !s.cliente.nombre) f.focus();
}
function irPaso(n){
  const w = wz(); w.fase = "factura"; w.paso = Math.max(0, Math.min(4, n));
  wzPintado = "";
  renderFlow(); persistir(); window.scrollTo({top:0, behavior:"smooth"});
}
function irFase(f){
  const w = wz(); w.fase = f;
  wzPintado = ""; renderForm(); render(); window.scrollTo({top:0, behavior:"smooth"});
}
function persistir(){ try { const k = (typeof usuario !== "undefined" && usuario) ? LS + ":" + usuario.id : LS; localStorage.setItem(k, JSON.stringify(state)); } catch(e){} }
function aplicarConfiguracion(){
  const w = wz(), sv = w.serv, s = state;
  const n = sv.lineas.length, ilim = sv.lineas.filter(g => g === "∞").length;
  let clave;
  if (w.tipo === "empresa") clave = n >= 5 ? "5 líneas" : n >= 3 ? "3 líneas" : "autónomo";
  else clave = n >= 3 ? "familia" : ilim >= 1 ? "2 ilimitadas" : "hasta 50gb";
  const candidatos = [...(savedPerfiles || []), ...BUILTIN_PERFILES];
  const p = candidatos.find(x => /oct 2026/i.test(x.nombre) && x.nombre.toLowerCase().includes(clave));
  if (p){ const pc = clone(p); s.perfil = {nombre:pc.nombre, config:pc.config, fechaTarifas:pc.fechaTarifas || hoyISO(), nota:pc.nota || "", ops:pc.ops}; s.rec = 0; }
  const vel = num(sv.fibra) >= 1000 ? "1 Gb" : num(sv.fibra) >= 500 ? "600 Mb" : num(sv.fibra) ? "300 Mb" : "";
  const gbTxt = sv.lineas.map(g => g === "∞" ? "ilimitada" : g + "GB").join(", ");
  const partes = [vel ? "fibra " + vel : "", sv.fijo ? "fijo" : "", n ? n + (n === 1 ? " móvil" : " móviles") + " (" + gbTxt + ")" : ""].filter(Boolean);
  const virgen = s.lineas.length <= 1 && !num(s.lineas[0] && s.lineas[0].importe);
  if (virgen){
    s.lineas = [{concepto:"Cuota " + partes.join(" + "), importe:0, tag:"PRECIO MEDIO"}];
    if (sv.tv) s.lineas.push({concepto:"Televisión", importe:0, tag:"CORRECTO"});
  }
  s.altasNuevas = false;
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button"); if (!b) return;
  const w = state && state.wz ? state.wz : null;
  if (b.dataset.fase){ if (b.dataset.fase === "factura") irPaso(wz().datosElegido ? 4 : 0); else irFase(b.dataset.fase); return; }
  if (b.id === "wzBack"){ const x = wz(); if (x.fase === "exportar") irFase("comparativa"); else if (x.fase === "comparativa") irPaso(4); else irPaso(x.paso - 1); return; }
  if (b.id === "wzBackDatos"){ wz().datosElegido = false; irPaso(4); return; }
  if (b.id === "wzToComp"){ irFase("comparativa"); return; }
  if (b.dataset.wzNext){ irPaso(wz().paso + 1); return; }
  if (b.dataset.wzOp){ const m = b.dataset.wzOp; const inp = document.getElementById("wz-f-cliente-operador");
    if (!detectaMarca(state.cliente.operador) || detectaMarca(state.cliente.operador) !== m){ state.cliente.operador = m === "Otra" ? "" : m; if (inp){ inp.value = state.cliente.operador; inp.focus(); } }
    b.parentElement.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b)); schedule(); return; }
  if (b.dataset.wzTipo){ wz().tipo = b.dataset.wzTipo; irPaso(2); return; }
  if (b.dataset.wzFibra !== undefined){ wz().serv.fibra = num(b.dataset.wzFibra); wzPintado = ""; renderFlow(); return; }
  if (b.dataset.wzTog){ const sv = wz().serv; sv[b.dataset.wzTog] = !sv[b.dataset.wzTog]; wzPintado = ""; renderFlow(); return; }
  if (b.dataset.wzAnade){ wz().serv.lineas.push("50"); wzPintado = ""; renderFlow(); return; }
  if (b.dataset.wzQuita !== undefined){ wz().serv.lineas.splice(+b.dataset.wzQuita, 1); wzPintado = ""; renderFlow(); return; }
  if (b.dataset.wzEstudio){ state.estudio = b.dataset.wzEstudio; irPaso(4); return; }
  if (b.dataset.wzDatos === "manual"){ const x = wz(); x.datosElegido = true; aplicarConfiguracion(); x.fase = "factura"; x.paso = 4; wzPintado = ""; renderForm(); render(); setTimeout(() => { const el = document.getElementById("ln-0-i"); if (el){ el.focus(); el.select && el.select(); } }, 50); return; }
  if (b.dataset.wzDatos === "guardado"){ const x = wz(); x.datosElegido = true; aplicarConfiguracion(); x.fase = "comparativa"; renderForm(); render();
    const d = document.querySelector('details[data-sec="historial"]'); if (d){ d.open = true; setTimeout(() => d.scrollIntoView({behavior:"smooth", block:"start"}), 80); } toast("Elige un informe y pulsa Duplicar"); return; }
});
document.addEventListener("change", e => { const el = e.target; if (el.dataset && el.dataset.wzGb !== undefined){ wz().serv.lineas[+el.dataset.wzGb] = el.value; persistir(); } });
function pintarExport(){
  const box = document.getElementById("exportBar"); if (!box) return;
  const c = calcular(state);
  box.innerHTML = `<div><h2>${esc(state.cliente.nombre || "Cliente")} · ${esc(state.presupuesto.numero)}</h2><p>Propuesta: ${esc(c.rec ? c.rec.nombre : "—")} · ahorro ${eur(c.ahorroAnual)} al año · ${state.estudio === "24m" ? "estudio a 24 meses" : "estudio del primer año"}</p></div>
    <div class="actions"><button type="button" class="btn light" data-fase="comparativa">← Volver a la comparativa</button><button type="button" class="btn light" id="expSave">Guardar</button><button type="button" class="btn gold" id="expPdf">Descargar PDF</button></div>`;
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("button"); if (!b) return; if (b.id === "expSave") saveInforme(); if (b.id === "expPdf") exportPdf(); });
// "Nuevo informe" abre el asistente desde el primer paso.
document.getElementById("btnNew").addEventListener("click", () => setTimeout(() => {
  state.wz = {fase:"factura", paso:0, tipo:"", serv:{fibra:600, fijo:true, tv:false, lineas:["∞","∞"]}};
  state.estudio = "anual"; wzPintado = ""; renderFlow(); persistir();
}, 0));

/* ================= acciones superiores ================= */
$("#btnNew").addEventListener("click", () => {
  const perfil = clone(state.perfil);
  state = {
    id:null, ahorroEtiqueta:state.ahorroEtiqueta || "Ahorro anual estimado", obs:null,
    consultora:clone(cfg.consultora),
    cliente:{nombre:"", ubicacion:"Gijón (Asturias)", operador:"", periodo:""},
    presupuesto:{numero:cfg.prefijo + cfg.siguiente, fecha:hoyISO(), validez:30},
    lineas:[{concepto:"Cuota principal (fibra, fijo, móviles, TV)", importe:0, tag:"PRECIO MEDIO"}],
    anterior:{importe:"", mes:""}, perfil, rec:state.rec|0, propuestaNota:""
  };
  renderForm(); render(); document.getElementById("f-cliente-nombre").focus();
  toast("Informe nuevo: sigue los 5 pasos");
});
$("#btnSave").addEventListener("click", saveInforme);
$("#btnPdf").addEventListener("click", exportPdf);

let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }

/* ================= API del servidor ================= */
/* Integrado en el CRM: misma sesion, usuarios y jerarquia (api/cmp_telefonia.php
   y api/cmp_sesion.php). La pagina vive en comparador/telefonia/. */
const API_BASE = "../../api/";
const PARAMS = new URLSearchParams(location.search);
let crmClienteId = /^\d+$/.test(PARAMS.get("cliente") || "") ? PARAMS.get("cliente") : null;
let crmCliente = null;
let csrf = "";
function rutaCrm(ruta){
  if (ruta.indexOf("auth.php?action=me") === 0) return "cmp_sesion.php" + (crmClienteId ? "?cliente=" + encodeURIComponent(crmClienteId) : "");
  if (ruta.indexOf("archivo.php?informe=") === 0) return "cmp_telefonia.php?recurso=pdf&id=" + ruta.slice("archivo.php?informe=".length);
  return ruta.replace(/^informes\.php/, "cmp_telefonia.php");
}
async function api(ruta, opts = {}, reintento){
  const headers = {"Content-Type":"application/json"};
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(API_BASE + rutaCrm(ruta), Object.assign({credentials:"same-origin", headers}, opts));
  let data = null; try { data = await res.json(); } catch(e){}
  if (data && typeof data.csrf === "string") csrf = data.csrf;
  // Token de seguridad caducado (p. ej. tras entrar en el CRM en otra pestaña): se renueva y se reintenta.
  if (res.status === 419 && !reintento){
    const me = await api("auth.php?action=me", {}, true);
    if (me && me.user) return api(ruta, opts, true);
  }
  if (res.status === 401 && usuario){ usuario = null; mostrarLogin(); }
  if (!res.ok){ const err = new Error((data && data.error) || ("Error " + res.status)); err.status = res.status; throw err; }
  return data;
}

/* ================= PDF ================= */
// Librerías alojadas en la propia web (informe/vendor): no se carga código de
// terceros. Se cargan solo al generar el primer PDF.
const LIBS = [
  {ok: () => window.html2canvas, src: "../vendor/html2canvas.min.js?v=1.4.1"},
  {ok: () => window.jspdf && window.jspdf.jsPDF, src: "../vendor/jspdf.umd.min.js?v=2.5.1"}
];
function cargarScript(src){
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function cargarLibs(){
  for (const l of LIBS){
    if (!l.ok()){ try { await cargarScript(l.src); } catch(e){} }
    if (!l.ok()) return false;
  }
  return true;
}
async function archivarPdf(pdf){
  if (!state.id) return;
  try {
    const b64 = pdf.output("datauristring").split(",")[1];
    await api("archivo.php?informe=" + encodeURIComponent(state.id), {method:"POST", body:JSON.stringify({pdf:b64})});
    cargarInformes();
    return true;
  } catch(e){ console.warn("PDF no archivado:", e.message); return false; }
}
async function exportPdf(){
  const btn = $("#btnPdf");
  if (!(await cargarLibs())){ toast("No se pudieron cargar las librerías de PDF. Revisa la conexión y recarga la página."); return; }
  btn.disabled = true; btn.textContent = "Guardando…";
  // Se guarda primero: así el número de presupuesto queda reservado y el
  // informe aparece en el histórico antes de enviarlo al cliente.
  const ok = await saveInforme(true);
  if (!ok){ btn.disabled = false; btn.textContent = "Descargar PDF"; return; }
  btn.textContent = "Generando PDF…";
  const pages = $("#pages"); const prev = pages.style.transform;
  const vistaAntes = document.body.classList.contains("vista-datos");
  document.body.classList.remove("vista-datos"); document.body.classList.add("vista-previa");
  try{
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    pages.style.transform = "none";
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF({unit:"pt", format:"a4", compress:true});
    const els = pages.querySelectorAll(".pg");
    for (let i = 0; i < els.length; i++){
      const cv = await html2canvas(els[i], {scale:(window.innerWidth < 760 ? 1.8 : 2.2), backgroundColor:"#ffffff", useCORS:true, logging:false, windowWidth:1000});
      if (i) pdf.addPage();
      pdf.addImage(cv.toDataURL("image/jpeg", .93), "JPEG", 0, 0, 595.28, 841.89);
    }
    const fname = "Informe_Auditoria_" + slug(state.cliente.nombre || "cliente").replace(/-/g,"_") + "_" + slug(corto(state.cliente.operador) || "operador") + ".pdf";
    pdf.save(fname);
    btn.textContent = "Archivando…";
    const archivado = await archivarPdf(pdf);
    toast("PDF descargado · " + state.presupuesto.numero + (archivado ? " · copia guardada en el CRM" : ""));
  } catch(err){
    console.error(err); toast("Error al generar el PDF.");
  } finally {
    if (vistaAntes) cambiarVista("datos");
    pages.style.transform = prev; fitPreview();
    btn.disabled = false; btn.textContent = "Descargar PDF";
  }
}

/* ================= informes guardados ================= */
function renderHist(){
  const h = $("#hist"); if (!h) return;
  const hh = $("#h-hist"); if (hh) hh.textContent = informes.length + " guardados";
  if (!informes.length){ h.innerHTML = '<div class="note">Aún no hay informes guardados. Pulsa <b>Guardar</b> arriba para archivar el informe actual; también se guarda solo al descargar el PDF.</div>'; return; }
  const otros = usuario && usuario.rol !== "gestor_comercial";
  h.innerHTML = informes.map(d => `<div class="hitem${state.id === d.id ? " cur" : ""}"><div><b>${esc(d.cliente_nombre || "Sin nombre")} · ${esc(d.operador_actual || "")}</b><small>${esc(d.numero)} · ahorro ${eur(num(d.ahorro_anual))}/año${otros && d.usuario_nombre ? " · " + esc(d.usuario_nombre) : ""} · ${esc(fechaCorta(d.updated_at))}</small></div>
    <div class="acts"><button type="button" class="btn light sm" data-load="${d.id}">Abrir</button>${d.tiene_pdf ? `<a class="btn light sm" href="${API_BASE}cmp_telefonia.php?recurso=pdf&id=${encodeURIComponent(d.id)}" download title="PDF archivado en el CRM">PDF</a>` : ""}<button type="button" class="btn light sm" data-dup="${d.id}" title="Usar como base para un cliente nuevo">Duplicar</button><button type="button" class="btn ghost" data-del-inf="${d.id}" aria-label="Eliminar">✕</button></div></div>`).join("");
}
function fechaCorta(ts){ if (!ts) return ""; const d = new Date(String(ts).replace(" ","T")); return isNaN(d) ? ts : d.toLocaleDateString("es-ES"); }
async function cargarInformes(){ try { informes = await api("informes.php?recurso=informes"); } catch(e){ informes = []; } renderHist(); }

async function saveInforme(silencioso){
  const c = calcular(state);
  const body = {
    id: state.id || null,
    numero: state.presupuesto.numero,
    cliente_id: state.crmClienteId || null,
    cliente_nombre: state.cliente.nombre,
    operador_actual: state.cliente.operador,
    operador_propuesto: c.rec ? c.rec.nombre : null,
    coste_actual_anual: c.anualHoy,
    coste_propuesto_anual: c.rec ? r2(c.rec.cuota * 12) : null,
    ahorro_anual: c.ahorroAnual,
    datos: clone(state)
  };
  try{
    const r = await api("informes.php?recurso=informes", {method:"POST", body:JSON.stringify(body)});
    const cambio = r.numero !== state.presupuesto.numero;
    state.id = r.id; state.presupuesto.numero = r.numero;
    renderForm(); render();
    try { const cf = await api("informes.php?recurso=config"); cfg.prefijo = cf.prefijo; cfg.siguiente = cf.siguiente; } catch(e){}
    cargarInformes();
    if (!silencioso || cambio) toast("Informe " + r.numero + " guardado" + (cambio ? " (número asignado)" : ""));
    return true;
  } catch(err){
    if (err.status === 401){ mostrarLogin(); return false; }
    toast("No se pudo guardar: " + err.message); return false;
  }
}
async function loadInforme(id, dup){
  try{
    const r = await api("informes.php?recurso=informes&id=" + encodeURIComponent(id));
    state = Object.assign(baseState(), clone(r.datos));
    state.id = r.id;
    if (dup){ state.id = null; state.crmClienteId = null; state.cliente = {nombre:"", ubicacion:state.cliente.ubicacion, operador:"", periodo:""};
      state.presupuesto = {numero:cfg.prefijo + cfg.siguiente, fecha:hoyISO(), validez:30}; state.obs = null;
      state.consultora = consultoraUsuario(); }
    renderForm(); render(); window.scrollTo({top:0, behavior:"smooth"});
    toast(dup ? "Duplicado: completa los datos del nuevo cliente" : "Informe " + r.numero + " abierto");
  } catch(err){ toast("No se pudo abrir: " + err.message); }
}
async function delInforme(id, btn){
  if (btn.dataset.confirm !== "1"){ btn.dataset.confirm = "1"; btn.textContent = "¿Eliminar?"; btn.style.color = "var(--red)"; setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "✕"; btn.style.color = ""; }, 3500); return; }
  try { await api("informes.php?recurso=informes&id=" + encodeURIComponent(id), {method:"DELETE"}); if (state.id == id) state.id = null; toast("Informe eliminado"); cargarInformes(); }
  catch(err){ toast("No se pudo eliminar: " + err.message); }
}

/* ================= seguridad (administradores) ================= */
let SEG = null, SEG_LOG = null;
async function cargarSeguridad(){
  // Las copias de seguridad y el registro de accesos los gestiona el CRM.
  const card = document.getElementById("segCard"); if (card) card.hidden = true;
  return;
  try { SEG = await api("estado.php"); } catch(e){ SEG = {error: e.message}; }
  renderSeguridad();
}
function kb(n){ n = +n || 0; return n > 1048576 ? (n/1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n/1024)) + " KB"; }
function renderSeguridad(){
  const card = document.getElementById("segCard"), box = document.getElementById("segBody");
  if (!card || !box) return;
  card.hidden = true; return; // copias y registro: los gestiona el CRM
  if (!usuario || usuario.rol !== "admin"){ card.hidden = true; return; }
  card.hidden = false;
  if (!SEG){ box.innerHTML = '<div class="note">Cargando estado…</div>'; return; }
  if (SEG.error){ box.innerHTML = `<div class="note">No se pudo leer el estado: ${esc(SEG.error)}. Sube api/estado.php y api/_storage.php.</div>`; return; }
  const u = SEG.ultima_copia;
  box.innerHTML = `<ul class="seg-list">${(SEG.checks || []).map(c => `<li class="${c.ok ? "" : "ko"}"><b aria-hidden="true">${c.ok ? "✓" : "!"}</b><span>${esc(c.texto)}</span></li>`).join("")}</ul>
    <div class="note">Carpeta privada: <b>${SEG.carpeta ? esc(SEG.carpeta.ruta) : "no encontrada"}</b><br>Última copia de la base de datos: <b>${u ? esc(new Date(u.fecha).toLocaleString("es-ES")) + " · " + kb(u.bytes) : "ninguna"}</b></div>
    <div class="inline"><button type="button" class="btn gold" id="segCopia">Hacer copia ahora</button>${u ? `<a class="btn light" href="/api/estado.php?descargar=${encodeURIComponent(u.nombre)}" download>Descargar última copia</a>` : ""}<button type="button" class="btn light" id="segLog">Ver registro de actividad</button></div>
    ${SEG_LOG ? `<div class="seg-log"><table><tbody>${SEG_LOG.length ? SEG_LOG.map(f => `<tr><td>${esc(fechaHora(f.created_at))}</td><td><b>${esc(f.accion)}</b> ${esc(f.detalle || "")}<br><small>${esc(f.usuario || "—")} · ${esc(f.ip || "")}</small></td></tr>`).join("") : '<tr><td colspan="2">Sin movimientos todavía.</td></tr>'}</tbody></table></div>` : ""}`;
}
function fechaHora(ts){ if (!ts) return ""; const d = new Date(String(ts).replace(" ","T")); return isNaN(d) ? ts : d.toLocaleString("es-ES", {dateStyle:"short", timeStyle:"short"}); }
document.addEventListener("click", async e => {
  const b = e.target.closest("#segCopia, #segLog"); if (!b) return;
  if (b.id === "segCopia"){
    b.disabled = true; b.textContent = "Creando copia…";
    try { const r = await api("estado.php?copia=1", {method:"POST", body:"{}"}); toast("Copia creada · " + kb(r.copia.bytes)); await cargarSeguridad(); }
    catch(err){ toast("No se pudo crear la copia: " + err.message); b.disabled = false; b.textContent = "Hacer copia ahora"; }
  } else {
    try { SEG_LOG = await api("estado.php?auditoria=1"); } catch(err){ SEG_LOG = []; toast(err.message); }
    renderSeguridad();
  }
});

/* ================= móvil: menú y pestañas ================= */
function cambiarVista(v){
  document.body.classList.toggle("vista-datos", v === "datos");
  document.body.classList.toggle("vista-previa", v === "previa");
  document.querySelectorAll(".mtabs [data-vista]").forEach(t => t.setAttribute("aria-selected", t.dataset.vista === v ? "true" : "false"));
  if (v === "previa") requestAnimationFrame(fitPreview);
}
document.querySelectorAll(".mtabs [data-vista]").forEach(t => t.addEventListener("click", () => { cambiarVista(t.dataset.vista); window.scrollTo({top:0}); }));
cambiarVista("datos");
(function(){
  const btn = $("#btnMenu"), menu = $("#menuMas");
  const cerrar = () => { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", ev => { ev.stopPropagation(); const abierto = menu.classList.toggle("open"); btn.setAttribute("aria-expanded", abierto ? "true" : "false"); });
  menu.addEventListener("click", ev => { if (ev.target.closest(".btn")) cerrar(); });
  document.addEventListener("click", ev => { if (!ev.target.closest("#menuMas, #btnMenu")) cerrar(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") cerrar(); });
})();

/* ================= comisiones (tabla MySQL) ================= */
async function cargarComisiones(){
  try {
    const filas = await api("informes.php?recurso=comisiones");
    if (Array.isArray(filas) && filas.length){ COMISIONES = filas; CM = construirCM(filas); render(); }
  } catch(e){}
  renderEditorComisiones();
}
function renderEditorComisiones(){
  const box = document.getElementById("comEditor"); if (!box) return;
  const card = document.getElementById("comCard");
  if (!usuario || usuario.rol !== "admin" || !COMISIONES.some(f => f.id)){ if (card) card.hidden = true; return; }
  card.hidden = false;
  const nombres = {fibra:"Fibra (Mb)", movil:"Línea móvil (GB)", extra_portabilidad:"Extra portabilidad", extra_empresa:"Extra empresa", descuento_digi:"Desde Digi", movil_principal:"1ª línea (GB)", movil_2a4:"2ª a 4ª línea (GB)", movil_5mas:"5ª línea y más (GB)"};
  box.innerHTML = `<div style="overflow-x:auto"><table class="comt"><thead><tr><th>Marca</th><th>Concepto</th><th>Tramo</th><th>€ (portabilidad)</th><th>€ alta nueva</th></tr></thead><tbody>${
    COMISIONES.map(f => `<tr><td>${esc(f.marca)}</td><td>${esc(nombres[f.concepto] || f.concepto)}</td><td>${esc(f.tramo)}</td>
      <td><input type="number" step="0.01" id="cm-${f.id}-i" data-cid="${f.id}" data-k="importe" value="${esc(f.importe)}" aria-label="Importe"></td>
      <td>${f.importe_alta === null || f.importe_alta === undefined ? "" : `<input type="number" step="0.01" id="cm-${f.id}-a" data-cid="${f.id}" data-k="importe_alta" value="${esc(f.importe_alta)}" aria-label="Importe alta nueva">`}</td></tr>`).join("")
  }</tbody></table></div><div><button type="button" class="btn gold" id="saveCom">Guardar comisiones</button></div>`;
}
document.addEventListener("input", e => {
  const el = e.target; if (!el.dataset || !el.dataset.cid) return;
  const f = COMISIONES.find(x => String(x.id) === el.dataset.cid); if (!f) return;
  f[el.dataset.k] = el.value; CM = construirCM(COMISIONES); schedule();
});
document.addEventListener("click", async e => {
  if (!e.target.closest || !e.target.closest("#saveCom")) return;
  try { const r = await api("informes.php?recurso=comisiones", {method:"POST", body:JSON.stringify({filas:COMISIONES.map(f => ({id:f.id, importe:f.importe, importe_alta:f.importe_alta}))})}); toast("Comisiones guardadas (" + r.actualizadas + ")"); }
  catch(err){ toast("No se pudieron guardar: " + err.message); }
});

/* ================= perfiles de tarifas ================= */
async function cargarPerfiles(){
  try { const r = await api("informes.php?recurso=perfiles"); savedPerfiles = r.map(p => Object.assign({}, p.datos || {}, {id:String(p.id), nombre:p.nombre})); }
  catch(e){ savedPerfiles = []; }
  const sel = $("#perfilSel"); if (sel){ const v = sel.value; renderPerfilOptions(sel); sel.value = v; }
}
async function savePerfil(){
  const nombre = (state.perfil.nombre || "").trim() || state.perfil.config;
  if (!nombre){ toast("Ponle un nombre al perfil."); return; }
  try{
    await api("informes.php?recurso=perfiles", {method:"POST", body:JSON.stringify({nombre, datos:{config:state.perfil.config, fechaTarifas:state.perfil.fechaTarifas || hoyISO(), nota:state.perfil.nota || "", ops:clone(state.perfil.ops)}})});
    toast("Perfil de tarifas guardado: " + nombre); cargarPerfiles();
  } catch(err){ toast(err.message); }
}
function renderPerfilOptions(sel){
  sel.innerHTML = `<option value="">Elegir…</option>` +
    (savedPerfiles.length ? `<optgroup label="Guardados">` + savedPerfiles.map(p => `<option value="s:${esc(p.id)}">${esc(p.nombre)}</option>`).join("") + `</optgroup>` : "") +
    `<optgroup label="Ejemplos">` + BUILTIN_PERFILES.map(p => `<option value="b:${p.id}">${esc(p.nombre)}</option>`).join("") + `</optgroup>`;
}

/* ================= consultora (usuario con sesión) ================= */
const LS_CARGO = "icc-informe-cargo";
function consultoraUsuario(){
  let cargo = "Consultor/a de optimización de telecomunicaciones";
  try { const c = localStorage.getItem(LS_CARGO + ":" + (usuario && usuario.id)); if (c) cargo = c; } catch(e){}
  return {nombre:(usuario && usuario.nombre) || "", cargo, email:(usuario && usuario.email) || ""};
}
function saveConsultora(){
  try { localStorage.setItem(LS_CARGO + ":" + (usuario && usuario.id), state.consultora.cargo || ""); } catch(e){}
  cfg.consultora = clone(state.consultora);
  toast("Cargo guardado para tus próximos informes");
}

/* ================= sesión ================= */
function mostrarLogin(){ $("#login").hidden = false; $("#app").hidden = true; setTimeout(() => { const e = $("#lg-email"); if (e) e.focus(); }, 50); }
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#lg-msg"); msg.textContent = "";
  try{
    await api("auth.php?action=login", {method:"POST", body:JSON.stringify({email:$("#lg-email").value.trim(), password:$("#lg-pass").value})});
    $("#lg-pass").value = "";
    const me = await api("auth.php?action=me");
    usuario = me && me.user; crmCliente = me && me.crm_cliente;
    if (!usuario){ msg.textContent = (me && me.aviso) || "No se pudo iniciar sesión."; return; }
    await arrancar();
  } catch(err){ msg.textContent = err.message; }
});
$("#btnSalir").addEventListener("click", async () => {
  try { await api("auth.php?action=logout", {method:"POST", body:"{}"}); } catch(e){}
  usuario = null; mostrarLogin();
});

async function arrancar(){
  $("#login").hidden = true; $("#app").hidden = false;
  $("#userName").textContent = usuario.nombre || usuario.email;
  try { const cf = await api("informes.php?recurso=config"); cfg.prefijo = cf.prefijo; cfg.siguiente = cf.siguiente; }
  catch(err){ if (err.status === 401){ mostrarLogin(); return; } toast(err.message || "No se pudo cargar la configuración del comparador."); }
  cfg.consultora = consultoraUsuario();
  // Borrador local de este navegador; si no hay, informe nuevo con el usuario como consultor.
  let borrador = null;
  try { const raw = localStorage.getItem(LS + ":" + usuario.id); if (raw) borrador = JSON.parse(raw); } catch(e){}
  if (borrador && borrador.cliente){ state = borrador; }
  else { state = baseState(); state.id = null; state.presupuesto.numero = cfg.prefijo + cfg.siguiente; state.presupuesto.fecha = hoyISO();
    state.cliente = {nombre:"", ubicacion:"Gijón (Asturias)", operador:"", periodo:""};
    state.lineas = [{concepto:"Cuota principal", importe:0, tag:"PRECIO MEDIO"}]; state.anterior = {importe:"", mes:""}; state.propuestaNota = "";
    state.wz = {fase:"factura", paso:0, tipo:"", serv:{fibra:600, fijo:true, tv:false, lineas:["∞","∞"]}}; }
  if (!state.consultora || !state.consultora.nombre) state.consultora = consultoraUsuario();
  // Abierto desde la ficha de un cliente del CRM: informe nuevo con sus datos.
  if (crmCliente){
    state = baseState(); state.id = null; state.presupuesto.numero = cfg.prefijo + cfg.siguiente; state.presupuesto.fecha = hoyISO();
    state.cliente = {nombre:crmCliente.razon_social || "", ubicacion:"", operador:"", periodo:""};
    state.lineas = [{concepto:"Cuota principal", importe:0, tag:"PRECIO MEDIO"}]; state.anterior = {importe:"", mes:""}; state.propuestaNota = "";
    state.wz = {fase:"factura", paso:0, tipo:"", serv:{fibra:600, fijo:true, tv:false, lineas:["∞","∞"]}};
    state.consultora = consultoraUsuario(); state.crmClienteId = crmCliente.id;
    toast("Informe nuevo para " + (crmCliente.razon_social || "el cliente"));
  }
  history.replaceState(null, "", location.pathname);
  renderForm(); render();
  const informeUrl = PARAMS.get("informe");
  if (/^\d+$/.test(informeUrl || "")) loadInforme(informeUrl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);
  cargarPerfiles(); cargarInformes(); cargarComisiones(); cargarSeguridad();
}

/* ================= arranque ================= */
(async () => {
  try { const r = await api("auth.php?action=me"); usuario = r && r.user; crmCliente = r && r.crm_cliente; } catch(e){ usuario = null; }
  if (usuario) arrancar(); else mostrarLogin();
})();
})();
