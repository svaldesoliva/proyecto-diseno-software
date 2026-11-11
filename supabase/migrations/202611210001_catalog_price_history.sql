BEGIN;

-- Kept outside the schemas exposed by Supabase's Data API. Only the backend connects.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE TABLE app_private.local_users (
  username text PRIMARY KEY, salt text NOT NULL, password_hash text NOT NULL
);
CREATE TABLE app_private.sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL,
  name text NOT NULL, expires_at bigint NOT NULL
);
CREATE INDEX ON app_private.sessions (expires_at);
CREATE TABLE app_private.google_attempts (
  token_hash text PRIMARY KEY, state text NOT NULL, nonce text NOT NULL,
  verifier text NOT NULL, product text, expires_at bigint NOT NULL
);
CREATE TABLE app_private.login_limits (
  address_hash text PRIMARY KEY, attempts integer NOT NULL, expires_at bigint NOT NULL
);

CREATE TABLE app_private.products (
  id text PRIMARY KEY,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE app_private.offers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_key text NOT NULL UNIQUE,
  product_id text NOT NULL REFERENCES app_private.products(id),
  store text NOT NULL CHECK (length(store) > 0),
  url text NOT NULL CHECK (url ~ '^https?://'),
  price_clp bigint NOT NULL CHECK (price_clp > 0 AND price_clp <= 9007199254740991),
  in_stock boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL
);
CREATE INDEX ON app_private.offers(product_id);
CREATE TABLE app_private.price_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id bigint NOT NULL REFERENCES app_private.offers(id),
  price_clp bigint NOT NULL CHECK (price_clp > 0),
  observed_at timestamptz NOT NULL
);
CREATE INDEX ON app_private.price_history(offer_id, id DESC);
CREATE TABLE app_private.catalog_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  observed_at timestamptz NOT NULL
);

CREATE FUNCTION app_private.record_price() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price_clp IS DISTINCT FROM OLD.price_clp THEN
    INSERT INTO app_private.price_history(offer_id, price_clp, observed_at)
    VALUES (NEW.id, NEW.price_clp, NEW.last_seen_at);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_offer_price AFTER INSERT OR UPDATE ON app_private.offers
FOR EACH ROW EXECUTE FUNCTION app_private.record_price();

CREATE FUNCTION app_private.save_catalog(snapshot jsonb, observed timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize writes; a slow, older refresh must never replace a newer snapshot.
  PERFORM pg_advisory_xact_lock(3162026);
  IF EXISTS (SELECT 1 FROM app_private.catalog_state WHERE observed_at >= observed) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(snapshot) <> 'array' OR jsonb_array_length(snapshot) = 0 THEN
    RAISE EXCEPTION 'Refusing an empty or invalid catalog';
  END IF;

  UPDATE app_private.products SET active = false WHERE active;
  UPDATE app_private.offers SET active = false WHERE active;
  INSERT INTO app_private.products(id, data, active)
  SELECT item->>'id', item - 'offers', true FROM jsonb_array_elements(snapshot) AS item
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, active = true;

  INSERT INTO app_private.offers
    (offer_key, product_id, store, url, price_clp, in_stock, active, last_seen_at)
  SELECT offer->>'key', item->>'id', offer->>'store', offer->>'url',
    (offer->>'priceClp')::bigint, (offer->>'inStock')::boolean, true, observed
  FROM jsonb_array_elements(snapshot) AS item,
    LATERAL jsonb_array_elements(item->'offers') AS offer
  ON CONFLICT (offer_key) DO UPDATE SET
    product_id = EXCLUDED.product_id, store = EXCLUDED.store, url = EXCLUDED.url,
    price_clp = EXCLUDED.price_clp, in_stock = EXCLUDED.in_stock,
    active = true, last_seen_at = EXCLUDED.last_seen_at;

  INSERT INTO app_private.catalog_state(id, observed_at) VALUES (true, observed)
  ON CONFLICT (id) DO UPDATE SET observed_at = EXCLUDED.observed_at;
  RETURN true;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
ALTER TABLE app_private.local_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.google_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.login_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.catalog_state ENABLE ROW LEVEL SECURITY;
COMMIT;
