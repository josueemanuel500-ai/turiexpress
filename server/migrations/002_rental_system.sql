-- 002: sistema de renta completo.
-- Clientes con historial, tarifas configurables, pagos (anticipo/saldo),
-- gastos por unidad, suscripciones push y bloqueo de cuenta por intentos fallidos.

-- Ajustes editables desde el panel (tarifas, datos del negocio).
CREATE TABLE IF NOT EXISTS setting (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO setting (key, value) VALUES
  ('pricing', '{"daily_cents": 180000, "weekly_cents": 1050000, "deposit_cents": 300000}'),
  ('business', '{"name": "Turi Express MX", "phone": "529995095005", "city": "Mérida, Yucatán", "legal_name": "", "address": ""}')
ON CONFLICT (key) DO NOTHING;

-- Bloqueo temporal tras varios intentos fallidos de login.
ALTER TABLE staff_user ADD COLUMN IF NOT EXISTS failed_logins smallint NOT NULL DEFAULT 0;
ALTER TABLE staff_user ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE staff_user ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
-- Al cambiar contraseña se invalidan las sesiones abiertas.
ALTER TABLE staff_user ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

-- Datos de la unidad útiles para contrato y control.
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS model_year smallint;
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE vehicle ADD COLUMN IF NOT EXISTS odometer_km integer;

-- Clientes: una ficha por teléfono, para no recapturar en rentas repetidas.
CREATE TABLE IF NOT EXISTS client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text UNIQUE NOT NULL,
  email text,
  id_document text,        -- INE / pasaporte (número)
  license_number text,     -- licencia de conducir
  license_expires date,
  address text,
  notes text,
  blocked boolean NOT NULL DEFAULT false,  -- lista negra (no rentar)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_name_ix ON client (lower(full_name));

ALTER TABLE reservation ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES client(id);
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS daily_rate_cents integer CHECK (daily_rate_cents >= 0);
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS weekly_rate_cents integer CHECK (weekly_rate_cents >= 0);
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS guarantee_cents integer NOT NULL DEFAULT 0 CHECK (guarantee_cents >= 0);
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS guarantee_returned boolean NOT NULL DEFAULT false;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS km_out integer;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS km_in integer;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS fuel_out text;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS fuel_in text;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff';
CREATE INDEX IF NOT EXISTS reservation_client_ix ON reservation (client_id);

-- Pagos: cada anticipo/abono/reembolso queda registrado con su fecha,
-- así "cuánto ganamos este mes" se calcula con dinero realmente cobrado.
CREATE TABLE IF NOT EXISTS payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit','payment','refund')),
  method text NOT NULL CHECK (method IN ('cash','transfer','card','other')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid REFERENCES staff_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_reservation_ix ON payment (reservation_id);
CREATE INDEX IF NOT EXISTS payment_paid_at_ix ON payment (paid_at);

-- Gastos por unidad (o generales si vehicle_id es null).
CREATE TABLE IF NOT EXISTS expense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicle(id),
  category text NOT NULL CHECK (category IN ('fuel','maintenance','insurance','repair','cleaning','tolls','taxes','salary','other')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  spent_on date NOT NULL DEFAULT current_date,
  description text,
  created_by uuid REFERENCES staff_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_spent_on_ix ON expense (spent_on);

-- Suscripciones Web Push (PWA iOS / APK Android).
CREATE TABLE IF NOT EXISTS push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff_user(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Evita recordatorios duplicados (un aviso por reserva/tipo/día).
CREATE TABLE IF NOT EXISTS reminder_log (
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_on date NOT NULL,
  PRIMARY KEY (reservation_id, kind, sent_on)
);
