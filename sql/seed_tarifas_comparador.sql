-- =============================================================================
-- ICC CRM · Comparador: tarifas propias iniciales (Energia, Telefonia, Alarmas)
-- Importar DESPUES de sql/migracion_comparador.sql
--
-- Los precios de energia se basan en los peajes/cargos regulados vigentes
-- desde enero de 2026 (identicos para todas las comercializadoras) mas un
-- termino de energia competitivo de referencia observado en el mercado libre
-- espanol a fecha de septiembre de 2026. Telefonia y alarmas se basan en
-- ofertas de mercado equivalentes observadas en la misma fecha.
--
-- IMPORTANTE: revisa/ajusta estos precios periodicamente desde el propio CRM
-- (Comparador -> Tarifas), sin tocar codigo.
-- =============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------- ENERGIA · LUZ
INSERT INTO tarifa_energia
  (nombre_tarifa, tipo, segmento, descripcion,
   precio_potencia_p1, precio_potencia_p2, precio_potencia_p3, precio_potencia_p4, precio_potencia_p5, precio_potencia_p6,
   precio_energia_p1, precio_energia_p2, precio_energia_p3, precio_energia_p4, precio_energia_p5, precio_energia_p6,
   termino_fijo_mensual, alquiler_equipo_dia, permanencia_meses, destacada)
VALUES
  ('IC Fija Ahorro 2.0TD', 'luz', '2.0TD',
   'Tarifa de precio fijo a 12 meses. Mismo precio del kWh en punta, llana y valle.',
   0.078000, 0.012000, 0, 0, 0, 0,
   0.148000, 0.148000, 0.148000, 0, 0, 0,
   0, 0.026000, 12, 0),

  ('IC Ahorro Max 2.0TD', 'luz', '2.0TD',
   'Tarifa por periodos optimizada para consumo en valle/llano. La propuesta mas competitiva.',
   0.072000, 0.010000, 0, 0, 0, 0,
   0.142000, 0.108000, 0.078000, 0, 0, 0,
   0, 0.026000, 12, 1),

  ('IC Flex Sin Permanencia 2.0TD', 'luz', '2.0TD',
   'Sin permanencia ni penalizacion por baja.',
   0.082000, 0.014000, 0, 0, 0, 0,
   0.155000, 0.121000, 0.091000, 0, 0, 0,
   0, 0.026000, 0, 0),

  ('IC Negocio Estable 3.0TD', 'luz', '3.0TD',
   'Para pymes y comercios, potencia entre 15 y 50 kW, 3 periodos de potencia y 6 de energia.',
   0.055000, 0.038000, 0.021000, 0.021000, 0.038000, 0.021000,
   0.152000, 0.138000, 0.126000, 0.126000, 0.108000, 0.098000,
   0, 0.030000, 12, 0);

-- ---------------------------------------------------------------- ENERGIA · GAS
INSERT INTO tarifa_energia
  (nombre_tarifa, tipo, segmento, descripcion, precio_energia_p1, termino_fijo_mensual, permanencia_meses, destacada)
VALUES
  ('IC Gas Hogar RL.1', 'gas', 'RL.1',
   'Viviendas con consumo de gas para cocina y agua caliente (sin calefaccion de gas).',
   0.058000, 6.90, 12, 0),

  ('IC Gas Confort RL.2', 'gas', 'RL.2',
   'Viviendas con calefaccion de gas natural. Mejor precio por kWh gracias al mayor volumen.',
   0.047000, 10.50, 12, 1),

  ('IC Gas Sin Permanencia RL.1', 'gas', 'RL.1',
   'Tarifa de gas flexible sin permanencia.',
   0.063000, 7.50, 0, 0);

-- ---------------------------------------------------------------- TELEFONIA
INSERT INTO tarifa_telefonia
  (nombre_tarifa, tipo, descripcion, gb_datos, datos_ilimitados, llamadas_ilimitadas,
   velocidad_fibra_mb, lineas_moviles_incluidas, lineas_fijas_incluidas, extras,
   precio_mensual, permanencia_meses, destacada)
