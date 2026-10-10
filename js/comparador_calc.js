/* =============================================================================
   ICC CRM · Comparador · Motor de calculo (puro, sin UI)
   Portado del motor original (energy.js / telephony.js / alarms.js).
   ============================================================================= */
window.icc = window.icc || {};

window.icc.comparadorCalc = (function () {
  var IVA = 0.21;
  var IMPUESTO_ELECTRICIDAD = 0.0511269632;
  var BONO_SOCIAL_DIA = 0.019121;
  var DIAS_ANIO = 365;

  function num(v) {
    return Number(v) || 0;
  }

  // ------------------------------------------------------------------ Energia
  function calcularCosteLuz(input, precios) {
    var periodos = Object.keys(input.consumos).filter(function (k) {
      return input.consumos[k] != null && input.consumos[k] !== "";
    });
    var diasFactura = num(input.diasFactura) || 30;

    var desglosePeriodos = periodos.map(function (p) {
      var consumoKwh = num(input.consumos[p]);
      var potenciaKw = num(input.potencias[p] != null ? input.potencias[p] : input.potencias.p1);
      var precioEnergia = num(precios.energia[p]);
      var precioPotencia = num(precios.potencia ? precios.potencia[p] : 0);
      return {
        periodo: p.toUpperCase(),
        consumoKwh: consumoKwh,
        potenciaKw: potenciaKw,
        precioEnergia: precioEnergia,
        precioPotencia: precioPotencia,
        costeEnergia: consumoKwh * precioEnergia,
        costePotencia: potenciaKw * precioPotencia * diasFactura,
      };
    });

    var terminoEnergia = desglosePeriodos.reduce(function (s, d) { return s + d.costeEnergia; }, 0);
    var terminoPotencia = desglosePeriodos.reduce(function (s, d) { return s + d.costePotencia; }, 0);
    var terminoFijo = (num(precios.terminoFijoMensual) / 30) * diasFactura;
    var alquilerEquipo = num(precios.alquilerEquipoDia) * diasFactura;
    var financiacionBonoSocial = BONO_SOCIAL_DIA * diasFactura;

    var baseImponible = terminoEnergia + terminoPotencia + terminoFijo + alquilerEquipo + financiacionBonoSocial;
    var impuestoElectricidad = baseImponible * IMPUESTO_ELECTRICIDAD;
    var baseConImpuesto = baseImponible + impuestoElectricidad;
    var iva = baseConImpuesto * IVA;
    var total = baseConImpuesto + iva;
    var factorAnual = DIAS_ANIO / diasFactura;

    return {
      diasFactura: diasFactura,
      desglosePeriodos: desglosePeriodos,
      terminoEnergia: terminoEnergia,
      terminoPotencia: terminoPotencia,
      terminoFijo: terminoFijo,
      alquilerEquipo: alquilerEquipo,
      financiacionBonoSocial: financiacionBonoSocial,
      baseImponible: baseImponible,
      impuestoElectricidad: impuestoElectricidad,
      iva: iva,
      total: total,
      totalAnual: total * factorAnual,
      totalMensualMedio: (total * factorAnual) / 12,
    };
  }

  function calcularCosteGas(input, precios) {
    var diasFactura = num(input.diasFactura) || 30;
    var consumoKwh = num(input.consumoKwh);
    var precioEnergia = num(precios.energia ? precios.energia.p1 : 0);
    var terminoEnergia = consumoKwh * precioEnergia;
    var terminoFijo = (num(precios.terminoFijoMensual) / 30) * diasFactura;
    var baseImponible = terminoEnergia + terminoFijo;
    var iva = baseImponible * IVA;
    var total = baseImponible + iva;
    var factorAnual = DIAS_ANIO / diasFactura;

    return {
      diasFactura: diasFactura,
      consumoKwh: consumoKwh,
      precioEnergia: precioEnergia,
      terminoEnergia: terminoEnergia,
      terminoFijo: terminoFijo,
      baseImponible: baseImponible,
      iva: iva,
      total: total,
      totalAnual: total * factorAnual,
      totalMensualMedio: (total * factorAnual) / 12,
    };
  }

  function precioTarifaComo(t) {
    return {
      potencia: { p1: t.precio_potencia_p1, p2: t.precio_potencia_p2, p3: t.precio_potencia_p3, p4: t.precio_potencia_p4, p5: t.precio_potencia_p5, p6: t.precio_potencia_p6 },
      energia: { p1: t.precio_energia_p1, p2: t.precio_energia_p2, p3: t.precio_energia_p3, p4: t.precio_energia_p4, p5: t.precio_energia_p5, p6: t.precio_energia_p6 },
      terminoFijoMensual: t.termino_fijo_mensual,
      alquilerEquipoDia: t.alquiler_equipo_dia,
    };
  }

  function compararLuz(datosCliente, tarifasCatalogo) {
    var precioActual = {
      potencia: datosCliente.precioPotenciaActual,
      energia: datosCliente.precioEnergiaActual,
      terminoFijoMensual: datosCliente.terminoFijoActualMensual || 0,
      alquilerEquipoDia: datosCliente.alquilerContadorDiaActual || 0,
    };
    var input = { diasFactura: datosCliente.diasFactura, potencias: datosCliente.potencias, consumos: datosCliente.consumos };
    var costeActual = calcularCosteLuz(input, precioActual);

    var candidatas = tarifasCatalogo
      .filter(function (t) { return t.tipo === "luz" && t.segmento === datosCliente.segmento; })
      .map(function (tarifa) { return { tarifa: tarifa, coste: calcularCosteLuz(input, precioTarifaComo(tarifa)) }; })
      .sort(function (a, b) { return a.coste.totalAnual - b.coste.totalAnual; });

    var mejor = candidatas[0] || null;
    return {
      tipo: "luz",
      segmento: datosCliente.segmento,
      costeActual: costeActual,
      mejorPropuesta: mejor,
      todasLasPropuestas: candidatas,
      ahorroAnual: mejor ? costeActual.totalAnual - mejor.coste.totalAnual : 0,
      ahorroPorcentaje: mejor && costeActual.totalAnual > 0 ? ((costeActual.totalAnual - mejor.coste.totalAnual) / costeActual.totalAnual) * 100 : 0,
    };
  }

  function compararGas(datosCliente, tarifasCatalogo) {
    var precioActual = { energia: { p1: datosCliente.precioEnergiaActual }, terminoFijoMensual: datosCliente.terminoFijoActualMensual || 0 };
    var input = { diasFactura: datosCliente.diasFactura, consumoKwh: datosCliente.consumoKwh };
    var costeActual = calcularCosteGas(input, precioActual);

    var candidatas = tarifasCatalogo
      .filter(function (t) { return t.tipo === "gas" && t.segmento === datosCliente.segmento; })
      .map(function (tarifa) {
        return { tarifa: tarifa, coste: calcularCosteGas(input, { energia: { p1: tarifa.precio_energia_p1 }, terminoFijoMensual: tarifa.termino_fijo_mensual }) };
      })
      .sort(function (a, b) { return a.coste.totalAnual - b.coste.totalAnual; });

    var mejor = candidatas[0] || null;
    return {
      tipo: "gas",
      segmento: datosCliente.segmento,
      costeActual: costeActual,
      mejorPropuesta: mejor,
      todasLasPropuestas: candidatas,
      ahorroAnual: mejor ? costeActual.totalAnual - mejor.coste.totalAnual : 0,
      ahorroPorcentaje: mejor && costeActual.totalAnual > 0 ? ((costeActual.totalAnual - mejor.coste.totalAnual) / costeActual.totalAnual) * 100 : 0,
    };
  }

  // ----------------------------------------------------------------- Telefonia
  function cumpleLinea(tarifa, linea) {
    if (linea.ilimitado) return Boolean(tarifa.datos_ilimitados);
    if (tarifa.datos_ilimitados) return true;
    return num(tarifa.gb_datos) >= num(linea.gbDeseados);
  }
  function ordenarPorPrecio(lista) {
    return lista.slice().sort(function (a, b) { return num(a.precio_mensual) - num(b.precio_mensual); });
  }

  function encontrarMejorPaquete(datosCliente, tarifasCatalogo) {
    var fibras = datosCliente.fibras || [];
    var lineasMoviles = datosCliente.lineasMoviles || [];
    var numLineas = lineasMoviles.length;

    if (fibras.length === 1 && numLineas > 0) {
      var fibra = fibras[0];
      var exigeIlimitado = lineasMoviles.some(function (l) { return l.ilimitado; });
      var gbMax = Math.max.apply(null, [0].concat(lineasMoviles.filter(function (l) { return !l.ilimitado; }).map(function (l) { return num(l.gbDeseados); })));

      var convergentesValidos = ordenarPorPrecio(
        tarifasCatalogo.filter(function (t) {
          return t.tipo === "convergente" &&
            num(t.velocidad_fibra_mb) >= num(fibra.velocidadDeseada) &&
            Number(t.lineas_moviles_incluidas) >= numLineas &&
            (exigeIlimitado ? t.datos_ilimitados : (t.datos_ilimitados || num(t.gb_datos) >= gbMax));
        })
      );

      if (convergentesValidos.length > 0) {
        var elegido = convergentesValidos[0];
        return {
          estrategia: "convergente",
          componentes: [{ tarifa: elegido, cantidad: 1, etiqueta: (fibra.etiqueta || "Fibra") + " + " + numLineas + " linea" + (numLineas > 1 ? "s" : "") + " movil" + (numLineas > 1 ? "es" : "") }],
          precioMensual: num(elegido.precio_mensual),
          // Todos los operadores validos para esta misma necesidad (no solo el
          // mas barato): usado para pintar la comparativa de mercado completa.
          todasLasPropuestas: convergentesValidos.map(function (t) { return { tarifa: t, precioMensual: num(t.precio_mensual) }; }),
        };
      }
    }

    var fibrasCatalogo = ordenarPorPrecio(tarifasCatalogo.filter(function (t) { return t.tipo === "fibra"; }));
    var movilesCatalogo = tarifasCatalogo.filter(function (t) { return t.tipo === "movil"; });
    var componentes = [];

    fibras.forEach(function (fibra) {
      var validas = ordenarPorPrecio(fibrasCatalogo.filter(function (t) { return num(t.velocidad_fibra_mb) >= num(fibra.velocidadDeseada); }));
      if (validas[0]) componentes.push({ tarifa: validas[0], cantidad: 1, etiqueta: fibra.etiqueta || "Fibra" });
    });

    lineasMoviles.forEach(function (linea, idx) {
      var validas = ordenarPorPrecio(movilesCatalogo.filter(function (t) { return cumpleLinea(t, linea); }));
      if (validas[0]) componentes.push({ tarifa: validas[0], cantidad: 1, etiqueta: linea.numero ? "Linea " + linea.numero : "Linea movil " + (idx + 1) });
    });

    var precioMensual = componentes.reduce(function (s, c) { return s + num(c.tarifa.precio_mensual) * c.cantidad; }, 0);
    return { estrategia: fibras.length > 0 ? "compuesto" : "solo_movil", componentes: componentes, precioMensual: precioMensual };
  }

  function resumenFactura(p) {
    var cuotas = num(p.cuotas), consumos = num(p.consumos), otros = num(p.otros);
    var total = cuotas + consumos + otros;
    var base = total / (1 + IVA);
    var iva = total - base;
    return { cuotas: cuotas, consumos: consumos, otros: otros, base: base, iva: iva, total: total };
  }

  function compararTelefonia(datosCliente, tarifasCatalogo) {
    var desgloseActual = resumenFactura({ cuotas: datosCliente.cuotaMensualActual, consumos: datosCliente.consumosActual, otros: datosCliente.otrosConceptosActual });
    var propuesta = encontrarMejorPaquete(datosCliente, tarifasCatalogo);
    var desglosePropuesta = resumenFactura({ cuotas: propuesta.precioMensual });

    var costeActualMensual = desgloseActual.total;
    var costePropuestaMensual = desglosePropuesta.total;
    var ahorroMensual = costeActualMensual - costePropuestaMensual;
    var ahorroAnual = ahorroMensual * 12;
    var ahorroPorcentaje = costeActualMensual > 0 ? (ahorroMensual / costeActualMensual) * 100 : 0;

    return {
      desgloseActual: desgloseActual,
      desglosePropuesta: desglosePropuesta,
      costeActualMensual: costeActualMensual,
      costeActualAnual: costeActualMensual * 12,
      propuesta: propuesta,
      costePropuestaMensual: costePropuestaMensual,
      costePropuestaAnual: costePropuestaMensual * 12,
      ahorroMensual: ahorroMensual,
      ahorroAnual: ahorroAnual,
      ahorroPorcentaje: ahorroPorcentaje,
    };
  }

  // -------------------------------------------------------------------- Alarmas
  function encontrarMejorKit(datosCliente, tarifasCatalogo) {
    var numCamaras = num(datosCliente.numCamarasActual);
    var numSensores = num(datosCliente.numSensoresActual);
    var candidatos = tarifasCatalogo.filter(function (kit) { return Number(kit.num_camaras) >= numCamaras && Number(kit.num_sensores) >= numSensores; });
    var base = candidatos.length > 0 ? candidatos : tarifasCatalogo;
    var ordenados = base.slice().sort(function (a, b) {
      if (candidatos.length === 0) return (Number(b.num_camaras) + Number(b.num_sensores)) - (Number(a.num_camaras) + Number(a.num_sensores));
      return num(a.cuota_mensual) - num(b.cuota_mensual);
    });
    return { kit: ordenados[0] || null, cubreEquipamiento: candidatos.length > 0 };
  }

  function desgloseFacturaAlarma(p) {
    var cuota = num(p.cuota), pagoContado = num(p.pagoContado);
    var totalPorServicios = cuota + pagoContado;
    var base = totalPorServicios / (1 + IVA);
    var iva = totalPorServicios - base;
    return { cuota: cuota, pagoContado: pagoContado, totalPorServicios: totalPorServicios, base: base, iva: iva, totalAPagar: totalPorServicios };
  }

  function compararAlarmas(datosCliente, tarifasCatalogo) {
    var costeActualMensual = num(datosCliente.cuotaMensualActual);
    var r = encontrarMejorKit(datosCliente, tarifasCatalogo);
    var kit = r.kit;
    var costePropuestaMensual = kit ? num(kit.cuota_mensual) : 0;
    var ahorroMensual = costeActualMensual - costePropuestaMensual;
    var ahorroAnual = ahorroMensual * 12;
    var ahorroPorcentaje = costeActualMensual > 0 ? (ahorroMensual / costeActualMensual) * 100 : 0;

    return {
      costeActualMensual: costeActualMensual,
      costeActualAnual: costeActualMensual * 12,
      kitPropuesto: kit,
      cubreEquipamiento: r.cubreEquipamiento,
      costePropuestaMensual: costePropuestaMensual,
      costePropuestaAnual: costePropuestaMensual * 12,
      desgloseActual: desgloseFacturaAlarma({ cuota: costeActualMensual }),
      desglosePropuesta: desgloseFacturaAlarma({ cuota: costePropuestaMensual, pagoContado: kit ? num(kit.coste_instalacion) : 0 }),
      ahorroMensual: ahorroMensual,
      ahorroAnual: ahorroAnual,
      ahorroPorcentaje: ahorroPorcentaje,
      permanenciaRestanteMeses: num(datosCliente.permanenciaRestanteMeses),
    };
  }

  return {
    IVA: IVA,
    compararLuz: compararLuz,
    compararGas: compararGas,
    compararTelefonia: compararTelefonia,
    compararAlarmas: compararAlarmas,
  };
})();
