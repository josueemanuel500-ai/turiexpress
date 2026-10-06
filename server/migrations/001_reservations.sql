CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE reservation_status AS ENUM ('new','quoted','hold','deposit_pending','confirmed','assigned','in_service','completed','cancelled','no_show');
CREATE TYPE service_type AS ENUM ('rental','airport_transfer','private_transfer','tour','other');

CREATE TABLE staff_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','operator','dispatcher','driver')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  plate text UNIQUE,
  capacity smallint NOT NULL CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE driver (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE reservation_folio_seq START 1001;
CREATE TABLE reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text UNIQUE NOT NULL DEFAULT ('TE-' || nextval('reservation_folio_seq')),
  status reservation_status NOT NULL DEFAULT 'new',
  service service_type NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  pickup text NOT NULL,
  destination text,
  passengers smallint NOT NULL CHECK (passengers BETWEEN 1 AND 60),
  client_name text NOT NULL,
  client_phone text NOT NULL,
  client_email text,
  flight_number text,
  notes text,
  quote_cents integer CHECK (quote_cents >= 0),
  deposit_cents integer NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
  vehicle_id uuid REFERENCES vehicle(id),
  driver_id uuid REFERENCES driver(id),
  created_by uuid REFERENCES staff_user(id),
  updated_by uuid REFERENCES staff_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX reservation_schedule_ix ON reservation (starts_at, ends_at, status);
CREATE INDEX reservation_client_phone_ix ON reservation (client_phone);
ALTER TABLE reservation ADD CONSTRAINT reservation_vehicle_no_overlap EXCLUDE USING gist
  (vehicle_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (vehicle_id IS NOT NULL AND status IN ('hold','deposit_pending','confirmed','assigned','in_service'));
CREATE TABLE reservation_event (
  id bigserial PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES staff_user(id),
  event text NOT NULL,
  detail jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO vehicle (code, name, capacity) VALUES ('URVAN-01','Nissan Urvan 1',14),('URVAN-02','Nissan Urvan 2',14),('URVAN-03','Nissan Urvan 3',14);
