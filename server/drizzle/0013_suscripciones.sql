CREATE TABLE "pagos_suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"referencia" text NOT NULL,
	"plan" text NOT NULL,
	"periodo" text NOT NULL,
	"usuarios_adicionales" integer NOT NULL,
	"importe_usd" numeric(10, 2) NOT NULL,
	"tipo_cambio" numeric(10, 2) NOT NULL,
	"importe_ars" numeric(14, 2) NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"proveedor" text NOT NULL,
	"proveedor_pago_id" text,
	"url_pago" text,
	"desde" text,
	"hasta" text,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aprobado_at" timestamp with time zone,
	CONSTRAINT "pagos_suscripcion_referencia_unique" UNIQUE("referencia")
);
--> statement-breakpoint
CREATE TABLE "suscripciones" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'profesional' NOT NULL,
	"usuarios_adicionales" integer DEFAULT 0 NOT NULL,
	"periodo" text DEFAULT 'mensual' NOT NULL,
	"prueba_hasta" text NOT NULL,
	"pago_hasta" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_suscripcion_empresa_idx" ON "pagos_suscripcion" USING btree ("empresa_id","created_at");