VALUES
  ('IC Movil 50GB', 'movil', 'Linea movil individual con llamadas ilimitadas.',
   50, 0, 1, NULL, 1, 0, 'Roaming UE incluido',
   9.90, 0, 0),

  ('IC Movil Ilimitado 5G', 'movil', 'Datos ilimitados con velocidad 5G y llamadas ilimitadas.',
   NULL, 1, 1, NULL, 1, 0, '5G,Roaming UE incluido',
   14.90, 0, 1),

  ('IC Fibra 300 Mb', 'fibra', 'Fibra simetrica 300 Mb sin linea fija asociada.',
   NULL, 0, 1, 300, 0, 0, 'WiFi 6',
   24.90, 12, 0),

  ('IC Fibra 600 Mb', 'fibra', 'Fibra simetrica 600 Mb, ideal para teletrabajo y streaming multiple.',
   NULL, 0, 1, 600, 0, 0, 'WiFi 6,IP fija opcional',
   28.90, 12, 0),

  ('IC Convergente Esencial', 'convergente', 'Fibra 600 Mb + 1 linea movil con 60 GB, sin permanencia.',
   60, 0, 1, 600, 1, 1, 'WiFi 6',
   26.90, 0, 1),

  ('IC Convergente Total', 'convergente', 'Fibra simetrica 1 Gb + 2 lineas moviles con datos ilimitados 5G.',
   NULL, 1, 1, 1000, 2, 1, '5G,WiFi 6,Roaming UE incluido',
   42.90, 12, 1),

  ('IC Convergente Familiar', 'convergente', 'Fibra 600 Mb + 4 lineas moviles ilimitadas, para hogares grandes.',
   NULL, 1, 1, 600, 4, 1, '5G,WiFi 6',
   64.90, 12, 0),

  ('IC Centralita Virtual Pro', 'centralita', 'Centralita virtual en la nube por extension, para oficinas y comercios.',
   NULL, 0, 1, NULL, 0, 1, 'IVR,Grabacion de llamadas,App movil',
   19.90, 12, 0);

-- ---------------------------------------------------------------- ALARMAS
INSERT INTO tarifa_alarmas
  (nombre_kit, tipo_kit, descripcion, equipamiento, num_camaras, num_sensores, num_mandos,
   conexion_movil, central_receptora, cuota_mensual, coste_instalacion,
   permanencia_meses, destacada)
VALUES
  ('IC Basica Hogar', 'basica', 'Central de alarma + 2 detectores de movimiento + mando, app movil y CRA 24h.',
   '1 panel de control con transmision GPRS/IP,1 mando a distancia,2 detectores de movimiento,1 sirena interior,Conexion a Central Receptora de Alarmas 24h',
   0, 2, 1, 1, 1, 19.90, 0, 24, 0),

  ('IC Camaras Smart', 'camaras', 'Kit con 2 camaras HD interior/exterior, verificacion por video y deteccion inteligente.',
   '1 panel de control con transmision GPRS/IP,1 mando a distancia,2 camaras HD con verificacion por video,3 detectores de movimiento,1 sirena interior,Conexion a Central Receptora de Alarmas 24h',
   2, 3, 1, 1, 1, 29.90, 0, 24, 1),

  ('IC Gama Alta 360', 'gama_alta', 'Proteccion integral: 4 camaras HD, 6 sensores, sirena exterior y videoverificacion 24h.',
   '1 panel de control con transmision GPRS/IP,2 mandos a distancia,4 camaras HD con verificacion por video,6 detectores de movimiento,1 sirena exterior de alta potencia,1 detector magnetico de apertura,Conexion a Central Receptora de Alarmas 24h',
   4, 6, 2, 1, 1, 39.90, 0, 24, 0),

  ('IC Flex Sin Permanencia', 'basica', 'Kit basico sin permanencia, instalacion con coste reducido a cambio de libertad total.',
   '1 panel de control con transmision GPRS/IP,1 mando a distancia,3 detectores de movimiento,1 sirena interior,Conexion a Central Receptora de Alarmas 24h',
   0, 3, 1, 1, 1, 24.90, 149.00, 0, 0),

  ('IC Comercial Negocio', 'comercial', 'Solucion para locales y oficinas: 6 camaras, sensores perimetrales y apertura remota.',
   '1 panel de control con transmision GPRS/IP,2 mandos/lectores de llave electronicos,6 camaras HD con verificacion por video,8 detectores de movimiento perimetrales,1 sirena exterior de alta potencia,Apertura remota y control de accesos,Conexion a Central Receptora de Alarmas 24h',
   6, 8, 2, 1, 1, 59.90, 0, 24, 0);
