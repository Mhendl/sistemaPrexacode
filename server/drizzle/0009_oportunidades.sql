CREATE TABLE "oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"cliente_id" uuid,
	"prospecto" text,
	"contacto" text,
	"etapa" text DEFAULT 'Nuevo' NOT NULL,
	"monto" numeric(14, 2) DEFAULT 0 NOT NULL,
	"responsable_id" uuid,
	"cierre_estimado" text,
	"fecha_cierre" text,
	"motivo_perdida" text,
	"presupuesto_id" uuid,
	"notas" text,
	"version" integer DEFAULT 1 NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidades_empresa_etapa_idx" ON "oportunidades" USING btree ("empresa_id","etapa");--> statement-breakpoint
CREATE INDEX "oportunidades_cliente_idx" ON "oportunidades" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "oportunidades_presupuesto_idx" ON "oportunidades" USING btree ("presupuesto_id");