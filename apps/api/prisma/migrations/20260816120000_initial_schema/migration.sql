-- Migración inicial.
--
-- Parte del SQL que genera `prisma migrate diff` y añade a mano lo que el esquema de
-- Prisma no sabe expresar: particionado declarativo, índices parciales, BRIN y el
-- trigger que alimenta el outbox.

CREATE SCHEMA IF NOT EXISTS "public";

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

CREATE TYPE "country" AS ENUM ('ES', 'PT', 'IT', 'MX', 'CO', 'BR');

CREATE TYPE "user_role" AS ENUM ('ADMIN', 'RISK_ANALYST', 'COUNTRY_OPERATOR', 'AUDITOR');

CREATE TYPE "application_status" AS ENUM (
    'DRAFT', 'SUBMITTED', 'BANK_DATA_PENDING', 'BANK_DATA_RECEIVED',
    'BANK_DATA_UNAVAILABLE', 'RISK_EVALUATING', 'AUTO_APPROVED',
    'ADDITIONAL_REVIEW', 'MANUAL_REVIEW', 'COMPLIANCE_REVIEW',
    'APPROVED', 'REJECTED', 'DISBURSED', 'CANCELLED', 'EXPIRED'
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "countries" "country"[] NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "users_email_idx" ON "users" ("email");

-- ---------------------------------------------------------------------------
-- credit_applications: particionada por LIST (country)
--
-- Las consultas operativas siempre llevan país —el scoping por país del §4.2 lo
-- impone antes incluso que el rendimiento—, así que la poda funciona en todas.
-- Particionar obliga a que la PK contenga la clave de partición: de ahí (id, country).
-- ---------------------------------------------------------------------------

CREATE TABLE "credit_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" "country" NOT NULL,
    "document_encrypted" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "document_type" VARCHAR(20) NOT NULL,
    "applicant_name_encrypted" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "requested_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_income_minor" BIGINT NOT NULL,
    "employment_months" INTEGER NOT NULL,
    "status" "application_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "risk_score" INTEGER,
    "decision_reasons" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id", "country")
) PARTITION BY LIST ("country");

CREATE TABLE "credit_applications_es" PARTITION OF "credit_applications" FOR VALUES IN ('ES');
CREATE TABLE "credit_applications_pt" PARTITION OF "credit_applications" FOR VALUES IN ('PT');
CREATE TABLE "credit_applications_it" PARTITION OF "credit_applications" FOR VALUES IN ('IT');
CREATE TABLE "credit_applications_mx" PARTITION OF "credit_applications" FOR VALUES IN ('MX');
CREATE TABLE "credit_applications_co" PARTITION OF "credit_applications" FOR VALUES IN ('CO');
CREATE TABLE "credit_applications_br" PARTITION OF "credit_applications" FOR VALUES IN ('BR');

CREATE INDEX "credit_applications_country_status_created_at_idx"
    ON "credit_applications" ("country", "status", "created_at" DESC);

CREATE INDEX "credit_applications_country_document_hash_idx"
    ON "credit_applications" ("country", "document_hash");

-- Paginación keyset: (created_at, id) ordena de forma total y estable.
CREATE INDEX "credit_applications_created_at_id_idx"
    ON "credit_applications" ("created_at" DESC, "id");

-- Índice parcial sobre los expedientes vivos. Alrededor del 95 % de las consultas
-- operativas solo mira estos, y el índice se mantiene pequeño aunque la tabla crezca.
CREATE INDEX "credit_applications_active_idx"
    ON "credit_applications" ("country", "created_at" DESC)
    WHERE "status" NOT IN ('APPROVED', 'REJECTED', 'DISBURSED', 'CANCELLED', 'EXPIRED');

-- Un documento no puede tener dos solicitudes vivas en el mismo país.
--
-- El índice se crea partición a partición: PostgreSQL no admite índices únicos
-- parciales sobre la tabla particionada, pero cada partición es una tabla normal y
-- ahí sí. Como se particiona por país, único-por-partición es exactamente
-- único-por-país, que es la regla que se quiere.
DO $$
DECLARE
    suffix TEXT;
