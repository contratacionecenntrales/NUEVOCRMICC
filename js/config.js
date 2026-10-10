/* =============================================================================
   ICC CRM · Catalogos compartidos por la interfaz
   ============================================================================= */
window.ICC_CONST = {
  ROLES: {
    comercial: "Comercial / Agente",
    backoffice: "Backoffice",
    jefe_de_equipo: "Jefe de equipo",
    admin: "Administrador",
    super_admin: "Super Administrador",
  },

  ESTADOS: {
    lead_captado: { label: "Nuevo Lead / Prospecto", color: "#94a3b8" },
    estudio_backoffice: { label: "Auditoria / Analisis de Factura", color: "#fbbf24" },
    oferta_presentada: { label: "Propuesta / Oferta Presentada", color: "#22d3ee" },
    en_cierre: { label: "En Negociacion / Cierre", color: "#818cf8" },
    cliente_activo: { label: "Ganado (Contrato Firmado)", color: "#34d399" },
    perdido: { label: "Perdido", color: "#f87171" },
  },
  ESTADOS_ORDEN: [
    "lead_captado",
    "estudio_backoffice",
    "oferta_presentada",
    "en_cierre",
    "cliente_activo",
    "perdido",
  ],

  SERVICIOS: {
    energia: "Energia",
    telecomunicaciones: "Telecomunicaciones",
    seguros: "Seguros",
    alarmas: "Alarmas",
    financiero: "Financiero",
    paginas_web: "Paginas web",
    campanas: "Gestion de campanas",
  },

  SECTORES: {
    energia: "Energia",
    telecomunicaciones: "Telecomunicaciones",
    alarmas: "Alarmas",
    seguros: "Seguros",
    financiero: "Financiero",
  },

  TIPO_DOCUMENTO: {
    factura: "Factura / suministro",
    estudio: "Estudio comparativo",
    contrato_firmado: "Contrato firmado",
    otro: "Otro",
  },

  ESTADOS_CONTRATO: {
    tramitado: { label: "Tramitado", color: "#94a3b8" },
    ok: { label: "OK", color: "#34d399" },
    ko: { label: "KO", color: "#f87171" },
    incidencias: { label: "Incidencias", color: "#fbbf24" },
    verificado: { label: "Verificado", color: "#22d3ee" },
    decomisionado: { label: "Decomisionado", color: "#818cf8" },
    en_distribuidora: { label: "En Distribuidora", color: "#d4a62a" },
  },
  ESTADOS_CONTRATO_ORDEN: ["tramitado", "ok", "ko", "incidencias", "verificado", "decomisionado", "en_distribuidora"],

  FACTURADO_POR: { ICC: "ICC", ELITE_ENERGY: "Elite Energy", EVOLVIX_GLOBAL: "Evolvix Global" },
  ESTADO_PAGO: { pagada: "Pagada", pendiente: "Pendiente" },

  COMPARADOR_SECTORES: {
    energia: "Energia (Luz y Gas)",
    telefonia: "Telefonia e Internet",
    alarmas: "Alarmas y Seguridad",
  },

  TIPO_CLIENTE: {
    residencial: "Residencial",
    pyme: "Pyme",
    comunidad_vecinos: "Comunidad de vecinos",
    gran_cuenta: "Gran cuenta",
  },

  TIPO_SUMINISTRO: {
    electricidad: "Electricidad",
    gas: "Gas",
    dual: "Dual (Luz + Gas)",
  },

  MOTIVOS_PERDIDA: [
    "Precio / condiciones no competitivas",
    "Ya tiene compromiso de permanencia con otra compañia",
    "No contesta / lead frio",
    "Se lo pensara mas adelante",
    "Documentacion incompleta o no aportada",
    "Otro motivo",
  ],

  ESTADOS_PRESUPUESTO: {
    borrador: { label: "Borrador", color: "#94a3b8" },
    factura_subida: { label: "Factura Subida", color: "#fbbf24" },
    estudio_adjunto: { label: "Estudio Adjunto", color: "#22d3ee" },
    documentacion_contrato: { label: "Documentacion Contrato", color: "#818cf8" },
    cerrado: { label: "Cerrado / Aprobado", color: "#34d399" },
  },
  ESTADOS_PRESUPUESTO_ORDEN: ["borrador", "factura_subida", "estudio_adjunto", "documentacion_contrato", "cerrado"],

  SECTORES_CITA: {
    energia: { label: "Energia", color: "#60a5fa" },
    telecomunicaciones: { label: "Telecomunicaciones", color: "#34d399" },
    alarmas: { label: "Alarmas", color: "#f59e0b" },
    multisectorial: { label: "Multisectorial", color: "#a78bfa" },
  },

  ESTADOS_CITA: {
    programada: { label: "Programada", color: "#60a5fa" },
    realizada: { label: "Realizada", color: "#34d399" },
    reprogramada: { label: "Reprogramada", color: "#fbbf24" },
    ko: { label: "KO", color: "#f87171" },
  },
  ESTADOS_CITA_ORDEN: ["programada", "realizada", "reprogramada", "ko"],
};
