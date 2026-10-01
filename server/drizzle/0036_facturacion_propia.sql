CREATE TABLE "plataforma_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"emisor_empresa_id" uuid,
	"facturar_suscripciones" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "comprobante_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "factura_numero" text;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "factura_error" text;--> statement-breakpoint
ALTER TABLE "plataforma_config" ADD CONSTRAINT "plataforma_config_emisor_empresa_id_empresas_id_fk" FOREIGN KEY ("emisor_empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;