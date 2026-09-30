CREATE TABLE "agenda_bloqueos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"recurso_id" uuid,
	"desde" text NOT NULL,
	"hasta" text NOT NULL,
	"hora_desde" text,
	"hora_hasta" text,
	"motivo" text NOT NULL,
	"creado_por" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honorarios_config" (
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"porcentaje" numeric(5, 2) NOT NULL,
	"descontar_laboratorio" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "honorarios_config_empresa_id_usuario_id_pk" PRIMARY KEY("empresa_id","usuario_id")
);
--> statement-breakpoint
ALTER TABLE "agenda_recursos" ADD COLUMN "horarios" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_recursos" ADD COLUMN "duracion_turno" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "honorarios_usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "honorarios_mes" text;--> statement-breakpoint
ALTER TABLE "agenda_bloqueos" ADD CONSTRAINT "agenda_bloqueos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_bloqueos" ADD CONSTRAINT "agenda_bloqueos_recurso_id_agenda_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."agenda_recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honorarios_config" ADD CONSTRAINT "honorarios_config_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honorarios_config" ADD CONSTRAINT "honorarios_config_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_bloqueos_empresa_idx" ON "agenda_bloqueos" USING btree ("empresa_id","desde");--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_honorarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("honorarios_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;