/* =============================================================================
   ICC CRM · Motor del Comparador y Auditor Inteligente
   GENERADO a partir del proyecto "integral-connection-comparador" (src/lib):
   calculos de energia/telefonia/alarmas, auditoria de telecomunicaciones y
   los dos informes PDF. Se ha mantenido el codigo original; solo se han
   sustituido los import/export de modulos por un objeto global.
   ============================================================================= */
window.icc = window.icc || {};
window.icc.comparadorMotor = (function () {
  var MODS = {};

  // ---------------------------------------------------------------- constants (src/lib/constants.js)
  MODS.constants = (function () {
    const COMPANY = window.ICC_CONST.EMPRESA

    const SECTORES = {
      ENERGIA: 'energia',
      TELEFONIA: 'telefonia',
      ALARMAS: 'alarmas',
      PACK_INTEGRAL: 'pack_integral',
    }

    const SECTOR_LABELS = {
      [SECTORES.ENERGIA]: 'Energía (Luz y Gas)',
      [SECTORES.TELEFONIA]: 'Telefonía e Internet',
      [SECTORES.ALARMAS]: 'Alarmas y Seguridad',
      [SECTORES.PACK_INTEGRAL]: 'Pack Integral',
    }

    // IVA general (energía tiene además el Impuesto Especial sobre la Electricidad)
    const IVA = 0.21
    const IMPUESTO_ELECTRICIDAD = 0.0511269632 // sobre el importe de potencia + energía
    const IMPUESTO_HIDROCARBUROS_GAS = 0.00234 // €/kWh (impuesto especial sobre el gas, referencia)

    // Financiación del Bono Social (Real Decreto 897/2017): cargo regulado fijo
    // por día de suministro eléctrico, idéntico para todas las comercializadoras
    // (no es un precio comercial, así que no forma parte de las tarifas del
    // catálogo). Se muestra como partida "Varios" en la factura, igual que en
    // los modelos reales (Endesa, Iberdrola, etc.).
    const BONO_SOCIAL_DIA = 0.019121
    return { COMPANY, SECTORES, SECTOR_LABELS, IVA, IMPUESTO_ELECTRICIDAD, IMPUESTO_HIDROCARBUROS_GAS, BONO_SOCIAL_DIA }
  })();

  // ---------------------------------------------------------------- format (src/lib/format.js)
  MODS.format = (function () {
    // Formateo manual (sin depender de Intl.NumberFormat) para el separador de
    // miles: algunos entornos de renderizado (p. ej. el Chromium headless usado
    // para generar PDFs) traen datos ICU reducidos y Intl('es-ES') no aplica el
    // punto de millar, mostrando "2800,56 €" en vez de "2.800,56 €". Haciéndolo
    // a mano funciona igual en cualquier navegador o entorno.
    function formatNumber(value, decimals = 2) {
      const numero = Number(value) || 0
      const negativo = numero < 0
      const fijo = Math.abs(numero).toFixed(decimals)
      const [entero, decimal] = fijo.split('.')
      const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      const resultado = decimal ? `${conMiles},${decimal}` : conMiles
      return negativo ? `-${resultado}` : resultado
    }

    function formatEUR(value) {
      return `${formatNumber(value, 2)} €`
    }

    function formatPercent(value) {
      return `${formatNumber(value, 1)}%`
    }
    return { formatNumber, formatEUR, formatPercent }
  })();

  // ---------------------------------------------------------------- energy (src/lib/calculations/energy.js)
  MODS.energy = (function () {
    const { IVA, IMPUESTO_ELECTRICIDAD, BONO_SOCIAL_DIA } = MODS.constants
    const DIAS_ANIO = 365

    /**
     * Calcula el coste de un suministro de LUZ (2.0TD o 3.0TD) para un set de
     * precios dado (los del cliente o los de una tarifa del catálogo), a partir
     * del consumo y potencias contratadas.
     *
     * @param {object} input
     * @param {number} input.diasFactura - días que cubre la factura/periodo introducido
     * @param {object} input.potencias - { p1, p2, p3? } kW contratados por periodo
     * @param {object} input.consumos - { p1, p2, p3?, p4?, p5?, p6? } kWh consumidos en el periodo
     * @param {object} precios - { potencia:{p1,p2,p3?}, energia:{p1,p2,p3,...}, terminoFijoMensual, alquilerEquipoDia }
     */
    function calcularCosteLuz(input, precios) {
      const { diasFactura, potencias, consumos } = input
      const periodos = Object.keys(consumos).filter((k) => consumos[k] != null)

      const desglosePeriodos = periodos.map((p) => {
        const consumoKwh = Number(consumos[p]) || 0
        const potenciaKw = Number(potencias[p] ?? potencias.p1) || 0
        const precioEnergia = Number(precios.energia[p] ?? 0)
        const precioPotencia = Number(precios.potencia?.[p] ?? 0)

        const costeEnergia = consumoKwh * precioEnergia
        const costePotencia = potenciaKw * precioPotencia * diasFactura

        return {
          periodo: p.toUpperCase(),
          consumoKwh,
          potenciaKw,
          precioEnergia,
          precioPotencia,
          costeEnergia,
          costePotencia,
        }
      })

      const terminoEnergia = desglosePeriodos.reduce((sum, d) => sum + d.costeEnergia, 0)
      const terminoPotencia = desglosePeriodos.reduce((sum, d) => sum + d.costePotencia, 0)
      const terminoFijo = ((Number(precios.terminoFijoMensual) || 0) / 30) * diasFactura
      const alquilerEquipo = (Number(precios.alquilerEquipoDia) || 0) * diasFactura
      const financiacionBonoSocial = BONO_SOCIAL_DIA * diasFactura

      const baseImponible = terminoEnergia + terminoPotencia + terminoFijo + alquilerEquipo + financiacionBonoSocial
      const impuestoElectricidad = baseImponible * IMPUESTO_ELECTRICIDAD
      const baseConImpuesto = baseImponible + impuestoElectricidad
      const iva = baseConImpuesto * IVA
      const total = baseConImpuesto + iva

      const factorAnual = DIAS_ANIO / diasFactura

      return {
        diasFactura,
        desglosePeriodos,
        terminoEnergia,
        terminoPotencia,
        terminoFijo,
        alquilerEquipo,
        financiacionBonoSocial,
        baseImponible,
        impuestoElectricidad,
        iva,
        total,
        totalAnual: total * factorAnual,
        totalMensualMedio: (total * factorAnual) / 12,
      }
    }

    /**
     * Calcula el coste de un suministro de GAS a partir de un consumo único
     * (RL.1 / RL.2 / RL.3 no distinguen periodos horarios).
     */
    function calcularCosteGas(input, precios) {
      const diasFactura = input.diasFactura
      const consumoKwh = Number(input.consumoKwh) || 0
      const precioEnergia = Number(precios.energia?.p1 ?? 0)

      const terminoEnergia = consumoKwh * precioEnergia
      const terminoFijo = ((Number(precios.terminoFijoMensual) || 0) / 30) * diasFactura

      const baseImponible = terminoEnergia + terminoFijo
      const iva = baseImponible * IVA
      const total = baseImponible + iva

      const factorAnual = DIAS_ANIO / diasFactura

      return {
        diasFactura,
        consumoKwh,
        precioEnergia,
        terminoEnergia,
        terminoFijo,
        baseImponible,
        iva,
        total,
        totalAnual: total * factorAnual,
        totalMensualMedio: (total * factorAnual) / 12,
      }
    }

    function precioTarifaComo(tarifa) {
      return {
        potencia: {
          p1: tarifa.precio_potencia_p1,
          p2: tarifa.precio_potencia_p2,
          p3: tarifa.precio_potencia_p3,
          p4: tarifa.precio_potencia_p4,
          p5: tarifa.precio_potencia_p5,
          p6: tarifa.precio_potencia_p6,
        },
        energia: {
          p1: tarifa.precio_energia_p1,
          p2: tarifa.precio_energia_p2,
          p3: tarifa.precio_energia_p3,
          p4: tarifa.precio_energia_p4,
          p5: tarifa.precio_energia_p5,
          p6: tarifa.precio_energia_p6,
        },
        terminoFijoMensual: tarifa.termino_fijo_mensual,
        alquilerEquipoDia: tarifa.alquiler_equipo_dia,
      }
    }

    /**
     * Compara la factura actual del cliente (luz) frente a todas las tarifas
     * activas del catálogo para el mismo segmento, y devuelve la mejor propuesta.
     */
    function compararLuz(datosCliente, tarifasCatalogo) {
      const precioActual = {
        potencia: datosCliente.precioPotenciaActual,
        energia: datosCliente.precioEnergiaActual,
        terminoFijoMensual: datosCliente.terminoFijoActualMensual || 0,
        alquilerEquipoDia: datosCliente.alquilerContadorDiaActual || 0,
      }

      const input = {
        diasFactura: datosCliente.diasFactura,
        potencias: datosCliente.potencias,
        consumos: datosCliente.consumos,
      }

      const costeActual = calcularCosteLuz(input, precioActual)

      const candidatas = tarifasCatalogo
        .filter((t) => t.tipo === 'luz' && t.segmento === datosCliente.segmento)
        .map((tarifa) => ({
          tarifa,
          coste: calcularCosteLuz(input, precioTarifaComo(tarifa)),
        }))
        .sort((a, b) => a.coste.totalAnual - b.coste.totalAnual)

      const mejor = candidatas[0] || null

      return {
        tipo: 'luz',
        segmento: datosCliente.segmento,
        costeActual,
        mejorPropuesta: mejor,
        todasLasPropuestas: candidatas,
        ahorroAnual: mejor ? costeActual.totalAnual - mejor.coste.totalAnual : 0,
        ahorroPorcentaje: mejor ? ((costeActual.totalAnual - mejor.coste.totalAnual) / costeActual.totalAnual) * 100 : 0,
      }
    }

    function compararGas(datosCliente, tarifasCatalogo) {
      const precioActual = {
        energia: { p1: datosCliente.precioEnergiaActual },
        terminoFijoMensual: datosCliente.terminoFijoActualMensual || 0,
      }

      const input = {
        diasFactura: datosCliente.diasFactura,
        consumoKwh: datosCliente.consumoKwh,
      }

      const costeActual = calcularCosteGas(input, precioActual)

      const candidatas = tarifasCatalogo
        .filter((t) => t.tipo === 'gas' && t.segmento === datosCliente.segmento)
        .map((tarifa) => ({
          tarifa,
          coste: calcularCosteGas(input, { energia: { p1: tarifa.precio_energia_p1 }, terminoFijoMensual: tarifa.termino_fijo_mensual }),
        }))
        .sort((a, b) => a.coste.totalAnual - b.coste.totalAnual)

      const mejor = candidatas[0] || null

      return {
        tipo: 'gas',
        segmento: datosCliente.segmento,
        costeActual,
        mejorPropuesta: mejor,
        todasLasPropuestas: candidatas,
        ahorroAnual: mejor ? costeActual.totalAnual - mejor.coste.totalAnual : 0,
        ahorroPorcentaje: mejor ? ((costeActual.totalAnual - mejor.coste.totalAnual) / costeActual.totalAnual) * 100 : 0,
      }
    }
    return { calcularCosteLuz, calcularCosteGas, compararLuz, compararGas }
  })();

  // ---------------------------------------------------------------- telephony (src/lib/calculations/telephony.js)
  MODS.telephony = (function () {
    const { IVA } = MODS.constants
    /**
     * Motor de comparación de telefonía / internet.
     *
     * El cliente puede añadir varias fibras (p.ej. varias sedes) y varias
     * líneas móviles (cada una con su propio número y GB deseados, para poder
     * calcar una factura real línea a línea).
     *
     * Estrategia de matching:
     * 1. Si hay exactamente UNA fibra y alguna línea móvil, se busca primero un
     *    paquete CONVERGENTE que cubra la velocidad de esa fibra y el número de
     *    líneas móviles (con el perfil de datos más exigente de todas ellas) —
     *    suele ser la opción más económica.
     * 2. Si no hay convergente que cubra todo (o hay más de una fibra, lo que ya
     *    no encaja en un único paquete convergente), se compone la propuesta:
     *    la mejor tarifa de fibra para cada fibra solicitada + la mejor tarifa
     *    móvil para cada línea, individualmente (cada línea puede necesitar
     *    GB distintos).
     */

    function cumpleLinea(tarifa, linea) {
      if (linea.ilimitado) return Boolean(tarifa.datos_ilimitados)
      if (tarifa.datos_ilimitados) return true
      return (Number(tarifa.gb_datos) || 0) >= Number(linea.gbDeseados || 0)
    }

    function ordenarPorPrecio(lista) {
      return [...lista].sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual))
    }

    function encontrarMejorPaquete(datosCliente, tarifasCatalogo) {
      const fibras = datosCliente.fibras || []
      const lineasMoviles = datosCliente.lineasMoviles || []
      const numLineas = lineasMoviles.length

      // 1. Intento de paquete convergente (solo tiene sentido con una única fibra)
      if (fibras.length === 1 && numLineas > 0) {
        const fibra = fibras[0]
        const exigeIlimitado = lineasMoviles.some((l) => l.ilimitado)
        const gbMax = Math.max(0, ...lineasMoviles.filter((l) => !l.ilimitado).map((l) => Number(l.gbDeseados) || 0))

        const convergentesValidos = ordenarPorPrecio(
          tarifasCatalogo.filter(
            (t) =>
              t.tipo === 'convergente' &&
              (Number(t.velocidad_fibra_mb) || 0) >= Number(fibra.velocidadDeseada || 0) &&
              Number(t.lineas_moviles_incluidas) >= numLineas &&
              (exigeIlimitado ? t.datos_ilimitados : t.datos_ilimitados || (Number(t.gb_datos) || 0) >= gbMax)
          )
        )

        if (convergentesValidos.length > 0) {
          const elegido = convergentesValidos[0]
          return {
            estrategia: 'convergente',
            componentes: [
              {
                tarifa: elegido,
                cantidad: 1,
                etiqueta: `${fibra.etiqueta || 'Fibra'} + ${numLineas} línea${numLineas > 1 ? 's' : ''} móvil${numLineas > 1 ? 'es' : ''}`,
              },
            ],
            precioMensual: Number(elegido.precio_mensual),
          }
        }
      }

      // 2. Composición: cada fibra y cada línea móvil se cubren por separado
      const fibrasCatalogo = ordenarPorPrecio(tarifasCatalogo.filter((t) => t.tipo === 'fibra'))
      const movilesCatalogo = tarifasCatalogo.filter((t) => t.tipo === 'movil')

      const componentes = []

      fibras.forEach((fibra) => {
        const validas = ordenarPorPrecio(fibrasCatalogo.filter((t) => (Number(t.velocidad_fibra_mb) || 0) >= Number(fibra.velocidadDeseada || 0)))
        if (validas[0]) {
          componentes.push({ tarifa: validas[0], cantidad: 1, etiqueta: fibra.etiqueta || 'Fibra' })
        }
      })

      lineasMoviles.forEach((linea, idx) => {
        const validas = ordenarPorPrecio(movilesCatalogo.filter((t) => cumpleLinea(t, linea)))
        if (validas[0]) {
          componentes.push({
            tarifa: validas[0],
            cantidad: 1,
            etiqueta: linea.numero ? `Línea ${linea.numero}` : `Línea móvil ${idx + 1}`,
          })
        }
      })

      const precioMensual = componentes.reduce((sum, c) => sum + Number(c.tarifa.precio_mensual) * c.cantidad, 0)

      return { estrategia: fibras.length > 0 ? 'compuesto' : 'solo_movil', componentes, precioMensual }
    }

    /**
     * Construye el "Resumen de factura" al estilo Movistar Fusión a partir de
     * los importes (IVA incluido, como se ven en cualquier factura o tarifa
     * comercial) de cuotas mensuales, consumos fuera de bono y otros conceptos
     * (roaming, servicios adicionales...). Descompone en base imponible + IVA,
     * igual que el bloque "Impuestos" de la factura real.
     */
    function resumenFactura({ cuotas = 0, consumos = 0, otros = 0 }) {
      const total = Number(cuotas) + Number(consumos) + Number(otros)
      const base = total / (1 + IVA)
      const iva = total - base
      return { cuotas: Number(cuotas), consumos: Number(consumos), otros: Number(otros), base, iva, total }
    }

    function compararTelefonia(datosCliente, tarifasCatalogo) {
      const desgloseActual = resumenFactura({
        cuotas: datosCliente.cuotaMensualActual,
        consumos: datosCliente.consumosActual,
        otros: datosCliente.otrosConceptosActual,
      })

      const propuesta = encontrarMejorPaquete(datosCliente, tarifasCatalogo)
      const desglosePropuesta = resumenFactura({ cuotas: propuesta.precioMensual })

      const costeActualMensual = desgloseActual.total
      const costePropuestaMensual = desglosePropuesta.total
      const ahorroMensual = costeActualMensual - costePropuestaMensual
      const ahorroAnual = ahorroMensual * 12
      const ahorroPorcentaje = costeActualMensual > 0 ? (ahorroMensual / costeActualMensual) * 100 : 0

      return {
        desgloseActual,
        desglosePropuesta,
        costeActualMensual,
        costeActualAnual: costeActualMensual * 12,
        propuesta,
        costePropuestaMensual,
        costePropuestaAnual: costePropuestaMensual * 12,
        ahorroMensual,
        ahorroAnual,
        ahorroPorcentaje,
        cambioTitular: datosCliente.cambioTitular?.activo ? datosCliente.cambioTitular : null,
      }
    }
    return { encontrarMejorPaquete, compararTelefonia }
  })();

  // ---------------------------------------------------------------- alarms (src/lib/calculations/alarms.js)
  MODS.alarms = (function () {
    const { IVA } = MODS.constants
    /**
     * Motor de comparación de alarmas. Se busca el kit de nuestro catálogo con
     * igual o mejor equipamiento (cámaras y sensores) al menor coste mensual.
     * Si el cliente tiene un equipamiento superior a cualquier kit disponible,
     * se ofrece el kit de gama más alta como mejor alternativa posible.
     */
    function encontrarMejorKit(datosCliente, tarifasCatalogo) {
      const numCamaras = Number(datosCliente.numCamarasActual) || 0
      const numSensores = Number(datosCliente.numSensoresActual) || 0

      const candidatos = tarifasCatalogo.filter(
        (kit) => Number(kit.num_camaras) >= numCamaras && Number(kit.num_sensores) >= numSensores
      )

      const ordenados = (candidatos.length > 0 ? candidatos : tarifasCatalogo)
        .slice()
        .sort((a, b) => {
          if (candidatos.length === 0) {
            // fallback: sin candidato que iguale equipamiento, prioriza el de mayor gama
            return Number(b.num_camaras) + Number(b.num_sensores) - (Number(a.num_camaras) + Number(a.num_sensores))
          }
          return Number(a.cuota_mensual) - Number(b.cuota_mensual)
        })

      return {
        kit: ordenados[0] || null,
        cubreEquipamiento: candidatos.length > 0,
      }
    }

    /**
     * Descompone un importe total (cuota + pago al contado, IVA incluido como
     * se comercializa) en Base Imponible + IVA(21%) + Total a pagar, igual que
     * el bloque final de una factura de alarmas tipo Securitas Direct.
     */
    function desgloseFacturaAlarma({ cuota = 0, pagoContado = 0 }) {
      const totalPorServicios = Number(cuota) + Number(pagoContado)
      const base = totalPorServicios / (1 + IVA)
      const iva = totalPorServicios - base
      return {
        cuota: Number(cuota),
        pagoContado: Number(pagoContado),
        totalPorServicios,
        base,
        iva,
        totalAPagar: totalPorServicios,
      }
    }

    function compararAlarmas(datosCliente, tarifasCatalogo) {
      const costeActualMensual = Number(datosCliente.cuotaMensualActual) || 0
      const { kit, cubreEquipamiento } = encontrarMejorKit(datosCliente, tarifasCatalogo)

      const costePropuestaMensual = kit ? Number(kit.cuota_mensual) : 0
      const ahorroMensual = costeActualMensual - costePropuestaMensual
      const ahorroAnual = ahorroMensual * 12
      const ahorroPorcentaje = costeActualMensual > 0 ? (ahorroMensual / costeActualMensual) * 100 : 0

      const desgloseActual = desgloseFacturaAlarma({ cuota: costeActualMensual })
      const desglosePropuesta = desgloseFacturaAlarma({
        cuota: costePropuestaMensual,
        pagoContado: kit ? Number(kit.coste_instalacion) : 0,
      })

      return {
        costeActualMensual,
        costeActualAnual: costeActualMensual * 12,
        kitPropuesto: kit,
        cubreEquipamiento,
        costePropuestaMensual,
        costePropuestaAnual: costePropuestaMensual * 12,
        desgloseActual,
        desglosePropuesta,
        ahorroMensual,
        ahorroAnual,
        ahorroPorcentaje,
        permanenciaRestanteMeses: Number(datosCliente.permanenciaRestanteMeses) || 0,
      }
    }
    return { encontrarMejorKit, compararAlarmas }
  })();

  // ---------------------------------------------------------------- telecomAudit (src/lib/calculations/telecomAudit.js)
  MODS.telecomAudit = (function () {
    // Motor de cálculo del Informe de Auditoría y Optimización de
    // Telecomunicaciones: compara el desglose manual de la factura actual del
    // cliente (introducido por el consultor) contra el catálogo de operadoras
    // de mercado (tarifa_mercado), y calcula el ahorro frente a cada una.

    const DIAGNOSTICOS_FACTURA = [
      { valor: 'SOBREDIMENSIONADA', nivel: 'negativo' },
      { valor: 'PRESCINDIBLE', nivel: 'negativo' },
      { valor: 'FUGA DE COSTE', nivel: 'negativo' },
      { valor: 'CARGO OCULTO', nivel: 'negativo' },
      { valor: 'REVISABLE', nivel: 'negativo' },
      { valor: 'CADUCARÁ', nivel: 'aviso' },
      { valor: 'PRECIO MEDIO', nivel: 'neutro' },
      { valor: 'CORRECTO', nivel: 'neutro' },
      { valor: 'SE MANTIENE', nivel: 'neutro' },
    ]

    function crearConceptoVacio() {
      return { concepto: '', importeMes: 0, diagnostico: 'PRECIO MEDIO' }
    }

    function crearHallazgoVacio() {
      return { titulo: '', descripcion: '' }
    }

    function generarCodigoPresupuesto() {
      const mes = String(new Date().getMonth() + 1).padStart(2, '0')
      const numero = Math.floor(1000000 + Math.random() * 9000000)
      return `ICC-${mes}-${numero}`
    }

    /**
     * @param {object} input
     * @param {object} input.cliente - { nombre, ubicacion, operadorActual, periodoFactura }
     * @param {Array}  input.conceptos - [{ concepto, importeMes, diagnostico }]
     * @param {Array}  input.hallazgos - [{ titulo, descripcion }] (3 tarjetas)
     * @param {number|null} input.operadorRecomendadoId - fuerza la operadora recomendada; null = usa la marcada en el catálogo
     * @param {object} input.consultor - { nombre, email }
     * @param {Array} catalogoMercado - filas de tarifa_mercado (ver api/_catalogos.php)
     */
    function ejecutarAuditoriaTelecom(input, catalogoMercado) {
      const conceptos = (input.conceptos || []).filter((c) => c.concepto?.trim())
      const costeActualMensual = conceptos.reduce((sum, c) => sum + (Number(c.importeMes) || 0), 0)
      const costeActualAnual = costeActualMensual * 12

      const operadores = (catalogoMercado || [])
        .filter((o) => o.activo)
        .slice()
        .sort((a, b) => a.cuota_mensual - b.cuota_mensual)
        .map((op) => {
          const costeAnual = op.cuota_mensual * 12
          return {
            ...op,
            costeAnual,
            ahorroAnual: costeActualAnual - costeAnual,
            caracteristicasLista: (op.caracteristicas || '')
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
          }
        })

      let recomendado = null
      if (input.operadorRecomendadoId != null) {
        recomendado = operadores.find((o) => o.id === input.operadorRecomendadoId) || null
      }
      if (!recomendado) {
        recomendado = operadores.find((o) => o.recomendada) || operadores[0] || null
      }

      const diferenciaMensual = recomendado ? costeActualMensual - recomendado.cuota_mensual : 0
      const ahorroAnual = diferenciaMensual * 12
      const ahorroPorcentaje = costeActualAnual > 0 ? (ahorroAnual / costeActualAnual) * 100 : 0
      const operadorasQueMejoran = operadores.filter((o) => o.ahorroAnual > 0).length
      const peorAhorro = operadores.reduce((min, o) => Math.min(min, o.ahorroAnual), 0)

      return {
        codigo: generarCodigoPresupuesto(),
        fechaEmision: new Date().toISOString(),
        cliente: input.cliente,
        conceptos,
        costeActualMensual,
        costeActualAnual,
        hallazgos: (input.hallazgos || []).filter((h) => h.titulo?.trim() || h.descripcion?.trim()),
        operadores,
        recomendado,
        diferenciaMensual,
        ahorroAnual,
        ahorroPorcentaje,
        operadorasQueMejoran,
        totalOperadoras: operadores.length,
        peorEncarecimiento: peorAhorro < 0 ? Math.abs(peorAhorro) : 0,
        consultor: input.consultor,
      }
    }
    return { DIAGNOSTICOS_FACTURA, crearConceptoVacio, crearHallazgoVacio, ejecutarAuditoriaTelecom }
  })();

  // ---------------------------------------------------------------- auditEngine (src/lib/auditEngine.js)
  MODS.auditEngine = (function () {
    const { compararLuz, compararGas } = MODS.energy
    const { compararTelefonia } = MODS.telephony
    const { compararAlarmas } = MODS.alarms
    const { listarTarifas } = { listarTarifas: (c, o) => window.icc.comparadorMotor.listarTarifas(c, o) }
    const { SECTORES } = MODS.constants
    /**
     * Ejecuta la auditoría completa según el sector elegido (o los tres sectores
     * si es Pack Integral), consultando el catálogo de tarifas vigente y
     * devolviendo un objeto `resultado` unificado listo para pintar en pantalla,
     * exportar a PDF y guardar en `auditorias_clientes`.
     */
    async function ejecutarAuditoria(state) {
      const { sector, energia, telefonia, alarmas } = state
      const incluyeEnergia = sector === SECTORES.ENERGIA || sector === SECTORES.PACK_INTEGRAL
      const incluyeTelefonia = sector === SECTORES.TELEFONIA || sector === SECTORES.PACK_INTEGRAL
      const incluyeAlarmas = sector === SECTORES.ALARMAS || sector === SECTORES.PACK_INTEGRAL

      const resultado = { sector, energia: null, telefonia: null, alarmas: null }

      if (incluyeEnergia && (energia?.incluyeLuz || energia?.incluyeGas)) {
        const catalogoEnergia = await listarTarifas('energia')
        resultado.energia = {
          luz: energia.incluyeLuz && energia.luz ? compararLuz(energia.luz, catalogoEnergia) : null,
          gas: energia.incluyeGas && energia.gas ? compararGas(energia.gas, catalogoEnergia) : null,
        }
      }

      if (incluyeTelefonia && telefonia) {
        const catalogoTelefonia = await listarTarifas('telefonia')
        resultado.telefonia = compararTelefonia(telefonia, catalogoTelefonia)
      }

      if (incluyeAlarmas && alarmas) {
        const catalogoAlarmas = await listarTarifas('alarmas')
        resultado.alarmas = compararAlarmas(alarmas, catalogoAlarmas)
      }

      resultado.totales = calcularTotales(resultado)
      return resultado
    }

    function calcularTotales(resultado) {
      let costeActualAnual = 0
      let costePropuestaAnual = 0

      if (resultado.energia?.luz) {
        costeActualAnual += resultado.energia.luz.costeActual.totalAnual
        costePropuestaAnual += resultado.energia.luz.mejorPropuesta?.coste.totalAnual ?? resultado.energia.luz.costeActual.totalAnual
      }
      if (resultado.energia?.gas) {
        costeActualAnual += resultado.energia.gas.costeActual.totalAnual
        costePropuestaAnual += resultado.energia.gas.mejorPropuesta?.coste.totalAnual ?? resultado.energia.gas.costeActual.totalAnual
      }
      if (resultado.telefonia) {
        costeActualAnual += resultado.telefonia.costeActualAnual
        costePropuestaAnual += resultado.telefonia.costePropuestaAnual
      }
      if (resultado.alarmas) {
        costeActualAnual += resultado.alarmas.costeActualAnual
        costePropuestaAnual += resultado.alarmas.costePropuestaAnual
      }

      const ahorroAnual = costeActualAnual - costePropuestaAnual
      const ahorroPorcentaje = costeActualAnual > 0 ? (ahorroAnual / costeActualAnual) * 100 : 0

      return { costeActualAnual, costePropuestaAnual, ahorroAnual, ahorroPorcentaje }
    }
    return { ejecutarAuditoria }
  })();

  // ---------------------------------------------------------------- companias (src/lib/pdf/companias.js)
  MODS.companias = (function () {
    // Compañías con las que trabajamos/comparamos, agrupadas por sector.
    // El logo es opcional: si en src/assets/companies/ existe un archivo con la
    // clave indicada (p. ej. "endesa.png"), el informe lo usa automáticamente;
    // si no existe, se dibuja una pastilla con el nombre como respaldo. Así el
    // listado queda listo para funcionar en cuanto se suban los logos reales
    // (ver src/assets/companies/README.md).
    const COMPANIAS_POR_SECTOR = [
      {
        sector: 'energia',
        etiqueta: 'Energía',
        empresas: [
          { clave: 'endesa', nombre: 'Endesa' },
          { clave: 'iberdrola', nombre: 'Iberdrola' },
          { clave: 'naturgy', nombre: 'Naturgy' },
        ],
      },
      {
        sector: 'telefonia',
        etiqueta: 'Telefonía',
        empresas: [
          { clave: 'movistar', nombre: 'Movistar' },
          { clave: 'vodafone', nombre: 'Vodafone' },
          { clave: 'orange', nombre: 'Orange' },
        ],
      },
      {
        sector: 'alarmas',
        etiqueta: 'Alarmas',
        empresas: [
          { clave: 'securitas', nombre: 'Securitas Direct' },
          { clave: 'prosegur', nombre: 'Prosegur' },
        ],
      },
    ]

    // Descubre en tiempo de build los logos disponibles en src/assets/companies/
    // (clave -> URL del asset). Si la carpeta está vacía, devuelve un objeto
    // vacío y el informe usa pastillas de texto para todas las compañías.
    const modulosLogos = {}

    const LOGOS_COMPANIAS = Object.entries(Object.assign({}, modulosLogos, window.ICC_CONST.LOGOS_COMPANIAS || {})).reduce((acc, [ruta, url]) => {
      const clave = ruta.split('/').pop().replace(/\.(png|jpe?g|svg)$/i, '').toLowerCase()
      acc[clave] = url
      return acc
    }, {})
    return { COMPANIAS_POR_SECTOR, LOGOS_COMPANIAS }
  })();

  // ---------------------------------------------------------------- generateReport (src/lib/pdf/generateReport.js)
  MODS.generateReport = (function () {
    const jsPDF = function (opciones) { if (!window.jspdf) throw new Error("No se ha podido cargar la libreria de PDF (jsPDF). Revisa tu conexion y recarga la pagina."); return new window.jspdf.jsPDF(opciones) }
    const autoTable = (doc, opciones) => doc.autoTable(opciones)
    const logoIcono = 'assets/brand/icc-icon.png'
    const { COMPANY } = MODS.constants
    const { formatEUR, formatPercent } = MODS.format
    const { COMPANIAS_POR_SECTOR, LOGOS_COMPANIAS } = MODS.companias
    const NAVY = [19, 26, 36]
    const NAVY_SOFT = [58, 89, 133]
    const GOLD = [201, 162, 39]
    const GOLD_LIGHT = [250, 244, 224]
    const SLATE = [100, 116, 139]
    const BORDER = [222, 227, 235]
    const ROW_TINT = [246, 248, 251]

    const ACENTOS_SECTOR = {
      energia: GOLD,
      telefonia: NAVY_SOFT,
      alarmas: [22, 128, 106],
    }

    const MARGEN = 14

    // Redimensiona la imagen antes de incrustarla en el PDF: los logos fuente son
    // de alta resolución (para web/impresión) y embeberlos a tamaño completo
    // dispara el peso del PDF sin aportar calidad visible a pocos mm de ancho.
    function cargarImagenComoDataURL(src, maxWidth = 500) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const escala = Math.min(1, maxWidth / img.width)
          const width = Math.round(img.width * escala)
          const height = Math.round(img.height * escala)
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          resolve({ dataUrl: canvas.toDataURL('image/png'), width, height })
        }
        img.onerror = reject
        img.src = src
      })
    }

    async function cargarLogosCompanias() {
      const entradas = await Promise.all(
        Object.entries(LOGOS_COMPANIAS).map(async ([clave, url]) => {
          try {
            return [clave, await cargarImagenComoDataURL(url, 300)]
          } catch {
            return [clave, null]
          }
        })
      )
      return Object.fromEntries(entradas.filter(([, valor]) => valor))
    }

    function gradienteHorizontal(doc, x, y, w, h, colorA, colorB) {
      const pasos = 90
      const pasoAncho = w / pasos
      for (let i = 0; i < pasos; i++) {
        const t = i / (pasos - 1)
        const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * t)
        const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * t)
        const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * t)
        doc.setFillColor(r, g, b)
        doc.rect(x + i * pasoAncho, y, pasoAncho + 0.6, h, 'F')
      }
    }

    function badgeNumero(doc, numero, x, y, tam = 6.4) {
      doc.setFillColor(...NAVY)
      doc.roundedRect(x, y, tam, tam, 1.3, 1.3, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(9)
      doc.text(String(numero), x + tam / 2, y + tam / 2 + 1.15, { align: 'center' })
      doc.setFont(undefined, 'normal')
    }

    function tituloSeccion(doc, pageWidth, numero, texto, y) {
      badgeNumero(doc, numero, MARGEN, y - 4.6)
      doc.setFontSize(11.5)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'bold')
      doc.text(texto.toUpperCase(), MARGEN + 9.5, y)
      doc.setFont(undefined, 'normal')
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.3)
      doc.line(MARGEN, y + 2.6, pageWidth - MARGEN, y + 2.6)
      return y + 9
    }

    function dibujarCabeceraPagina(doc, pageWidth, logoData) {
      if (logoData) {
        const logoAlto = 9
        const logoAncho = (logoData.width / logoData.height) * logoAlto
        doc.addImage(logoData.dataUrl, 'PNG', MARGEN, 10, logoAncho, logoAlto)
      }
      doc.setFontSize(9.5)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'bold')
      doc.text('AUDITORÍA DE AHORRO', pageWidth - MARGEN, 13.5, { align: 'right' })
      doc.setFont(undefined, 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(...SLATE)
      doc.text('Energía · Telefonía · Alarmas — Consultoría integral de contratación', pageWidth - MARGEN, 18, {
        align: 'right',
      })
      doc.setFont(undefined, 'normal')
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.4)
      doc.line(MARGEN, 23, pageWidth - MARGEN, 23)
    }

    function nuevaPagina(doc, pageWidth, logoData) {
      doc.addPage()
      dibujarCabeceraPagina(doc, pageWidth, logoData)
      return 34
    }

    function asegurarEspacio(doc, pageWidth, logoData, y, necesario, limite = 262) {
      if (y + necesario > limite) {
        return nuevaPagina(doc, pageWidth, logoData)
      }
      return y
    }

    function cajaInfo(doc, pageWidth, cliente, codigo, y) {
      const w = pageWidth - MARGEN * 2
      const h = 22
      doc.setDrawColor(...BORDER)
      doc.setFillColor(255, 255, 255)
      doc.setLineWidth(0.3)
      doc.rect(MARGEN, y, w, h, 'FD')
      const col2 = MARGEN + w / 2
      const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })

      const campo = (label, valor, x, fila) => {
        const fy = y + 6.5 + fila * 9
        doc.setFont(undefined, 'bold')
        doc.setFontSize(7.6)
        doc.setTextColor(...NAVY)
        doc.text(label, x + 4, fy)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(...SLATE)
        doc.setFontSize(8.3)
        doc.text(String(valor || '—'), x + 4, fy + 4)
      }

      campo('PREPARADO PARA', cliente?.nombre || 'Cliente', MARGEN, 0)
      campo('FECHA DE EMISIÓN', fecha, col2, 0)
      campo('CONTACTO', [cliente?.telefono, cliente?.email].filter(Boolean).join(' · '), MARGEN, 1)
      campo('CÓDIGO DE INFORME', codigo, col2, 1)

      return y + h
    }

    function parrafoIntro(doc, pageWidth, texto, y) {
      const w = pageWidth - MARGEN * 2
      doc.setFontSize(8.6)
      const lineas = doc.splitTextToSize(texto, w - 10)
      const h = lineas.length * 4.1 + 6
      doc.setFillColor(...GOLD_LIGHT)
      doc.rect(MARGEN, y, w, h, 'F')
      doc.setFillColor(...GOLD)
      doc.rect(MARGEN, y, 1.2, h, 'F')
      doc.setTextColor(...NAVY)
      doc.text(lineas, MARGEN + 6, y + 5.8)
      return y + h
    }

    function barraProgreso(doc, x, y, w, porcentaje, etiqueta) {
      const h = 4.6
      doc.setFillColor(...BORDER)
      doc.roundedRect(x, y, w, h, 2, 2, 'F')
      const relleno = Math.max(6, Math.min(w, (w * porcentaje) / 100))
      doc.setFillColor(...GOLD)
      doc.roundedRect(x, y, relleno, h, 2, 2, 'F')
      doc.setFontSize(7.6)
      doc.setTextColor(...SLATE)
      doc.text(etiqueta, x, y + h + 4)
    }

    function pastillaCompania(doc, x, y, w, h, empresa, logoData) {
      doc.setDrawColor(...BORDER)
      doc.setFillColor(255, 255, 255)
      doc.setLineWidth(0.3)
      doc.roundedRect(x, y, w, h, 1.8, 1.8, 'FD')
      if (logoData) {
        const maxW = w - 8
        const maxH = h - 6
        let dibW = maxW
        let dibH = (logoData.height / logoData.width) * dibW
        if (dibH > maxH) {
          dibH = maxH
          dibW = (logoData.width / logoData.height) * dibH
        }
        doc.addImage(logoData.dataUrl, 'PNG', x + (w - dibW) / 2, y + (h - dibH) / 2, dibW, dibH)
      } else {
        doc.setFont(undefined, 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...NAVY)
        doc.text(empresa.nombre, x + w / 2, y + h / 2 + 1.3, { align: 'center' })
        doc.setFont(undefined, 'normal')
      }
    }

    function estiloTabla() {
      return {
        theme: 'striped',
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: ROW_TINT },
        styles: { fontSize: 8, textColor: NAVY, lineColor: BORDER, lineWidth: 0.15 },
        margin: { left: MARGEN, right: MARGEN },
      }
    }

    function addFooter(doc) {
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const pageHeight = doc.internal.pageSize.getHeight()
        const pageWidth = doc.internal.pageSize.getWidth()
        doc.setDrawColor(...GOLD)
        doc.setLineWidth(0.5)
        doc.line(MARGEN, pageHeight - 21, pageWidth - MARGEN, pageHeight - 21)
        doc.setFont(undefined, 'italic')
        doc.setFontSize(7.6)
        doc.setTextColor(...SLATE)
        doc.text(`${COMPANY.name} · Auditoría de Ahorro Confidencial`, pageWidth / 2, pageHeight - 16, {
          align: 'center',
        })
        doc.setFont(undefined, 'normal')
        doc.setFontSize(8)
        doc.text(`${COMPANY.phone} · ${COMPANY.email}`, MARGEN, pageHeight - 10)
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGEN, pageHeight - 10, { align: 'right' })
      }
    }

    async function generarInformePDF(resultado, cliente) {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()

      let logoIconoData = null
      try {
        logoIconoData = await cargarImagenComoDataURL(logoIcono, 300)
      } catch {
        logoIconoData = null
      }
      const logosCompanias = await cargarLogosCompanias()

      // ---- Cabecera de página 1 ----
      dibujarCabeceraPagina(doc, pageWidth, logoIconoData)
      let y = 34

      // ---- Banner degradado con título ----
      const heroH = 26
      gradienteHorizontal(doc, MARGEN, y, pageWidth - MARGEN * 2, heroH, NAVY, NAVY_SOFT)
      doc.setFillColor(...GOLD)
      doc.rect(MARGEN, y + heroH - 1.2, pageWidth - MARGEN * 2, 1.2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(17)
      doc.text('AUDITORÍA DE AHORRO PERSONALIZADA', MARGEN + 7, y + 12)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...GOLD)
      doc.text('Comparativa de tu gasto actual frente a nuestras mejores tarifas disponibles', MARGEN + 7, y + 19)
      y += heroH + 8

      // ---- Ficha de datos ----
      const codigo = (cliente && cliente.codigo) || `AUD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`
      y = cajaInfo(doc, pageWidth, cliente, codigo, y)
      y += 6

      // ---- Párrafo introductorio ----
      y = parrafoIntro(
        doc,
        pageWidth,
        `A continuación se presenta el desglose de la auditoría de ahorro realizada para ${
          cliente?.nombre || 'el cliente'
        }. Comparamos su gasto actual con nuestra mejor propuesta disponible a fecha de hoy en cada uno de los servicios contratados, junto con las principales compañías del mercado con las que trabajamos.`,
        y
      )
      y += 8

      let numeroSeccion = 1

      // ---- 1. Resumen económico ----
      const totales = resultado.totales
      y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Resumen económico', y)

      const filasResumen = []
      if (resultado.energia?.luz || resultado.energia?.gas) {
        let actual = 0
        let propuesta = 0
        if (resultado.energia.luz) {
          actual += resultado.energia.luz.costeActual.totalAnual
          propuesta += resultado.energia.luz.mejorPropuesta?.coste.totalAnual ?? resultado.energia.luz.costeActual.totalAnual
        }
        if (resultado.energia.gas) {
          actual += resultado.energia.gas.costeActual.totalAnual
          propuesta += resultado.energia.gas.mejorPropuesta?.coste.totalAnual ?? resultado.energia.gas.costeActual.totalAnual
        }
        filasResumen.push(['Energía (Luz y Gas)', formatEUR(actual), formatEUR(propuesta), formatEUR(actual - propuesta)])
      }
      if (resultado.telefonia) {
        const { costeActualAnual: a, costePropuestaAnual: p } = resultado.telefonia
        filasResumen.push(['Telefonía e Internet', formatEUR(a), formatEUR(p), formatEUR(a - p)])
      }
      if (resultado.alarmas) {
        const { costeActualAnual: a, costePropuestaAnual: p } = resultado.alarmas
        filasResumen.push(['Alarmas y Seguridad', formatEUR(a), formatEUR(p), formatEUR(a - p)])
      }

      autoTable(doc, {
        startY: y,
        head: [['Concepto', 'Gasto actual / año', 'Gasto propuesto / año', 'Ahorro / año']],
        body: filasResumen,
        foot: [[
          'TOTAL',
          formatEUR(totales.costeActualAnual),
          formatEUR(totales.costePropuestaAnual),
          formatEUR(totales.ahorroAnual),
        ]],
        ...estiloTabla(),
        footStyles: { fillColor: [235, 238, 243], textColor: NAVY, fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: { 3: { fontStyle: 'bold', textColor: [163, 130, 25] } },
      })
      y = doc.lastAutoTable.finalY + 8

      y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 34)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(...NAVY)
      doc.text('AHORRO TOTAL ANUAL', MARGEN, y)
      doc.setFontSize(19)
      doc.setTextColor(...GOLD)
      doc.text(
        `${formatEUR(Math.abs(totales.ahorroAnual))} (${formatPercent(totales.ahorroPorcentaje)})`,
        pageWidth - MARGEN,
        y,
        { align: 'right' }
      )
      doc.setFont(undefined, 'normal')
      y += 6
      barraProgreso(
        doc,
        MARGEN,
        y,
        pageWidth - MARGEN * 2,
        Math.max(0, 100 - totales.ahorroPorcentaje),
        `Reduces tu gasto anual en un ${formatPercent(totales.ahorroPorcentaje)}: de ${formatEUR(
          totales.costeActualAnual
        )} a ${formatEUR(totales.costePropuestaAnual)}`
      )
      y += 14

      // ---- Energía: LUZ ----
      if (resultado.energia?.luz) {
        y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 50)
        const { costeActual, mejorPropuesta } = resultado.energia.luz
        y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Energía — Luz', y)
        autoTable(doc, {
          startY: y,
          head: [['Periodo', 'Consumo (kWh)', 'Precio actual (€/kWh)', 'Coste actual', 'Precio propuesto', 'Coste propuesto']],
          body: costeActual.desglosePeriodos.map((p, idx) => {
            const propuesto = mejorPropuesta?.coste.desglosePeriodos[idx]
            return [
              p.periodo,
              p.consumoKwh.toFixed(0),
              p.precioEnergia.toFixed(4),
              formatEUR(p.costeEnergia),
              propuesto ? propuesto.precioEnergia.toFixed(4) : '—',
              propuesto ? formatEUR(propuesto.costeEnergia) : '—',
            ]
          }),
          foot: [['Total factura', '', '', formatEUR(costeActual.total), '', formatEUR(mejorPropuesta?.coste.total ?? costeActual.total)]],
          ...estiloTabla(),
          footStyles: { fillColor: [235, 238, 243], textColor: NAVY, fontStyle: 'bold' },
        })
        y = doc.lastAutoTable.finalY + 5
        if (mejorPropuesta) {
          doc.setFontSize(8)
          doc.setTextColor(...SLATE)
          doc.text(`Propuesta: ${mejorPropuesta.tarifa.nombre_tarifa}`, MARGEN, y)
          y += 8
        }
      }

      // ---- Energía: GAS ----
      if (resultado.energia?.gas) {
        y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 45)
        const { costeActual, mejorPropuesta } = resultado.energia.gas
        y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Energía — Gas', y)
        autoTable(doc, {
          startY: y,
          head: [['Concepto', 'Actual', 'Propuesta']],
          body: [
            ['Consumo', `${costeActual.consumoKwh.toFixed(0)} kWh`, `${costeActual.consumoKwh.toFixed(0)} kWh`],
            ['Término energía', formatEUR(costeActual.terminoEnergia), formatEUR(mejorPropuesta?.coste.terminoEnergia ?? 0)],
            ['Término fijo', formatEUR(costeActual.terminoFijo), formatEUR(mejorPropuesta?.coste.terminoFijo ?? 0)],
            ['Total factura', formatEUR(costeActual.total), formatEUR(mejorPropuesta?.coste.total ?? costeActual.total)],
          ],
          ...estiloTabla(),
        })
        y = doc.lastAutoTable.finalY + 5
        if (mejorPropuesta) {
          doc.setFontSize(8)
          doc.setTextColor(...SLATE)
          doc.text(`Propuesta: ${mejorPropuesta.tarifa.nombre_tarifa}`, MARGEN, y)
          y += 8
        }
      }

      // ---- Telefonía ----
      if (resultado.telefonia) {
        y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 50)
        y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Telefonía e Internet', y)
        doc.setFontSize(8)
        doc.setTextColor(...SLATE)
        doc.text(
          resultado.telefonia.propuesta.componentes
            .map((c) => `${c.etiqueta || c.tarifa.nombre_tarifa}: ${c.tarifa.nombre_tarifa}`)
            .join(' · ') || 'Sin propuesta que cubra la necesidad',
          MARGEN,
          y
        )
        y += 4
        const { desgloseActual: da, desglosePropuesta: dp, cambioTitular } = resultado.telefonia
        autoTable(doc, {
          startY: y,
          head: [['Resumen de factura', 'Cuotas mensuales', 'Consumos', 'Otros conceptos', 'IVA (21%)', 'Total']],
          body: [
            ['Actual', formatEUR(da.cuotas), formatEUR(da.consumos), formatEUR(da.otros), formatEUR(da.iva), formatEUR(da.total)],
            ['Propuesta', formatEUR(dp.cuotas), formatEUR(dp.consumos), formatEUR(dp.otros), formatEUR(dp.iva), formatEUR(dp.total)],
          ],
          ...estiloTabla(),
        })
        y = doc.lastAutoTable.finalY + 6

        if (cambioTitular) {
          y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 30)
          doc.setFontSize(9)
          doc.setTextColor(...NAVY)
          doc.setFont(undefined, 'bold')
          doc.text('Cambio de titularidad solicitado', MARGEN, y)
          doc.setFont(undefined, 'normal')
          y += 5
          autoTable(doc, {
            startY: y,
            head: [['', 'Nombre / Razón social', 'NIF/CIF', 'Contacto']],
            body: [
              ['Donante (compañía actual)', cambioTitular.donante.nombre || '—', cambioTitular.donante.nif || '—', cambioTitular.donante.contacto || '—'],
              ['Receptor (nueva contratación)', cambioTitular.receptor.nombre || '—', cambioTitular.receptor.nif || '—', cambioTitular.receptor.contacto || '—'],
            ],
            ...estiloTabla(),
          })
          y = doc.lastAutoTable.finalY + 8
        } else {
          y += 2
        }
      }

      // ---- Alarmas ----
      if (resultado.alarmas) {
        y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 50)
        y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Alarmas y Seguridad', y)
        const equipoTexto = (resultado.alarmas.kitPropuesto?.equipamiento || []).join(', ')
        autoTable(doc, {
          startY: y,
          head: [['Tipo de servicio', 'Cuota mensual', 'Pago al contado', 'Total euros']],
          body: [[
            `${resultado.alarmas.kitPropuesto?.nombre_kit || 'Sin propuesta'}${equipoTexto ? `\n${equipoTexto}` : ''}`,
            formatEUR(resultado.alarmas.desglosePropuesta.cuota),
            formatEUR(resultado.alarmas.desglosePropuesta.pagoContado),
            formatEUR(resultado.alarmas.desglosePropuesta.totalPorServicios),
          ]],
          ...estiloTabla(),
        })
        y = doc.lastAutoTable.finalY + 4

        autoTable(doc, {
          startY: y,
          head: [['', 'Base imponible', 'IVA (21%)', 'Total a pagar']],
          body: [
            ['Tu factura actual', formatEUR(resultado.alarmas.desgloseActual.base), formatEUR(resultado.alarmas.desgloseActual.iva), formatEUR(resultado.alarmas.desgloseActual.totalAPagar)],
            ['Nuestra propuesta', formatEUR(resultado.alarmas.desglosePropuesta.base), formatEUR(resultado.alarmas.desglosePropuesta.iva), formatEUR(resultado.alarmas.desglosePropuesta.totalAPagar)],
          ],
          ...estiloTabla(),
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ---- Compañías con las que trabajamos ----
      y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 60)
      y = tituloSeccion(doc, pageWidth, numeroSeccion++, 'Compañías con las que trabajamos', y)
      doc.setFontSize(8)
      doc.setTextColor(...SLATE)
      doc.text('Comparamos y negociamos con las principales compañías del sector para conseguirte la mejor tarifa.', MARGEN, y)
      y += 5

      const anchoDisponible = pageWidth - MARGEN * 2
      const gap = 4
      for (const grupo of COMPANIAS_POR_SECTOR) {
        y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 24)
        doc.setFillColor(...ACENTOS_SECTOR[grupo.sector])
        doc.circle(MARGEN + 1.3, y - 1.3, 1.3, 'F')
        doc.setFont(undefined, 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...NAVY)
        doc.text(grupo.etiqueta.toUpperCase(), MARGEN + 5, y)
        doc.setFont(undefined, 'normal')
        y += 3
        const pillH = 16
        const pillW = (anchoDisponible - gap * (grupo.empresas.length - 1)) / grupo.empresas.length
        grupo.empresas.forEach((empresa, idx) => {
          const x = MARGEN + idx * (pillW + gap)
          pastillaCompania(doc, x, y, pillW, pillH, empresa, logosCompanias[empresa.clave] || null)
        })
        y += pillH + 7
      }
      y += 2

      // ---- Próximo paso / contacto ----
      y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 34)
      const cajaW = pageWidth - MARGEN * 2
      const cajaH = 26
      doc.setDrawColor(...BORDER)
      doc.setFillColor(255, 255, 255)
      doc.setLineWidth(0.3)
      doc.rect(MARGEN, y, cajaW, cajaH, 'FD')
      doc.setFillColor(...GOLD)
      doc.rect(MARGEN, y, 1.2, cajaH, 'F')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(...NAVY)
      doc.text('¿CÓMO ACTIVAMOS TU AHORRO?', MARGEN + 6, y + 6.5)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8.2)
      doc.setTextColor(...SLATE)
      const pasos = [
        '1. Confirmas la propuesta con tu gestor comercial de Integral Connection Consulting.',
        '2. Nosotros gestionamos el cambio de compañía sin coste ni gestiones para ti.',
        '3. Sigues pagando lo mismo hasta que el cambio sea efectivo: sin doble facturación.',
      ]
      doc.text(pasos, MARGEN + 6, y + 12)
      y += cajaH + 6

      // ---- CTA de contacto ----
      y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 24)
      doc.setFillColor(...GOLD)
      doc.roundedRect(MARGEN, y, pageWidth - MARGEN * 2, 20, 3, 3, 'F')
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(11)
      doc.text(`${COMPANY.name} — ${COMPANY.phone}`, pageWidth / 2, y + 8, { align: 'center' })
      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)
      doc.text(`${COMPANY.email} · WhatsApp ${COMPANY.whatsapp}`, pageWidth / 2, y + 15, { align: 'center' })
      y += 28

      // ---- Firma / conformidad ----
      y = asegurarEspacio(doc, pageWidth, logoIconoData, y, 26)
      const mitad = (pageWidth - MARGEN * 2) / 2
      doc.setDrawColor(...SLATE)
      doc.setLineWidth(0.2)
      doc.line(MARGEN, y + 14, MARGEN + mitad - 10, y + 14)
      doc.line(MARGEN + mitad + 10, y + 14, pageWidth - MARGEN, y + 14)
      doc.setFontSize(8)
      doc.setTextColor(...SLATE)
      doc.setFont(undefined, 'bold')
      doc.text('ACEPTADO Y CONFORME', MARGEN, y)
      doc.text('PREPARADO POR', MARGEN + mitad + 10, y)
      doc.setFont(undefined, 'normal')
      doc.text(cliente?.nombre || 'Cliente', MARGEN, y + 5)
      doc.text(`Fecha: ____ / ____ / ${new Date().getFullYear()}`, MARGEN, y + 10)
      doc.text(COMPANY.name, MARGEN + mitad + 10, y + 5)
      doc.text(
        `Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
        MARGEN + mitad + 10,
        y + 10
      )

      addFooter(doc)

      return doc
    }

    async function descargarInformePDF(resultado, cliente) {
      const doc = await generarInformePDF(resultado, cliente)
      const nombreArchivo = `Auditoria-Ahorro-${(cliente?.nombre || 'cliente').replace(/\s+/g, '-')}-${Date.now()}.pdf`
      doc.save(nombreArchivo)
    }
    return { generarInformePDF, descargarInformePDF }
  })();

  // ---------------------------------------------------------------- generateTelecomAuditReport (src/lib/pdf/generateTelecomAuditReport.js)
  MODS.generateTelecomAuditReport = (function () {
    const jsPDF = function (opciones) { if (!window.jspdf) throw new Error("No se ha podido cargar la libreria de PDF (jsPDF). Revisa tu conexion y recarga la pagina."); return new window.jspdf.jsPDF(opciones) }
    const autoTable = (doc, opciones) => doc.autoTable(opciones)
    const logoHorizontal = 'assets/brand/icc-logo-horizontal.png'
    const { COMPANY } = MODS.constants
    const { formatEUR, formatPercent } = MODS.format
    const NAVY = [19, 26, 36]
    const GOLD = [201, 162, 39]
    const GOLD_LIGHT = [250, 244, 224]
    const SLATE = [100, 116, 139]
    const BORDER = [222, 227, 235]
    const ROW_TINT = [246, 248, 251]
    const RED = [185, 28, 28]
    const RED_LIGHT = [253, 235, 235]
    const GREEN = [21, 128, 61]
    const AMBER = [146, 64, 14]
    const AMBER_LIGHT = [254, 243, 199]
    const GRAY_PILL = [241, 245, 249]
    const GRAY_PILL_TEXT = [71, 85, 105]
    const BAR_TRACK = [222, 227, 235]

    const MARGEN = 14

    const POR_QUE_ICC = [
      ['100 % independientes.', 'Trabajamos con todas las compañías y le mostramos el mercado completo.'],
      ['Gestión integral.', 'Portabilidad, bajas, instalación y revisión de la primera factura. Usted no hace ninguna llamada.'],
      ['Cero tarifas ocultas.', 'Vigilamos cargos de terceros, caducidad de descuentos y subidas de precio.'],
    ]

    function cargarImagenComoDataURL(src, maxWidth = 500) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const escala = Math.min(1, maxWidth / img.width)
          const width = Math.round(img.width * escala)
          const height = Math.round(img.height * escala)
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          resolve({ dataUrl: canvas.toDataURL('image/png'), width, height })
        }
        img.onerror = reject
        img.src = src
      })
    }

    function nivelDiagnostico(valor) {
      if (['SOBREDIMENSIONADA', 'PRESCINDIBLE', 'FUGA DE COSTE', 'CARGO OCULTO', 'REVISABLE'].includes(valor)) return 'negativo'
      if (valor === 'CADUCARÁ') return 'aviso'
      return 'neutro'
    }

    function coloresPill(nivel) {
      if (nivel === 'negativo') return { bg: RED_LIGHT, fg: RED }
      if (nivel === 'aviso') return { bg: AMBER_LIGHT, fg: AMBER }
      return { bg: GRAY_PILL, fg: GRAY_PILL_TEXT }
    }

    function dibujarCabecera(doc, pageWidth, logoData, codigo, fechaTexto) {
      if (logoData) {
        const logoAlto = 11.5
        const logoAncho = (logoData.width / logoData.height) * logoAlto
        doc.addImage(logoData.dataUrl, 'PNG', MARGEN, 9, logoAncho, logoAlto)
      }
      doc.setFont(undefined, 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...SLATE)
      doc.text(`Presupuesto ${codigo}`, pageWidth - MARGEN, 13, { align: 'right' })
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(`Emitido el ${fechaTexto} · Válido 30 días`, pageWidth - MARGEN, 17.5, { align: 'right' })
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.3)
      doc.line(MARGEN, 26, pageWidth - MARGEN, 26)
    }

    function nuevaPagina(doc, pageWidth, logoData, codigo, fechaTexto) {
      doc.addPage()
      dibujarCabecera(doc, pageWidth, logoData, codigo, fechaTexto)
      return 38
    }

    function asegurarEspacio(doc, pageWidth, logoData, codigo, fechaTexto, y, necesario, limite = 265) {
      if (y + necesario > limite) {
        return nuevaPagina(doc, pageWidth, logoData, codigo, fechaTexto)
      }
      return y
    }

    function badgeNumero(doc, numero, x, y, tam = 7) {
      doc.setFillColor(...GOLD)
      doc.circle(x + tam / 2, y + tam / 2, tam / 2, 'F')
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(9.5)
      doc.text(String(numero), x + tam / 2, y + tam / 2 + 1.2, { align: 'center' })
      doc.setFont(undefined, 'normal')
    }

    function tituloSeccion(doc, pageWidth, numero, texto, y) {
      badgeNumero(doc, numero, MARGEN, y - 5)
      doc.setFontSize(13)
      doc.setTextColor(...NAVY)
      doc.setFont(undefined, 'bold')
      doc.text(texto, MARGEN + 10, y)
      doc.setFont(undefined, 'normal')
      return y + 8
    }

    function tarjetaStat(doc, x, y, w, h, { bg, labelColor, label, valorColor, valor, caption, captionColor }) {
      doc.setFillColor(...bg)
      doc.roundedRect(x, y, w, h, 3, 3, 'F')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...labelColor)
      doc.text(label, x + 6.5, y + 8.5)
      doc.setFontSize(18)
      doc.setTextColor(...valorColor)
      doc.text(valor, x + 6.5, y + 19.5)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...captionColor)
      doc.text(caption, x + 6.5, y + 26.5)
    }

    function dibujarPastillaDiagnostico(doc, valor, x, y) {
      const { bg, fg } = coloresPill(nivelDiagnostico(valor))
      doc.setFontSize(6.6)
      doc.setFont(undefined, 'bold')
      const w = doc.getTextWidth(valor) + 4
      doc.setFillColor(...bg)
      doc.roundedRect(x, y, w, 4.4, 1.2, 1.2, 'F')
      doc.setTextColor(...fg)
      doc.text(valor, x + w / 2, y + 3, { align: 'center' })
      doc.setFont(undefined, 'normal')
    }

    function graficoBarras(doc, x, y, width, operadores, costeActualAnual, recomendadoId) {
      const maxValue = Math.max(costeActualAnual, ...operadores.map((o) => o.costeAnual), 1)
      const etiquetaW = 40
      const valorW = 24
      const barMaxW = width - etiquetaW - valorW
      const filaH = 7.5

      operadores.forEach((op, i) => {
        const rowY = y + i * filaH
        const esRecomendado = op.id === recomendadoId
        doc.setFontSize(8)
        doc.setFont(undefined, esRecomendado ? 'bold' : 'normal')
        doc.setTextColor(...NAVY)
        doc.text(op.operador, x, rowY + 4.2, { maxWidth: etiquetaW - 2 })

        const barW = Math.max(1.5, (op.costeAnual / maxValue) * barMaxW)
        doc.setFillColor(...BAR_TRACK)
        doc.roundedRect(x + etiquetaW, rowY, barMaxW, 5, 1, 1, 'F')
        doc.setFillColor(...(esRecomendado ? GOLD : [160, 170, 184]))
        doc.roundedRect(x + etiquetaW, rowY, barW, 5, 1, 1, 'F')

        doc.setFont(undefined, esRecomendado ? 'bold' : 'normal')
        doc.setTextColor(...NAVY)
        doc.text(formatEUR(op.costeAnual), x + etiquetaW + barMaxW + 2, rowY + 4.2)
      })

      const altoTotal = operadores.length * filaH
      const lineaX = x + etiquetaW + (costeActualAnual / maxValue) * barMaxW
      doc.setDrawColor(...RED)
      doc.setLineWidth(0.5)
      doc.setLineDashPattern([1.2, 1], 0)
      doc.line(lineaX, y - 3, lineaX, y + altoTotal + 2)
      doc.setLineDashPattern([], 0)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(7.6)
      doc.setTextColor(...RED)
      const alineacion = lineaX > x + width - 45 ? 'right' : 'left'
      doc.text(`Hoy: ${formatEUR(costeActualAnual)} / año`, alineacion === 'right' ? lineaX : lineaX, y + altoTotal + 6.5, {
        align: alineacion,
      })
      doc.setFont(undefined, 'normal')

      return y + altoTotal + 12
    }

    function marcaCheck(doc, cx, cy) {
      doc.setFillColor(...GOLD)
      doc.circle(cx, cy, 1.6, 'F')
      doc.setDrawColor(255, 255, 255)
      doc.setLineWidth(0.45)
      doc.line(cx - 0.9, cy, cx - 0.3, cy + 0.7)
      doc.line(cx - 0.3, cy + 0.7, cx + 0.9, cy - 0.8)
    }

    function bulletsSimples(doc, textos, x, y, w) {
      const colW = w / 2
      let yMax = y
      textos.forEach((texto, idx) => {
        const col = idx % 2
        const fila = Math.floor(idx / 2)
        const colX = x + col * colW
        const rowY = y + fila * 14
        marcaCheck(doc, colX + 1.6, rowY + 1)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...NAVY)
        const lineas = doc.splitTextToSize(texto, colW - 8)
        doc.text(lineas, colX + 5.5, rowY + 1.8)
        yMax = Math.max(yMax, rowY + 1.8 + lineas.length * 3.8)
      })
      return yMax + 5
    }

    function bulletsDosColumnas(doc, pares, x, y, w) {
      const colW = w / 2
      let yMax = y
      pares.forEach(([titulo, descripcion], idx) => {
        const col = idx % 2
        const fila = Math.floor(idx / 2)
        const colX = x + col * colW
        const rowY = y + fila * 18
        marcaCheck(doc, colX + 1.6, rowY + 1)
        doc.setFont(undefined, 'bold')
        doc.setFontSize(8.3)
        doc.setTextColor(...NAVY)
        doc.text(titulo, colX + 5.5, rowY + 1.8)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(7.8)
        doc.setTextColor(...SLATE)
        const lineas = doc.splitTextToSize(descripcion, colW - 8)
        doc.text(lineas, colX + 5.5, rowY + 6)
        yMax = Math.max(yMax, rowY + 6 + lineas.length * 3.6)
      })
      return yMax + 4
    }

    async function generarInformeTelecomPDF(resultado) {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()

      let logoData = null
      try {
        logoData = await cargarImagenComoDataURL(logoHorizontal, 400)
      } catch {
        logoData = null
      }

      const fechaTexto = new Date(resultado.fechaEmision).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      const cabecera = () => dibujarCabecera(doc, pageWidth, logoData, resultado.codigo, fechaTexto)
      const espacio = (y, necesario, limite) => asegurarEspacio(doc, pageWidth, logoData, resultado.codigo, fechaTexto, y, necesario, limite)

      cabecera()

      // ---- Banda navy: título + metadatos ----
      const bandaY = 32
      const bandaH = 62
      doc.setFillColor(...NAVY)
      doc.rect(MARGEN, bandaY, pageWidth - MARGEN * 2, bandaH, 'F')

      doc.setFont(undefined, 'bold')
      doc.setFontSize(7.6)
      doc.setTextColor(...GOLD)
      doc.text('INFORME DE AUDITORÍA Y OPTIMIZACIÓN · 9 AÑOS OPTIMIZANDO COSTES DE EMPRESAS', MARGEN + 6, bandaY + 10)

      doc.setFontSize(19)
      doc.setTextColor(255, 255, 255)
      doc.text('Informe de Auditoría y Optimización', MARGEN + 6, bandaY + 20)
      doc.text('de Telecomunicaciones', MARGEN + 6, bandaY + 28.5)

      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      const lineasSubtitulo = doc.splitTextToSize(
        'Trabajamos con el 100 % de los servicios y el 100 % de las compañías para garantizar la solución perfecta para su negocio.',
        pageWidth - MARGEN * 2 - 12
      )
      doc.text(lineasSubtitulo, MARGEN + 6, bandaY + 36)

      const metaY = bandaY + 48
      const metaCols = [
        ['Cliente', resultado.cliente?.nombre || '—'],
        ['Ubicación', resultado.cliente?.ubicacion || '—'],
        ['Operador actual', resultado.cliente?.operadorActual || '—'],
        ['Factura analizada', resultado.cliente?.periodoFactura || '—'],
      ]
      const metaColW = (pageWidth - MARGEN * 2 - 12) / 4
      metaCols.forEach(([label, valor], idx) => {
        const colX = MARGEN + 6 + idx * metaColW
        doc.setFont(undefined, 'normal')
        doc.setFontSize(7.2)
        doc.setTextColor(...GOLD)
        doc.text(label, colX, metaY)
        doc.setFont(undefined, 'bold')
        doc.setFontSize(8.3)
        doc.setTextColor(255, 255, 255)
        doc.text(String(valor), colX, metaY + 5, { maxWidth: metaColW - 4 })
      })

      let y = bandaY + bandaH + 2
      doc.setFillColor(...GOLD)
      doc.rect(MARGEN, y, pageWidth - MARGEN * 2, 1.3, 'F')
      y += 7

      // ---- 3 tarjetas stat ----
      const statW = (pageWidth - MARGEN * 2 - 8) / 3
      const statH = 32
      const recomendado = resultado.recomendado
      tarjetaStat(doc, MARGEN, y, statW, statH, {
        bg: RED_LIGHT,
        labelColor: RED,
        label: 'LO QUE PAGA HOY',
        valorColor: RED,
        valor: `${formatEUR(resultado.costeActualMensual)}`,
        caption: `al mes · ${formatEUR(resultado.costeActualAnual)} al año`,
        captionColor: [150, 60, 60],
      })
      tarjetaStat(doc, MARGEN + statW + 4, y, statW, statH, {
        bg: ROW_TINT,
        labelColor: SLATE,
        label: 'CON NUESTRA PROPUESTA',
        valorColor: NAVY,
        valor: recomendado ? formatEUR(recomendado.cuota_mensual) : '—',
        caption: `al mes · ${recomendado?.operador || 'Sin propuesta'}`,
        captionColor: SLATE,
      })
      tarjetaStat(doc, MARGEN + (statW + 4) * 2, y, statW, statH, {
        bg: NAVY,
        labelColor: GOLD,
        label: 'AHORRO ANUAL · IVA INCLUIDO',
        valorColor: GOLD,
        valor: formatEUR(Math.abs(resultado.ahorroAnual)),
        caption: `${formatEUR(Math.abs(resultado.diferenciaMensual))} al mes × 12 meses`,
        captionColor: [210, 215, 225],
      })
      y += statH + 10

      // ---- 1. Diagnóstico ----
      y = tituloSeccion(doc, pageWidth, 1, 'Diagnóstico: lo que está pagando', y)

      const DIAGNOSTICOS_SIN_VALOR = ['PRESCINDIBLE', 'FUGA DE COSTE', 'CARGO OCULTO']
      const alertaTotal = resultado.conceptos
        .filter((c) => DIAGNOSTICOS_SIN_VALOR.includes(c.diagnostico))
        .reduce((s, c) => s + (Number(c.importeMes) || 0), 0)
      const fraseIntro =
        alertaTotal > 0
          ? `Paga ${formatEUR(resultado.costeActualMensual)} al mes. ${formatEUR(alertaTotal)} son cargos que no aportan valor a su negocio.`
          : `Paga ${formatEUR(resultado.costeActualMensual)} al mes, con una factura correctamente dimensionada a su consumo actual.`
      doc.setFontSize(9.3)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...NAVY)
      doc.text(doc.splitTextToSize(fraseIntro, pageWidth - MARGEN * 2), MARGEN, y)
      doc.setFont(undefined, 'normal')
      y += 8

      autoTable(doc, {
        startY: y,
        columns: [
          { header: 'Concepto', dataKey: 'concepto' },
          { header: 'Importe / mes (IVA incl.)', dataKey: 'importe' },
          { header: 'Diagnóstico', dataKey: 'diagnostico' },
        ],
        body: resultado.conceptos.map((c) => ({
          concepto: c.concepto,
          importe: formatEUR(c.importeMes),
          diagnostico: c.diagnostico,
        })),
        foot: [[{ content: 'Total factura', styles: { fontStyle: 'bold' } }, { content: formatEUR(resultado.costeActualMensual), styles: { fontStyle: 'bold' } }, '']],
        theme: 'striped',
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        footStyles: { fillColor: ROW_TINT, textColor: NAVY },
        alternateRowStyles: { fillColor: ROW_TINT },
        styles: { fontSize: 8.3, textColor: NAVY, lineColor: BORDER, lineWidth: 0.15, valign: 'middle' },
        columnStyles: { importe: { cellWidth: 40 }, diagnostico: { cellWidth: 44 } },
        margin: { left: MARGEN, right: MARGEN },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.dataKey === 'diagnostico') {
            data.cell.text = []
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.dataKey === 'diagnostico') {
            dibujarPastillaDiagnostico(doc, data.cell.raw, data.cell.x + 2, data.cell.y + data.cell.height / 2 - 2.2)
          }
        },
      })
      y = doc.lastAutoTable.finalY + 8

      if (resultado.hallazgos.length) {
        y = espacio(y, 32)
        const cardW = (pageWidth - MARGEN * 2 - (resultado.hallazgos.length - 1) * 5) / resultado.hallazgos.length
        const cardH = 28
        resultado.hallazgos.forEach((h, idx) => {
          const cx = MARGEN + idx * (cardW + 5)
          doc.setFillColor(255, 255, 255)
          doc.setDrawColor(...BORDER)
          doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD')
          doc.setFillColor(...RED)
          doc.rect(cx, y, 1.3, cardH, 'F')
          doc.setFont(undefined, 'bold')
          doc.setFontSize(8.4)
          doc.setTextColor(...NAVY)
          doc.text(doc.splitTextToSize(h.titulo, cardW - 11), cx + 6.5, y + 8)
          doc.setFont(undefined, 'normal')
          doc.setFontSize(7.4)
          doc.setTextColor(...SLATE)
          doc.text(doc.splitTextToSize(h.descripcion, cardW - 11), cx + 6.5, y + 15)
        })
        y += cardH + 9
      }

      // ---- 2. Comparativa de mercado ----
      y = nuevaPagina(doc, pageWidth, logoData, resultado.codigo, fechaTexto)
      y = tituloSeccion(doc, pageWidth, 2, `Comparativa de mercado: ${resultado.totalOperadoras} operadoras`, y)

      const fraseComparativa =
        resultado.operadorasQueMejoran === resultado.totalOperadoras
          ? `Todas las alternativas le ahorran frente a su tarifa actual. ${recomendado?.operador || ''} es la que mejor combina prestaciones de empresa y ahorro.`
          : `Solo ${resultado.operadorasQueMejoran} de las ${resultado.totalOperadoras} operadoras mejoran su tarifa actual; cambiar sin asesoramiento podría encarecerla hasta ${formatEUR(
              resultado.peorEncarecimiento
            )} al año. ${recomendado?.operador || ''} le da más prestaciones y reduce su coste.`
      doc.setFontSize(9.3)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...NAVY)
      doc.text(doc.splitTextToSize(fraseComparativa, pageWidth - MARGEN * 2), MARGEN, y)
      doc.setFont(undefined, 'normal')
      y += 10

      y = graficoBarras(doc, MARGEN, y, pageWidth - MARGEN * 2, resultado.operadores, resultado.costeActualAnual, recomendado?.id)
      y += 2
      doc.setFontSize(7)
      doc.setTextColor(...SLATE)
      doc.text('Coste anual estimado con IVA incluido para una configuración equivalente a la actual. Línea roja: lo que paga hoy.', MARGEN, y)
      y += 6

      const filasComparativa = resultado.operadores.map((op) => {
        const esRecomendado = op.id === recomendado?.id
        return [
          op.operador,
          formatEUR(op.cuota_mensual),
          op.promocion || '—',
          formatEUR(op.costeAnual),
          { texto: formatEUR(op.ahorroAnual), positivo: op.ahorroAnual >= 0 },
          op.valoracion || '—',
          esRecomendado,
        ]
      })
      filasComparativa.push([
        `Situación actual (${resultado.cliente?.operadorActual || 'actual'})`,
        formatEUR(resultado.costeActualMensual),
        '—',
        formatEUR(resultado.costeActualAnual),
        { texto: '—', positivo: null },
        'Su factura actual',
        false,
      ])

      autoTable(doc, {
        startY: y,
        head: [['Operador', 'Cuota / mes', 'Promoción', 'Coste anual', 'Ahorro anual', 'Valoración']],
        body: filasComparativa.map((f) => [f[0], f[1], f[2], f[3], f[4].texto, f[5]]),
        theme: 'striped',
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: ROW_TINT },
        styles: { fontSize: 7.6, textColor: NAVY, lineColor: BORDER, lineWidth: 0.15, valign: 'middle' },
        margin: { left: MARGEN, right: MARGEN },
        didParseCell: (data) => {
          if (data.section !== 'body') return
          const meta = filasComparativa[data.row.index]
          const esActual = data.row.index === filasComparativa.length - 1
          if (meta[6]) {
            data.cell.styles.fillColor = GOLD_LIGHT
            data.cell.styles.fontStyle = 'bold'
          }
          if (esActual) {
            data.cell.styles.textColor = RED
            data.cell.styles.fontStyle = 'italic'
          }
          if (data.column.index === 4 && meta[4].positivo !== null) {
            data.cell.styles.textColor = meta[4].positivo ? GREEN : RED
            data.cell.styles.fontStyle = 'bold'
          }
        },
      })
      y = doc.lastAutoTable.finalY + 6
      doc.setFontSize(6.8)
      doc.setTextColor(...SLATE)
      doc.text(
        doc.splitTextToSize(
          'Importes con IVA (21 %) incluido. Precios de referencia del catálogo de operadoras de Integral Connection Consulting: confirme la cuota exacta con cada operadora antes de contratar.',
          pageWidth - MARGEN * 2
        ),
        MARGEN,
        y
      )

      // ---- 3. Nuestra propuesta ----
      y = nuevaPagina(doc, pageWidth, logoData, resultado.codigo, fechaTexto)
      y = tituloSeccion(doc, pageWidth, 3, `Nuestra propuesta: ${recomendado?.operador || ''}`, y)

      const fraseExplica = `Con ${recomendado?.operador || 'nuestra propuesta'}, su factura pasa de ${formatEUR(
        resultado.costeActualMensual
      )} a ${formatEUR(recomendado?.cuota_mensual || 0)} al mes.`
      doc.setFontSize(9.3)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(...NAVY)
      doc.text(doc.splitTextToSize(fraseExplica, pageWidth - MARGEN * 2), MARGEN, y)
      doc.setFont(undefined, 'normal')
      y += 10

      const colW = (pageWidth - MARGEN * 2 - 6) / 2
      autoTable(doc, {
        startY: y,
        body: [
          ['Paga hoy', `${formatEUR(resultado.costeActualMensual)} / mes`],
          [`Pagará con ${recomendado?.operador || ''}`, `${formatEUR(recomendado?.cuota_mensual || 0)} / mes`],
          ['Diferencia mensual', `${formatEUR(resultado.diferenciaMensual)} / mes`],
          ['× 12 meses', ''],
          [{ content: 'Ahorro anual, IVA incluido', styles: { fontStyle: 'bold' } }, { content: formatEUR(resultado.ahorroAnual), styles: { fontStyle: 'bold' } }],
        ],
        theme: 'plain',
        styles: { fontSize: 8.6, textColor: NAVY, cellPadding: 2 },
        columnStyles: { 1: { halign: 'right' } },
        tableWidth: colW,
        margin: { left: MARGEN },
      })
      const finalYTabla = doc.lastAutoTable.finalY

      const cardX = MARGEN + colW + 6
      const cardH = Math.max(finalYTabla - y, 34)
      doc.setFillColor(...NAVY)
      doc.roundedRect(cardX, y, colW, cardH, 2.5, 2.5, 'F')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...GOLD)
      doc.text('AHORRO ANUAL GARANTIZADO', cardX + 6, y + 9)
      doc.setFontSize(19)
      doc.text(formatEUR(resultado.ahorroAnual), cardX + 6, y + 20)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.3)
      doc.setTextColor(220, 223, 230)
      doc.text(`IVA incluido · ${formatEUR(resultado.ahorroAnual * 3)} en 3 años`, cardX + 6, y + 27)

      y = Math.max(finalYTabla, y + cardH) + 10

      if (recomendado?.caracteristicasLista?.length) {
        y = espacio(y, 30)
        doc.setFont(undefined, 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...NAVY)
        doc.text(`Por qué ${recomendado.operador}`, MARGEN, y)
        doc.setFont(undefined, 'normal')
        y += 6
        y = bulletsSimples(doc, recomendado.caracteristicasLista, MARGEN, y, pageWidth - MARGEN * 2)
      }

      y = espacio(y, 30)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...NAVY)
      doc.text('Por qué con Integral Connection Consulting', MARGEN, y)
      doc.setFont(undefined, 'normal')
      y += 6
      const bulletsICC = [
        ...POR_QUE_ICC,
        ['Una consultora, no un call center.', `${resultado.consultor?.nombre || 'Su consultor/a'} lleva su caso de principio a fin, con contacto directo.`],
      ]
      y = bulletsDosColumnas(doc, bulletsICC, MARGEN, y, pageWidth - MARGEN * 2)

      // ---- CTA + aceptación ----
      y = espacio(y, 94, 208)
      const ctaW = (pageWidth - MARGEN * 2) * 0.58
      const aceptW = pageWidth - MARGEN * 2 - ctaW - 7
      const ctaH = 86

      doc.setFillColor(...NAVY)
      doc.roundedRect(MARGEN, y, ctaW, ctaH, 3, 3, 'F')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(12.5)
      doc.setTextColor(255, 255, 255)
      doc.text('Cada mes sin cambiar le cuesta', MARGEN + 7, y + 12)
      doc.setFontSize(17)
      doc.setTextColor(...GOLD)
      doc.text(`${formatEUR(Math.abs(resultado.diferenciaMensual))}.`, MARGEN + 7, y + 21)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.9)
      doc.setTextColor(220, 223, 230)
      doc.text(
        doc.splitTextToSize('Firme hoy y nos encargamos de todo. Migración en 5–14 días, sin cortes de servicio y conservando sus números.', ctaW - 14),
        MARGEN + 7,
        y + 28
      )

      const pasos = [
        ['1 · Firme', 'Este presupuesto'],
        ['2 · Gestionamos', 'Portabilidad y alta'],
        ['3 · Ahorra', 'Desde la primera factura'],
      ]
      const pasoW = (ctaW - 14 - 2 * 4) / 3
      const pasosY = y + 40
      const pasosH = 18
      pasos.forEach(([titulo, sub], idx) => {
        const px = MARGEN + 7 + idx * (pasoW + 4)
        doc.setFillColor(37, 48, 64)
        doc.roundedRect(px, pasosY, pasoW, pasosH, 1.5, 1.5, 'F')
        doc.setFillColor(...GOLD)
        doc.rect(px, pasosY, 1, pasosH, 'F')
        doc.setFont(undefined, 'bold')
        doc.setFontSize(7.6)
        doc.setTextColor(...GOLD)
        doc.text(titulo, px + 3.5, pasosY + 6.5)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(6.6)
        doc.setTextColor(220, 223, 230)
        doc.text(doc.splitTextToSize(sub, pasoW - 6), px + 3.5, pasosY + 11.5)
      })

      // Botón CTA de contacto: pastilla dorada con icono de sobre
      const botonH = 15
      const botonY = pasosY + pasosH + 7
      doc.setFillColor(...GOLD)
      doc.roundedRect(MARGEN + 7, botonY, ctaW - 14, botonH, 2.2, 2.2, 'F')
      const iconoX = MARGEN + 14
      const iconoY = botonY + botonH / 2 - 2
      doc.setDrawColor(...NAVY)
      doc.setLineWidth(0.45)
      doc.setFillColor(255, 255, 255)
      doc.rect(iconoX, iconoY, 5.5, 4, 'FD')
      doc.line(iconoX, iconoY, iconoX + 2.75, iconoY + 2.2)
      doc.line(iconoX + 2.75, iconoY + 2.2, iconoX + 5.5, iconoY)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8.6)
      doc.setTextColor(...NAVY)
      doc.text(`Escriba a ${resultado.consultor?.nombre || 'su consultor/a'}`, iconoX + 9, botonY + botonH / 2 - 1.3)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.4)
      doc.text(resultado.consultor?.email || COMPANY.email, iconoX + 9, botonY + botonH / 2 + 3.3)

      const aceptX = MARGEN + ctaW + 7
      doc.setDrawColor(...BORDER)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(aceptX, y, aceptW, ctaH, 3, 3, 'FD')
      doc.setFont(undefined, 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...NAVY)
      doc.text('ACEPTACIÓN DEL PRESUPUESTO', aceptX + 6, y + 10)

      doc.setFillColor(...GOLD_LIGHT)
      doc.roundedRect(aceptX + 5, y + 16, aceptW - 10, 15, 1.5, 1.5, 'F')
      doc.setDrawColor(...GOLD)
      doc.setLineWidth(0.5)
      doc.rect(aceptX + 8, y + 20, 4.4, 4.4)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(7.6)
      doc.setTextColor(...NAVY)
      doc.text(`${recomendado?.operador || ''} (recomendada)`, aceptX + 15.5, y + 22.8, { maxWidth: aceptW - 24 })
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.2)
      doc.setTextColor(...SLATE)
      doc.text(`Ahorro ${formatEUR(resultado.ahorroAnual)}/año`, aceptX + 15.5, y + 27)

      doc.setDrawColor(...SLATE)
      doc.setLineWidth(0.4)
      doc.rect(aceptX + 8, y + 36.5, 4, 4)
      doc.setFontSize(7.4)
      doc.setTextColor(...NAVY)
      doc.text('Otra opción: ____________________', aceptX + 15, y + 39.3)

      doc.setFontSize(7)
      doc.setTextColor(...SLATE)
      doc.text('Nombre y apellidos', aceptX + 6, y + 52)
      doc.setDrawColor(...BORDER)
      doc.line(aceptX + 6, y + 60, aceptX + aceptW - 6, y + 60)
      doc.text('DNI / CIF', aceptX + 6, y + 68)
      doc.line(aceptX + 6, y + 76, aceptX + aceptW - 6, y + 76)

      y += ctaH + 11

      // ---- Firma del consultor ----
      y = espacio(y, 26)
      doc.setDrawColor(...SLATE)
      doc.setLineWidth(0.2)
      doc.line(pageWidth - MARGEN - 60, y + 14, pageWidth - MARGEN, y + 14)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...NAVY)
      doc.text(resultado.consultor?.nombre || COMPANY.name, MARGEN, y)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(7.6)
      doc.setTextColor(...SLATE)
      doc.text('Consultor/a senior de optimización de telecomunicaciones', MARGEN, y + 5)
      doc.text(COMPANY.name, MARGEN, y + 10)
      doc.text(resultado.consultor?.email || COMPANY.email, MARGEN, y + 15)
      doc.setFontSize(7)
      doc.text('Fecha y firma del cliente', pageWidth - MARGEN - 60, y + 18)

      // ---- Pie de página ----
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setDrawColor(...BORDER)
        doc.setLineWidth(0.3)
        doc.line(MARGEN, pageHeight - 14, pageWidth - MARGEN, pageHeight - 14)
        doc.setFontSize(7.4)
        doc.setTextColor(...SLATE)
        doc.text(`${COMPANY.name} · Informe de auditoría de telecomunicaciones · ${resultado.cliente?.nombre || ''}`, MARGEN, pageHeight - 9)
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGEN, pageHeight - 9, { align: 'right' })
      }

      return doc
    }

    async function descargarInformeTelecomPDF(resultado) {
      const doc = await generarInformeTelecomPDF(resultado)
      const nombreArchivo = `Informe_Auditoria_${(resultado.cliente?.nombre || 'cliente').replace(/\s+/g, '_')}.pdf`
      doc.save(nombreArchivo)
    }
    return { generarInformeTelecomPDF, descargarInformeTelecomPDF }
  })();

  var motor = {};
  Object.keys(MODS).forEach(function (k) { Object.assign(motor, MODS[k]); });
  motor.MODS = MODS;
  // La implementa js/comparador.js contra la API del CRM (api/tarifas.php).
  motor.listarTarifas = function () { return Promise.resolve([]); };
  return motor;
})();
