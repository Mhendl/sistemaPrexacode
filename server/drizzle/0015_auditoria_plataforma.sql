CREATE TABLE "auditoria_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"empresa_id" uuid,
	"accion" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_plataforma_empresa_idx" ON "auditoria_plataforma" USING btree ("empresa_id","created_at");