CREATE TABLE "prospeccion_busquedas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campana_id" uuid NOT NULL,
	"consultas" jsonb NOT NULL,
	"estado" text DEFAULT 'En curso' NOT NULL,
	"pedidos" integer DEFAULT 0 NOT NULL,
	"lugares" integer DEFAULT 0 NOT NULL,
	"con_web" integer DEFAULT 0 NOT NULL,
	"con_email" integer DEFAULT 0 NOT NULL,
	"nuevos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prospeccion_busquedas" ADD CONSTRAINT "prospeccion_busquedas_campana_id_prospeccion_campanas_id_fk" FOREIGN KEY ("campana_id") REFERENCES "public"."prospeccion_campanas"("id") ON DELETE cascade ON UPDATE no action;