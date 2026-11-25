-- Mejoras de operación: apartado temporal, revisión con fotos, cargos extra, temporadas,
-- mantenimiento por unidad y firma del contrato.

-- 1. Las solicitudes de la web apartan la unidad unas horas; si no se confirman, se liberan solas.
ALTER TABLE reservation ADD COLUMN hold_until timestamptz;

-- 4. Revisión de entrega/devolución: lista de verificación y fotos por posición.
ALTER TABLE reservation
  ADD COLUMN checklist_out jsonb,
  ADD COLUMN checklist_in jsonb;

CREATE TABLE inspection_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('out', 'in')),
  slot text NOT NULL CHECK (slot ~ '^[a-z_]{2,20}$'),
  file text NOT NULL,
  created_by uuid REFERENCES staff_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, stage, slot)
);

-- 5. Cargos extra que se suman al saldo (retraso, gasolina, entrega a domicilio, chofer, limpieza, daños).
CREATE TABLE charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('late', 'fuel', 'delivery', 'driver', 'cleaning', 'damage', 'other')),
  description text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_by uuid REFERENCES staff_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX charge_reservation_ix ON charge (reservation_id);

-- 6. Temporadas con tarifa propia. Cómo se calculó el precio de cada renta:
--    auto = tarifas y temporadas vigentes · rates = tarifa personalizada · manual = total acordado.
CREATE TABLE season (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  daily_cents integer NOT NULL CHECK (daily_cents >= 0),
  weekly_cents integer NOT NULL CHECK (weekly_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
ALTER TABLE reservation ADD COLUMN price_mode text NOT NULL DEFAULT 'auto' CHECK (price_mode IN ('auto', 'rates', 'manual'));
UPDATE reservation SET price_mode = 'rates';

-- 7. Mantenimiento y vencimientos por unidad.
ALTER TABLE vehicle
  ADD COLUMN insurance_expires date,
  ADD COLUMN verification_expires date,
  ADD COLUMN permit_expires date,
  ADD COLUMN service_every_km integer NOT NULL DEFAULT 10000 CHECK (service_every_km > 0),
  ADD COLUMN service_every_months integer NOT NULL DEFAULT 6 CHECK (service_every_months > 0),
  ADD COLUMN last_service_km integer,
  ADD COLUMN last_service_on date;

-- 8. Firma del arrendatario en el celular (imagen PNG).
-- Tabla aparte para no cargar la imagen en cada listado de rentas.
CREATE TABLE reservation_signature (
  reservation_id uuid PRIMARY KEY REFERENCES reservation(id) ON DELETE CASCADE,
  png text NOT NULL,
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO setting (key, value) VALUES ('extras', '{
  "hold_hours": 24,
  "late_grace_minutes": 60,
  "late_hour_cents": 15000,
  "fuel_quarter_cents": 40000,
  "delivery_cents": 30000,
  "driver_day_cents": 80000,
  "cleaning_cents": 30000
}'::jsonb) ON CONFLICT (key) DO NOTHING;
