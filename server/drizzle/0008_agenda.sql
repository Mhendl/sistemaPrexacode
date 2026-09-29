CREATE TABLE "agenda_recursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL,
	"usuario_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_agenda" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"nombre_evento" text DEFAULT 'Visita' NOT NULL,
	"nombre_recurso" text DEFAULT 'Responsable' NOT NULL,
	"hora_inicio" integer DEFAULT 480 NOT NULL,
	"hora_fin" integer DEFAULT 1140 NOT NULL,
	"tipos_evento" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"tipo" text,
	"recurso_id" uuid NOT NULL,
	"cliente_id" uuid,
	"fecha" text NOT NULL,
	"inicio" text NOT NULL,
	"fin" text NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"lugar" text,
	"notas" text,
	"version" integer DEFAULT 1 NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_recursos" ADD CONSTRAINT "agenda_recursos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_recursos" ADD CONSTRAINT "agenda_recursos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD CONSTRAINT "config_agenda_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_recurso_id_agenda_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."agenda_recursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_recursos_empresa_idx" ON "agenda_recursos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "eventos_empresa_fecha_idx" ON "eventos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "eventos_recurso_fecha_idx" ON "eventos" USING btree ("recurso_id","fecha");--> statement-breakpoint
CREATE INDEX "eventos_cliente_idx" ON "eventos" USING btree ("cliente_id");