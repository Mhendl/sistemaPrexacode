CREATE TABLE "evoluciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"texto" text NOT NULL,
	"usuario_id" uuid,
	"autor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obras_sociales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odontograma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"prestacion_id" uuid NOT NULL,
	"pieza" integer NOT NULL,
	"caras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text NOT NULL,
	"fecha" text NOT NULL,
	"notas" text,
	"usuario_id" uuid,
	"autor" text NOT NULL,
	"realizado_en" text,
	"realizado_por" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" text,
	"motivo_anulacion" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paciente_archivo_datos" (
	"archivo_id" uuid PRIMARY KEY NOT NULL,
	"datos" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paciente_archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text,
	"nombre_archivo" text NOT NULL,
	"mime" text NOT NULL,
	"tamano" integer NOT NULL,
	"fecha" text NOT NULL,
	"usuario_id" uuid,
	"autor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"dni" text,
	"fecha_nacimiento" text,
	"sexo" text,
	"telefono" text,
	"email" text,
	"domicilio" text,
	"localidad" text,
	"obra_social_id" uuid,
	"plan" text,
	"numero_afiliado" text,
	"alergias" text,
	"medicacion" text,
	"antecedentes" text,
	"intervenciones" text,
	"notas" text,
	"datos_pendientes" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'Activo' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prestaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"alcance" text NOT NULL,
	"simbolo" text DEFAULT 'relleno' NOT NULL,
	"etiqueta" text,
	"activa" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "paciente_id" uuid;--> statement-breakpoint
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras_sociales" ADD CONSTRAINT "obras_sociales_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontograma" ADD CONSTRAINT "odontograma_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontograma" ADD CONSTRAINT "odontograma_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontograma" ADD CONSTRAINT "odontograma_prestacion_id_prestaciones_id_fk" FOREIGN KEY ("prestacion_id") REFERENCES "public"."prestaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odontograma" ADD CONSTRAINT "odontograma_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paciente_archivo_datos" ADD CONSTRAINT "paciente_archivo_datos_archivo_id_paciente_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."paciente_archivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paciente_archivos" ADD CONSTRAINT "paciente_archivos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paciente_archivos" ADD CONSTRAINT "paciente_archivos_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paciente_archivos" ADD CONSTRAINT "paciente_archivos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestaciones" ADD CONSTRAINT "prestaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evoluciones_paciente_idx" ON "evoluciones" USING btree ("paciente_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "obras_sociales_empresa_nombre_uq" ON "obras_sociales" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE INDEX "odontograma_paciente_idx" ON "odontograma" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "paciente_archivos_paciente_idx" ON "paciente_archivos" USING btree ("paciente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pacientes_empresa_dni_uq" ON "pacientes" USING btree ("empresa_id","dni") WHERE "pacientes"."dni" is not null;--> statement-breakpoint
CREATE INDEX "pacientes_empresa_apellido_idx" ON "pacientes" USING btree ("empresa_id","apellido");--> statement-breakpoint
CREATE UNIQUE INDEX "prestaciones_empresa_codigo_uq" ON "prestaciones" USING btree ("empresa_id","codigo");--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE set null ON UPDATE no action;