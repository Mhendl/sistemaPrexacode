ALTER TABLE "prospeccion_config" ADD COLUMN "producto" text DEFAULT 'gestion' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospeccion_envios" ADD COLUMN "casilla_id" integer DEFAULT 1 NOT NULL;