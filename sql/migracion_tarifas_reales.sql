-- =============================================================================
-- ICC CRM · Comparador: sustituye las tarifas de ejemplo ("IC ...") de Luz
-- 2.0TD y de Telefonia convergente por tarifas REALES de compañías del
-- mercado, para que "Comparativa de mercado" compare de verdad contra
-- Endesa/Iberdrola/Naturgy/TotalEnergies (luz) y Vodafone/Orange/MásMóvil/
-- Yoigo/Lowi/O2/Digi/Telecable (fibra+móvil), no contra tarifas propias.
--
-- Fuente de precios:
--  - Luz 2.0TD: precios de energia (€/kWh) publicados por cada
--    comercializadora, investigados en octubre de 2026 (Iberdrola, Endesa,
--    Naturgy, TotalEnergies). El termino de potencia no se publica por
--    comercializadora de forma homogenea: se usa una referencia estimada
--    igual para todas (ajustala en Comparador -> Tarifas si tienes datos
--    mejores). Sin cuota fija mensual (termino_fijo_mensual = 0), igual que
--    las tarifas de ejemplo que sustituye.
--  - Telefonia convergente: precios reales ya usados por Integral Connection
--    Consulting en sus propios informes de auditoria de telecomunicaciones
--    (los mismos 8 operadores, en dos configuraciones: 2 lineas/600Mb/TV
--    basica, y 3 lineas/1Gb/TV premium). Los precios de promocion de los
--    primeros meses NO se guardan (el motor de calculo no modela promos);
--    se guarda el precio recurrente normal, que es el coste real sostenido.
--
-- IMPORTANTE: estos precios cambian. Revisalos cada mes desde el propio CRM
-- (Comparador -> Tarifas -> Energia/Telecomunicaciones), sin tocar codigo ni
-- volver a importar SQL.
--
-- Seguro de repetir: primero desactiva (no borra) las tarifas "IC ..." de
-- luz 2.0TD y convergente que sustituye, y solo inserta las reales si
-- todavia no existen (por proveedor + nombre_tarifa).
-- =============================================================================

SET NAMES utf8mb4;

-- Desactiva (sin borrar) las tarifas de ejemplo que esta migracion sustituye.
UPDATE tarifa_energia SET activo = 0
WHERE proveedor = 'Integral Connection Consulting' AND tipo = 'luz' AND segmento = '2.0TD';

UPDATE tarifa_telefonia SET activo = 0
WHERE proveedor = 'Integral Connection Consulting' AND tipo = 'convergente';