BEGIN
    FOREACH suffix IN ARRAY ARRAY['es', 'pt', 'it', 'mx', 'co', 'br'] LOOP
        EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I ("document_hash") '
            'WHERE "status" NOT IN (''APPROVED'', ''REJECTED'', ''DISBURSED'', ''CANCELLED'', ''EXPIRED'')',
            'credit_applications_' || suffix || '_active_document_key',
            'credit_applications_' || suffix
        );
    END LOOP;
END $$;

ALTER TABLE "credit_applications"
    ADD CONSTRAINT "credit_applications_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- bank_snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE "bank_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "country" "country" NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_encrypted" TEXT NOT NULL,
    "monthly_debt_payments_minor" BIGINT NOT NULL,
    "total_debt_minor" BIGINT NOT NULL,
    "credit_score" INTEGER NOT NULL,
    "delinquencies" INTEGER NOT NULL,
    "active_loans" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_snapshots_application_id_country_idx"
    ON "bank_snapshots" ("application_id", "country");

CREATE INDEX "bank_snapshots_country_fetched_at_idx"
    ON "bank_snapshots" ("country", "fetched_at" DESC);

ALTER TABLE "bank_snapshots"
    ADD CONSTRAINT "bank_snapshots_application_id_country_fkey"
    FOREIGN KEY ("application_id", "country") REFERENCES "credit_applications" ("id", "country")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- application_status_history
-- ---------------------------------------------------------------------------

CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "country" "country" NOT NULL,
    "from_status" "application_status",
    "to_status" "application_status" NOT NULL,
    "reason" TEXT,
    "actor" VARCHAR(120) NOT NULL,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "application_status_history_application_id_country_created_a_idx"
    ON "application_status_history" ("application_id", "country", "created_at");

CREATE INDEX "application_status_history_correlation_id_idx"
    ON "application_status_history" ("correlation_id");

ALTER TABLE "application_status_history"
    ADD CONSTRAINT "application_status_history_application_id_country_fkey"
    FOREIGN KEY ("application_id", "country") REFERENCES "credit_applications" ("id", "country")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- outbox_events: particionada por RANGE (created_at)
--
-- Aquí el eje temporal sí es el natural: es una cola que se recorre por fecha y se
-- purga soltando particiones enteras, sin el bloat ni la presión de vacuum que deja
-- un DELETE masivo.
-- ---------------------------------------------------------------------------

-- Orden de escritura. CURRENT_TIMESTAMP no vale: devuelve el instante en que empezó
-- la transacción, así que los tres eventos que genera una misma solicitud al crearse
-- y cambiar de estado comparten timestamp exacto y quedan sin orden entre sí. La
-- secuencia da un orden total, y clock_timestamp() registra además cuándo ocurrió
-- cada uno de verdad.
CREATE SEQUENCE "outbox_events_sequence" AS BIGINT;

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence" BIGINT NOT NULL DEFAULT nextval('outbox_events_sequence'),
    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "country" "country" NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

