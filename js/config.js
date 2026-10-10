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

  ROLES_DESC: {
    comercial: "Gestiona su propia cartera: clientes, presupuestos, contratos y agenda",
    backoffice: "Estudios de ahorro, tarifas y soporte a toda la red comercial",
    jefe_de_equipo: "Supervision comercial de su equipo asignado",
    admin: "Direccion: ve y gestiona todo el negocio y las cuentas del equipo",
    super_admin: "Control total, incluidas las cuentas de Administrador",
  },

  ESTADOS_DISPONIBILIDAD: {
    disponible: { label: "Disponible", color: "#34d399" },
    ocupado: { label: "Ocupado", color: "#fbbf24" },
    ausente: { label: "Ausente", color: "#94a3b8" },
    vacaciones: { label: "Vacaciones", color: "#60a5fa" },
    baja: { label: "Baja", color: "#f87171" },
  },

  DIAS_SEMANA: [
    ["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miercoles"], ["jue", "Jueves"],
    ["vie", "Viernes"], ["sab", "Sabado"], ["dom", "Domingo"],
  ],

  AVISOS_USUARIO: [
    ["ficha_agente", "Seguimiento de la ficha", "Cuando alguien anota una reunion, objetivo o incidencia en tu ficha (o en la de alguien de tu equipo)"],
    ["oferta_presentada", "Estudios de ahorro listos", "Cuando backoffice publica el estudio comparativo de uno de tus clientes"],
    ["cuenta", "Avisos de la cuenta", "Cambios en tus permisos y otros avisos de seguridad"],
  ],

  ACCIONES_HISTORIAL: {
    login: "Inicio de sesion",
    login_fallido: "Intento de acceso fallido",
    cuenta_creada: "Cuenta creada",
    datos_actualizados: "Ficha actualizada",
    foto_actualizada: "Foto de perfil actualizada",
    foto_eliminada: "Foto de perfil eliminada",
    rol_cambiado: "Rol cambiado",
    responsable_cambiado: "Responsable cambiado",
    permisos_cambiados: "Permisos modificados",
    permisos_restablecidos: "Permisos restablecidos al rol",
    cuenta_bloqueada: "Cuenta bloqueada",
    cuenta_desbloqueada: "Cuenta desbloqueada",
    password_cambiada: "Contrasena cambiada",
    password_restablecida: "Contrasena restablecida",
    cambio_password_exigido: "Cambio de contrasena exigido",
    cambio_password_no_exigido: "Ya no se exige cambio de contrasena",
    sesiones_cerradas: "Sesiones cerradas",
    sesion_cerrada: "Sesion cerrada",
    disponibilidad_actualizada: "Disponibilidad actualizada",
    avisos_actualizados: "Notificaciones actualizadas",
    ver_como: "Acceso con \"Ver como\"",
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

  CATALOGOS_TARIFA: {
    energia: "Energia (Luz y Gas)",
    telefonia: "Telefonia e Internet",
    alarmas: "Alarmas y Seguridad",
    mercado: "Mercado (competencia)",
  },

  // Datos de la empresa que aparecen en los informes PDF del Comparador.
  // El telefono y el email se sustituyen por los del gestor que genera la
  // auditoria cuando los tiene rellenos en su ficha.
  EMPRESA: {
    name: "Integral Connection Consulting",
    phone: "",
    email: "info@integralconnectionconsulting.es",
    whatsapp: "",
  },

  // Logos opcionales de compañias para el PDF: { endesa: "assets/companias/endesa.png", ... }
  LOGOS_COMPANIAS: {},

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
    seguros: { label: "Seguros", color: "#f472b6" },
    financiero: { label: "Financiero", color: "#22d3ee" },
    multisectorial: { label: "Multisectorial", color: "#a78bfa" },
  },

  ESTADOS_CITA: {
    programada: { label: "Programada", color: "#60a5fa" },
    confirmada: { label: "Confirmada", color: "#22d3ee" },
    realizada: { label: "Realizada", color: "#34d399" },
    reprogramada: { label: "Reprogramada", color: "#fbbf24" },
    ko: { label: "KO", color: "#f87171" },
  },
  ESTADOS_CITA_ORDEN: ["programada", "confirmada", "realizada", "reprogramada", "ko"],

  TIPOS_CITA: {
    visita: { label: "Visita", icono: "🤝" },
    llamada: { label: "Llamada", icono: "📞" },
    reunion: { label: "Reunion", icono: "👥" },
    videollamada: { label: "Videollamada", icono: "💻" },
    seguimiento: { label: "Seguimiento", icono: "🔁" },
    firma: { label: "Firma", icono: "✍️" },
    otro: { label: "Otro", icono: "📌" },
  },

  TIPOS_RELACION_AGENTE: {
    autonomo: "Autonomo",
    empleado: "Empleado",
    colaborador: "Colaborador",
    subagente: "Subagente",
    otro: "Otro",
  },

  TIPOS_SEGUIMIENTO_AGENTE: {
    nota: { label: "Nota", icono: "📝", color: "#94a3b8" },
    reunion: { label: "Reunion", icono: "🤝", color: "#60a5fa" },
    objetivo: { label: "Objetivo", icono: "🎯", color: "#22d3ee" },
    formacion: { label: "Formacion", icono: "🎓", color: "#a78bfa" },
    incidencia: { label: "Incidencia", icono: "⚠️", color: "#f87171" },
    reconocimiento: { label: "Reconocimiento", icono: "🏆", color: "#34d399" },
  },
};
