CREATE TABLE "consentimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"plantilla_id" uuid,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"profesional" text NOT NULL,
	"usuario_id" uuid,
	"firmante" text NOT NULL,
	"firmante_dni" text,
	"vinculo" text NOT NULL,
	"firma_paciente" text NOT NULL,
	"firma_profesional" text,
	"ip" text,
	"user_agent" text,
	"firmado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocado_en" timestamp with time zone,
	"revocado_por" text,
	"motivo_revocacion" text
);
--> statement-breakpoint
CREATE TABLE "laboratorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"email" text,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periodontogramas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"profesional" text NOT NULL,
	"usuario_id" uuid,
	"notas" text,
	"piezas" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_consentimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trabajos_laboratorio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"laboratorio_id" uuid NOT NULL,
	"paciente_id" uuid,
	"descripcion" text NOT NULL,
	"pieza" integer,
	"fecha_envio" text NOT NULL,
	"fecha_prevista" text,
	"fecha_recibido" text,
	"estado" text DEFAULT 'Enviado' NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"profesional" text NOT NULL,
	"usuario_id" uuid,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "laboratorio_id" uuid;--> statement-breakpoint
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_plantilla_id_plantillas_consentimiento_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_consentimiento"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laboratorios" ADD CONSTRAINT "laboratorios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodontogramas" ADD CONSTRAINT "periodontogramas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodontogramas" ADD CONSTRAINT "periodontogramas_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodontogramas" ADD CONSTRAINT "periodontogramas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_consentimiento" ADD CONSTRAINT "plantillas_consentimiento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_laboratorio" ADD CONSTRAINT "trabajos_laboratorio_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_laboratorio" ADD CONSTRAINT "trabajos_laboratorio_laboratorio_id_laboratorios_id_fk" FOREIGN KEY ("laboratorio_id") REFERENCES "public"."laboratorios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_laboratorio" ADD CONSTRAINT "trabajos_laboratorio_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_laboratorio" ADD CONSTRAINT "trabajos_laboratorio_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consentimientos_paciente_idx" ON "consentimientos" USING btree ("paciente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "laboratorios_empresa_nombre_uq" ON "laboratorios" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE INDEX "periodontogramas_paciente_idx" ON "periodontogramas" USING btree ("paciente_id","fecha");--> statement-breakpoint
CREATE INDEX "trabajos_laboratorio_lab_idx" ON "trabajos_laboratorio" USING btree ("laboratorio_id");--> statement-breakpoint
CREATE INDEX "trabajos_laboratorio_paciente_idx" ON "trabajos_laboratorio" USING btree ("paciente_id");--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_laboratorio_id_laboratorios_id_fk" FOREIGN KEY ("laboratorio_id") REFERENCES "public"."laboratorios"("id") ON DELETE set null ON UPDATE no action;