CREATE TABLE "campana_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campana_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"destino" text NOT NULL,
	"texto" text NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"error" text,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campanas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"canal" text NOT NULL,
	"segmento" text NOT NULL,
	"parametro" text,
	"asunto" text,
	"mensaje" text NOT NULL,
	"destinatarios" integer NOT NULL,
	"creado_por" text NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pacientes" ADD COLUMN "recibe_campanas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pacientes" ADD COLUMN "token_campanas" text;--> statement-breakpoint
ALTER TABLE "campana_envios" ADD CONSTRAINT "campana_envios_campana_id_campanas_id_fk" FOREIGN KEY ("campana_id") REFERENCES "public"."campanas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campana_envios" ADD CONSTRAINT "campana_envios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campana_envios" ADD CONSTRAINT "campana_envios_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campana_envios_campana_idx" ON "campana_envios" USING btree ("campana_id");--> statement-breakpoint
CREATE INDEX "campana_envios_empresa_idx" ON "campana_envios" USING btree ("empresa_id","enviado_en");--> statement-breakpoint
CREATE INDEX "campanas_empresa_idx" ON "campanas" USING btree ("empresa_id","created_at");--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_token_campanas_unique" UNIQUE("token_campanas");