CREATE TABLE "solicitudes_legales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"codigo" text NOT NULL,
	"empresa_id" uuid,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"cuit" text,
	"motivo" text,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"nota" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_en" timestamp with time zone,
	CONSTRAINT "solicitudes_legales_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "suspendida_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "motivo_suspension" text;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "baja_solicitada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "baja_codigo" text;--> statement-breakpoint
ALTER TABLE "solicitudes_legales" ADD CONSTRAINT "solicitudes_legales_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solicitudes_legales_estado_idx" ON "solicitudes_legales" USING btree ("estado","created_at");