-- ---------------------------------------------------------- ENERGIA · LUZ 2.0TD
-- Potencia (estimada, igual para todas): P1 0,085 €/kW/dia, P2 0,020 €/kW/dia.
-- Energia (real, investigada): punta/llano/valle en €/kWh.
INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'TotalEnergies' AS proveedor, 'A Tu Aire Luz Siempre' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio unico de energia, sin discriminacion horaria. La mas barata de referencia.' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.109900 AS precio_energia_p1, 0.109900 AS precio_energia_p2, 0.109900 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 1 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'Naturgy' AS proveedor, 'Tarifa Por Uso' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio unico de energia, sin discriminacion horaria.' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.112000 AS precio_energia_p1, 0.112000 AS precio_energia_p2, 0.112000 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'TotalEnergies' AS proveedor, 'A Tu Aire Luz Programa Tu Ahorro' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio por periodos (punta/llano/valle). Mejor para consumo concentrado en horas valle.' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.173600 AS precio_energia_p1, 0.103900 AS precio_energia_p2, 0.076200 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'Naturgy' AS proveedor, 'Tarifa Noche' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio por periodos (punta/llano/valle). Mejor para consumo concentrado por la noche.' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.182200 AS precio_energia_p1, 0.109200 AS precio_energia_p2, 0.073900 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'Iberdrola' AS proveedor, 'Online 3 Periodos' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio por periodos (punta/llano/valle).' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.152100 AS precio_energia_p1, 0.131300 AS precio_energia_p2, 0.120900 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_energia
  (proveedor, nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2,
   precio_energia_p1, precio_energia_p2, precio_energia_p3,
   termino_fijo_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT
    'Endesa' AS proveedor, 'Tarifa Conecta 3 Periodos' AS nombre_tarifa, 'luz' AS tipo, '2.0TD' AS segmento, 'Precio por periodos (punta/llano/valle).' AS descripcion, 0.085000 AS precio_potencia_p1, 0.020000 AS precio_potencia_p2, 0.186200 AS precio_energia_p1, 0.117800 AS precio_energia_p2, 0.094400 AS precio_energia_p3, 0 AS termino_fijo_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_energia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

-- ------------------------------------------------- TELEFONIA · CONVERGENTE
-- Tier 1: fibra 600 Mb + fijo + 2 lineas moviles ilimitadas + TV basica.
INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Vodafone' AS proveedor, 'Vodafone Business (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, '2 lineas ilimitadas 5G, soporte 24/7, MultiSIM y streaming incluido.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV basica,Soporte 24/7,MultiSIM' AS extras, 52.06 AS precio_mensual, 0 AS permanencia_meses, 1 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Lowi' AS proveedor, 'Lowi (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial, sin atencion de empresa ni soporte prioritario.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV basica' AS extras, 40.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'O2' AS proveedor, 'O2 (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial sin permanencia; sin soporte de empresa.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV basica,Sin permanencia' AS extras, 50.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Digi' AS proveedor, 'Digi (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial; cobertura de fibra a verificar por zona.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV basica' AS extras, 52.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Telecable' AS proveedor, 'Telecable (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Solo disponible en Asturias. Sin servicios de empresa.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV basica,2a linea gratis' AS extras, 59.90 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'MásMóvil' AS proveedor, 'MásMóvil Empresas (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'TV aparte. Precio recurrente tras promocion de los primeros meses.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Promo primeros meses' AS extras, 64.60 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Yoigo' AS proveedor, 'Yoigo Empresas (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Precio recurrente tras promocion de los primeros meses.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Promo primeros meses' AS extras, 70.01 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Orange' AS proveedor, 'Orange Empresas (2 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'La mas cara para perfiles pequeños. Precio definitivo, sin promocion.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 600 AS velocidad_fibra_mb, 2 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Precio definitivo' AS extras, 81.68 AS precio_mensual, 12 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

-- Tier 2: fibra 1 Gb + fijo + 3 lineas moviles ilimitadas + TV premium.
INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Vodafone' AS proveedor, 'Vodafone Business (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, '2-3 lineas ilimitadas 5G, MultiSIM, soporte tecnico 24/7, TV con Netflix y 200 min internacionales.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'TV con Netflix,Soporte 24/7,MultiSIM,200 min internacionales' AS extras, 82.66 AS precio_mensual, 0 AS permanencia_meses, 1 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Lowi' AS proveedor, 'Lowi (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial, sin atencion de empresa.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Precio fijo' AS extras, 55.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Digi' AS proveedor, 'Digi (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial; cobertura por verificar.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, '' AS extras, 55.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'O2' AS proveedor, 'O2 (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Oferta residencial sin permanencia; sin soporte de empresa.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Sin permanencia' AS extras, 60.00 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Telecable' AS proveedor, 'Telecable (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Solo Asturias; sin servicios de empresa.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, '2a linea gratis' AS extras, 71.90 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'MásMóvil' AS proveedor, 'MásMóvil Empresas (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Sube tras la promocion; TV aparte.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Promo primeros 3 meses: 79,28 €/mes,TV aparte' AS extras, 82.91 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Yoigo' AS proveedor, 'Yoigo Empresas (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'Fuerte subida tras la promocion.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Promo primeros 3 meses: 61,61 €/mes' AS extras, 91.86 AS precio_mensual, 0 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);

INSERT INTO tarifa_telefonia
  (proveedor, nombre_tarifa, tipo, descripcion, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
SELECT * FROM (SELECT   'Orange' AS proveedor, 'Orange Empresas (3 lineas)' AS nombre_tarifa, 'convergente' AS tipo, 'La mas cara; permanencia 12 meses.' AS descripcion, 1 AS datos_ilimitados, 1 AS llamadas_ilimitadas, 1000 AS velocidad_fibra_mb, 3 AS lineas_moviles_incluidas, 1 AS lineas_fijas_incluidas, 'Precio definitivo' AS extras, 97.41 AS precio_mensual, 12 AS permanencia_meses, 0 AS destacada
) t WHERE NOT EXISTS (SELECT 1 FROM tarifa_telefonia WHERE proveedor = t.proveedor AND nombre_tarifa = t.nombre_tarifa);
