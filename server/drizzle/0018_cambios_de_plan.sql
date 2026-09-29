ALTER TABLE "pagos_suscripcion" ADD COLUMN "tipo" text DEFAULT 'periodo' NOT NULL;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "plan_proximo" text;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "adicionales_proximos" integer;