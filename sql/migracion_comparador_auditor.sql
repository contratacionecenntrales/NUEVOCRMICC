-- =============================================================================
-- ICC CRM · Migracion: Comparador y Auditor Inteligente (v53)
-- - tarifa_mercado: catalogo de operadoras de mercado para la Auditoria de
--   Telecomunicaciones (precios orientativos: revisalos desde Comparador ->
--   Tarifas -> Mercado antes de usarlos con clientes).
-- - comparador_auditorias: admite "Pack Integral", el informe avanzado de
--   telecomunicaciones, el codigo del informe y la factura analizada.
-- Ejecutala UNA sola vez.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS tarifa_mercado (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operador VARCHAR(100) NOT NULL,
  cuota_mensual DECIMAL(10,2) NOT NULL DEFAULT 0,
  promocion VARCHAR(255) DEFAULT NULL,
  valoracion VARCHAR(255) DEFAULT NULL,
  caracteristicas TEXT DEFAULT NULL,
  recomendada TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tarifa_mercado_activo (activo, cuota_mensual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semilla orientativa (ver aviso de precios en sql/seed.sql): actualízala
-- desde Panel de Administración → Mercado antes de usarla con clientes.
INSERT INTO tarifa_mercado (operador, cuota_mensual, promocion, valoracion, caracteristicas, recomendada)
SELECT * FROM (SELECT
  'Lowi' AS operador, 55.00 AS cuota_mensual, 'Precio fijo' AS promocion, 'Residencial; sin atención de empresa' AS valoracion, NULL AS caracteristicas, 0 AS recomendada
  UNION ALL SELECT 'Digi', 55.00, NULL, 'Residencial; cobertura por verificar', NULL, 0
  UNION ALL SELECT 'O2', 60.00, 'Sin permanencia', 'Residencial; sin soporte de empresa', NULL, 0
  UNION ALL SELECT 'Telecable', 71.90, '2.ª línea gratis', 'Solo Asturias; sin servicios de empresa', NULL, 0
  UNION ALL SELECT 'Vodafone Business', 82.66, 'Precio estable', '2 líneas ilimitadas, soporte 24/7, MultiSIM, Netflix',
    '2 líneas ilimitadas 5G y MultiSIM para trabajar desde cualquier dispositivo.\nSoporte informático 24/7 y Secure Net incluidos.\nVodafone TV con Netflix y 200 minutos internacionales.\nSin cargos sorpresa: bloqueamos terceros, adultos y contenidos a la carta.', 1
  UNION ALL SELECT 'MásMóvil Empresas', 82.91, '79,28 € × 3 meses', 'Sube tras la promoción; TV aparte', NULL, 0
  UNION ALL SELECT 'Yoigo Empresas', 91.86, '61,61 € × 3 meses', 'Fuerte subida tras la promoción', NULL, 0
  UNION ALL SELECT 'Orange Empresas', 97.41, 'Precio definitivo', 'La más cara; permanencia 12 meses', NULL, 0
) AS semilla
WHERE NOT EXISTS (SELECT 1 FROM tarifa_mercado);

ALTER TABLE comparador_auditorias MODIFY sector ENUM('energia','telefonia','alarmas','pack_integral') NOT NULL;
ALTER TABLE comparador_auditorias ADD COLUMN tipo_informe VARCHAR(30) NOT NULL DEFAULT 'comparativa' AFTER sector;
ALTER TABLE comparador_auditorias ADD COLUMN codigo VARCHAR(40) NULL AFTER tipo_informe;
ALTER TABLE comparador_auditorias ADD COLUMN referencia_factura VARCHAR(190) NOT NULL DEFAULT '' AFTER codigo;
ALTER TABLE comparador_auditorias ADD COLUMN documento_id INT UNSIGNED NULL AFTER referencia_factura;
ALTER TABLE comparador_auditorias ADD CONSTRAINT fk_comparador_documento FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE SET NULL;
CREATE INDEX idx_comparador_fecha ON comparador_auditorias(created_at);
