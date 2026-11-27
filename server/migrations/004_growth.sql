-- Crecimiento: tipos de vehículo con tarifa propia, GPS, cupones y control de clientes bloqueados.

-- 1. Tipo de vehículo y tarifa propia por unidad.
-- Sin tarifa propia, la unidad usa la tarifa general y las temporadas (como hasta ahora).
-- on_website: solo las unidades marcadas se ofrecen en el calendario público.
ALTER TABLE vehicle
  ADD COLUMN vehicle_type text NOT NULL DEFAULT 'Nissan Urvan',
  ADD COLUMN daily_rate_cents integer CHECK (daily_rate_cents >= 0),
  ADD COLUMN weekly_rate_cents integer CHECK (weekly_rate_cents >= 0),
  ADD COLUMN on_website boolean NOT NULL DEFAULT true,
  ADD COLUMN gps_url text;

-- 2. Cupones de descuento (porcentaje o monto fijo).
CREATE TABLE coupon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{3,20}$'),
  kind text NOT NULL CHECK (kind IN ('percent', 'amount')),
  value integer NOT NULL CHECK (value > 0),          -- % (1–90) o centavos
  min_days smallint NOT NULL DEFAULT 1 CHECK (min_days >= 1),
  starts_on date,
  ends_on date,
  max_uses integer CHECK (max_uses > 0),
  on_website boolean NOT NULL DEFAULT true,           -- se puede usar en la página web
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'percent' OR value <= 90),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);
ALTER TABLE reservation ADD COLUMN coupon_id uuid REFERENCES coupon(id);
CREATE INDEX reservation_coupon_ix ON reservation (coupon_id) WHERE coupon_id IS NOT NULL;

-- 3. Motivo del bloqueo y búsqueda por identificación para detectar a un bloqueado con otro teléfono.
ALTER TABLE client ADD COLUMN blocked_reason text;
CREATE INDEX client_id_document_ix ON client (upper(id_document)) WHERE id_document IS NOT NULL;
CREATE INDEX client_license_ix ON client (upper(license_number)) WHERE license_number IS NOT NULL;
