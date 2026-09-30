CREATE TABLE "cajas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"apertura_efectivo" numeric(14, 2) NOT NULL,
	"abierta_por" text NOT NULL,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"esperado_efectivo" numeric(14, 2),
	"contado_efectivo" numeric(14, 2),
	"diferencia" numeric(14, 2),
	"cerrada_por" text,
	"cerrada_en" timestamp with time zone,
	"notas" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargos_paciente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"prestacion_id" uuid NOT NULL,
	"pieza" integer,
	"caras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fecha" text NOT NULL,
	"profesional" text NOT NULL,
	"usuario_id" uuid,
	"obra_social_id" uuid,
	"obra_social" text,
	"plan" text,
	"numero_afiliado" text,
	"importe_paciente" numeric(14, 2) NOT NULL,
	"importe_obra_social" numeric(14, 2) DEFAULT 0 NOT NULL,
	"odontograma_id" uuid,
	"presupuesto_item_id" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" text,
	"motivo_anulacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"categoria" text NOT NULL,
	"descripcion" text NOT NULL,
	"proveedor" text,
	"importe" numeric(14, 2) NOT NULL,
	"medio" text NOT NULL,
	"comprobante" text,
	"usuario_id" uuid,
	"cargado_por" text NOT NULL,
	"anulado_en" timestamp with time zone,
	"anulado_por" text,
	"motivo_anulacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingresos_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"medio" text NOT NULL,
	"usuario_id" uuid,
	"cargado_por" text NOT NULL,
	"anulado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_paciente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"medio" text NOT NULL,
	"referencia" text,
	"notas" text,
	"usuario_id" uuid,
	"cobrado_por" text NOT NULL,
	"anulado_en" timestamp with time zone,
	"anulado_por" text,
	"motivo_anulacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prestacion_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"prestacion_id" uuid NOT NULL,
	"obra_social_id" uuid,
	"precio_paciente" numeric(14, 2) DEFAULT 0 NOT NULL,
	"precio_obra_social" numeric(14, 2) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuesto_dental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" uuid NOT NULL,
	"prestacion_id" uuid NOT NULL,
	"pieza" integer,
	"caras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"odontograma_id" uuid,
	"importe_paciente" numeric(14, 2) NOT NULL,
	"importe_obra_social" numeric(14, 2) DEFAULT 0 NOT NULL,
	"descuento" numeric(5, 2) DEFAULT 0 NOT NULL,
	"cargo_id" uuid,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuestos_dentales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" text NOT NULL,
	"valido_hasta" text NOT NULL,
	"obra_social_id" uuid,
	"obra_social" text,
	"profesional" text NOT NULL,
	"usuario_id" uuid,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"observaciones" text,
	"total" numeric(14, 2) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_prestacion_id_prestaciones_id_fk" FOREIGN KEY ("prestacion_id") REFERENCES "public"."prestaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_odontograma_id_odontograma_id_fk" FOREIGN KEY ("odontograma_id") REFERENCES "public"."odontograma"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_paciente" ADD CONSTRAINT "cargos_paciente_presupuesto_item_id_presupuesto_dental_items_id_fk" FOREIGN KEY ("presupuesto_item_id") REFERENCES "public"."presupuesto_dental_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos_caja" ADD CONSTRAINT "ingresos_caja_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos_caja" ADD CONSTRAINT "ingresos_caja_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_paciente" ADD CONSTRAINT "pagos_paciente_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_paciente" ADD CONSTRAINT "pagos_paciente_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_paciente" ADD CONSTRAINT "pagos_paciente_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacion_precios" ADD CONSTRAINT "prestacion_precios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacion_precios" ADD CONSTRAINT "prestacion_precios_prestacion_id_prestaciones_id_fk" FOREIGN KEY ("prestacion_id") REFERENCES "public"."prestaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacion_precios" ADD CONSTRAINT "prestacion_precios_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_dental_items" ADD CONSTRAINT "presupuesto_dental_items_presupuesto_id_presupuestos_dentales_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos_dentales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_dental_items" ADD CONSTRAINT "presupuesto_dental_items_prestacion_id_prestaciones_id_fk" FOREIGN KEY ("prestacion_id") REFERENCES "public"."prestaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_dental_items" ADD CONSTRAINT "presupuesto_dental_items_odontograma_id_odontograma_id_fk" FOREIGN KEY ("odontograma_id") REFERENCES "public"."odontograma"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_dentales" ADD CONSTRAINT "presupuestos_dentales_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_dentales" ADD CONSTRAINT "presupuestos_dentales_paciente_id_pacientes_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_dentales" ADD CONSTRAINT "presupuestos_dentales_obra_social_id_obras_sociales_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obras_sociales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_dentales" ADD CONSTRAINT "presupuestos_dentales_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cajas_empresa_fecha_uq" ON "cajas" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "cargos_paciente_paciente_idx" ON "cargos_paciente" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "cargos_paciente_empresa_fecha_idx" ON "cargos_paciente" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "cargos_paciente_odontograma_uq" ON "cargos_paciente" USING btree ("odontograma_id") WHERE "cargos_paciente"."odontograma_id" is not null and "cargos_paciente"."anulado_en" is null;--> statement-breakpoint
CREATE INDEX "gastos_empresa_fecha_idx" ON "gastos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "ingresos_caja_empresa_fecha_idx" ON "ingresos_caja" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_paciente_numero_uq" ON "pagos_paciente" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "pagos_paciente_paciente_idx" ON "pagos_paciente" USING btree ("paciente_id");--> statement-breakpoint
CREATE INDEX "pagos_paciente_empresa_fecha_idx" ON "pagos_paciente" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "prestacion_precios_particular_uq" ON "prestacion_precios" USING btree ("prestacion_id") WHERE "prestacion_precios"."obra_social_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "prestacion_precios_obra_uq" ON "prestacion_precios" USING btree ("prestacion_id","obra_social_id") WHERE "prestacion_precios"."obra_social_id" is not null;--> statement-breakpoint
CREATE INDEX "presupuesto_dental_items_presupuesto_idx" ON "presupuesto_dental_items" USING btree ("presupuesto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_dentales_numero_uq" ON "presupuestos_dentales" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "presupuestos_dentales_paciente_idx" ON "presupuestos_dentales" USING btree ("paciente_id");