-- Crea la partición de un día si no existe. La llama tanto la migración como el job
-- de mantenimiento que va abriendo días por delante.
CREATE OR REPLACE FUNCTION create_outbox_partition(target DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT := 'outbox_events_' || to_char(target, 'YYYYMMDD');
BEGIN
    IF to_regclass(format('public.%I', partition_name)) IS NOT NULL THEN
        RETURN;
    END IF;

    EXECUTE format(
        'CREATE TABLE %I PARTITION OF "outbox_events" FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        target,
        target + 1
    );
END;
$$ LANGUAGE plpgsql;

-- Ventana inicial calculada al aplicar la migración, no fechas fijas que caduquen.
DO $$
DECLARE
    day DATE;
BEGIN
    FOR day IN
        SELECT generate_series(CURRENT_DATE - 1, CURRENT_DATE + 14, '1 day')::DATE
    LOOP
        PERFORM create_outbox_partition(day);
    END LOOP;
END $$;

-- Red de seguridad: sin partición por defecto, un INSERT fuera de todos los rangos
-- falla, y eso tumbaría la escritura de la solicitud que lo provocó.
CREATE TABLE "outbox_events_default" PARTITION OF "outbox_events" DEFAULT;

CREATE INDEX "outbox_events_aggregate_id_idx" ON "outbox_events" ("aggregate_id");

-- El relay reclama pendientes con ORDER BY (created_at, sequence): la fecha poda
-- particiones y la secuencia deshace los empates. El índice parcial deja fuera todo
-- lo ya procesado, que es lo que acaba dominando la tabla.
--
-- La reclamación va en UNA sola sentencia, y no es un capricho:
--
--   UPDATE outbox_events o
--   SET processed_at = now(), attempts = o.attempts + 1
--   FROM (
--     SELECT id, created_at FROM outbox_events
--     WHERE processed_at IS NULL
--     ORDER BY created_at, sequence
--     FOR UPDATE SKIP LOCKED
--     LIMIT $1
--   ) reclamados
--   WHERE o.id = reclamados.id AND o.created_at = reclamados.created_at
--   RETURNING o.*;
--
-- Leer las filas y devolver después su created_at como parámetro no funciona: el
-- Date de JavaScript tiene precisión de milisegundos y aquí se guardan microsegundos,
-- así que el UPDATE no casaría ninguna fila y el relay reclamaría los mismos eventos
-- en bucle. Manteniendo el timestamp dentro de Postgres el problema no existe.
--
-- Sigue dentro de la transacción del relay: se reclama, se encola en BullMQ y se hace
-- COMMIT. Si el encolado falla, el ROLLBACK devuelve los eventos a pendientes; y como
-- el jobId es el id del evento, reintentar nunca duplica trabajo.
CREATE INDEX "outbox_events_pending_idx"
    ON "outbox_events" ("created_at", "sequence")
    WHERE "processed_at" IS NULL;

-- ---------------------------------------------------------------------------
-- processed_webhooks
-- ---------------------------------------------------------------------------

CREATE TABLE "processed_webhooks" (
    "event_id" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "processed_webhooks_received_at_idx" ON "processed_webhooks" ("received_at");

-- ---------------------------------------------------------------------------
-- updated_at
--
-- Prisma rellena updated_at desde el cliente, pero los workers tocan filas con SQL
-- directo (el UPDATE con bloqueo optimista). Ponerlo en un trigger hace que la
-- columna sea cierta venga la escritura de donde venga.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER credit_applications_touch_updated_at
    BEFORE UPDATE ON "credit_applications"
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger del outbox (§3.7)
--
-- Una escritura en credit_applications genera trabajo asíncrono sin que la
-- aplicación tenga que acordarse de encolarlo: la fila del outbox entra en la misma
-- transacción que el cambio, así que o se guardan las dos o ninguna. El pg_notify se
-- entrega al hacer COMMIT, de modo que el relay nunca ve un evento de una
-- transacción que acabó revirtiendo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enqueue_application_event()
RETURNS TRIGGER AS $$
DECLARE
    v_event_type TEXT;
    v_previous "application_status";
    v_event_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_event_type := 'application.created';
        v_previous := NULL;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        v_event_type := 'application.status_changed';
        v_previous := OLD.status;
    ELSE
        -- Un cambio que no toca el estado no genera trabajo.
        RETURN NEW;
    END IF;

    INSERT INTO "outbox_events" (
        "aggregate_type", "aggregate_id", "country", "event_type", "payload", "correlation_id"
    )
    VALUES (
        'credit_application',
        NEW.id,
        NEW.country,
        v_event_type,
        jsonb_build_object(
            'applicationId', NEW.id,
            'country', NEW.country,
            'status', NEW.status,
            'previousStatus', v_previous,
            'version', NEW.version
        ),
        -- La aplicación la fija con SET LOCAL al abrir la transacción. El segundo
        -- argumento en true devuelve NULL en vez de error si nadie la puso.
        NULLIF(current_setting('app.correlation_id', true), '')
    )
    RETURNING "id" INTO v_event_id;

    -- Solo el identificador: pg_notify tiene un límite de 8000 bytes y el relay va a
    -- releer la fila de todas formas.
    PERFORM pg_notify(
        'outbox_new',
        json_build_object('id', v_event_id, 'country', NEW.country)::text
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger va en cada partición: en PostgreSQL los triggers FOR EACH ROW sobre una
-- tabla particionada se propagan a las particiones existentes, pero declararlo en el
-- padre es lo que hace que también lo hereden las que se creen después.
CREATE TRIGGER credit_applications_enqueue_event
    AFTER INSERT OR UPDATE OF "status" ON "credit_applications"
    FOR EACH ROW EXECUTE FUNCTION enqueue_application_event();
