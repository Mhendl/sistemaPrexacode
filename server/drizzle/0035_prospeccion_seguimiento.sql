ALTER TABLE "prospectos" ADD COLUMN "visito_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospectos" ADD COLUMN "visitas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospectos" ADD COLUMN "registrado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospectos" ADD COLUMN "empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "prospectos" ADD CONSTRAINT "prospectos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;