-- APPROVED no es un estado final.
--
-- La migración inicial lo contaba entre los terminales al construir los índices
-- parciales, y eso abría dos agujeros:
--
--   1. Un expediente aprobado y pendiente de desembolso se caía del índice de
--      solicitudes vivas, justo cuando más se le sigue la pista.
--   2. Más grave: el índice único de documento excluía APPROVED, así que el mismo
--      titular podía abrir una segunda solicitud mientras la primera seguía aprobada
--      y sin cobrar.
--
-- Aprobar no cierra el expediente; desembolsar sí.
--
-- Cada índice se crea con un nombre nuevo y solo después se suelta el viejo. Importa
-- sobre todo en el único: soltarlo primero dejaría una ventana sin unicidad por la
-- que podría colarse justo el duplicado que esto viene a impedir.
--
-- Sobre una tabla grande esto bloquea la escritura mientras se construyen los
-- índices. La forma de evitarlo es CREATE INDEX CONCURRENTLY, que no puede ejecutarse
-- dentro de una transacción; Prisma 7 envuelve toda migración en una y no ofrece
-- forma de desactivarlo. Con volumen real, el procedimiento es aplicar esta migración
-- con `prisma migrate resolve --applied` y lanzar los índices a mano con
-- CONCURRENTLY desde una sesión suelta. En una instalación nueva la tabla está vacía
-- y el bloqueo es instantáneo.

CREATE INDEX "credit_applications_live_idx"
    ON "credit_applications" ("country", "created_at" DESC)
    WHERE "status" NOT IN ('REJECTED', 'DISBURSED', 'CANCELLED', 'EXPIRED');

DROP INDEX IF EXISTS "credit_applications_active_idx";

DO $$
DECLARE
    suffix TEXT;
BEGIN
    FOREACH suffix IN ARRAY ARRAY['es', 'pt', 'it', 'mx', 'co', 'br'] LOOP
        EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I ("document_hash") '
            'WHERE "status" NOT IN (''REJECTED'', ''DISBURSED'', ''CANCELLED'', ''EXPIRED'')',
            'credit_applications_' || suffix || '_live_document_key',
            'credit_applications_' || suffix
        );

        EXECUTE format(
            'DROP INDEX IF EXISTS %I',
            'credit_applications_' || suffix || '_active_document_key'
        );
    END LOOP;
END $$;
