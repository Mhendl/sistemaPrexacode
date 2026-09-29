CREATE TABLE "imputaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recibo_id" uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"importe" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recibo_medios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recibo_id" uuid NOT NULL,
	"medio" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"referencia" text
);
--> statement-breakpoint
CREATE TABLE "recibos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"observaciones" text,
	"estado" text DEFAULT 'Emitido' NOT NULL,
	"motivo_anulacion" text,
	"anulado_en" timestamp with time zone,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imputaciones" ADD CONSTRAINT "imputaciones_recibo_id_recibos_id_fk" FOREIGN KEY ("recibo_id") REFERENCES "public"."recibos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones" ADD CONSTRAINT "imputaciones_comprobante_id_comprobantes_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo_medios" ADD CONSTRAINT "recibo_medios_recibo_id_recibos_id_fk" FOREIGN KEY ("recibo_id") REFERENCES "public"."recibos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imputaciones_comprobante_idx" ON "imputaciones" USING btree ("comprobante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recibos_empresa_numero_uq" ON "recibos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "recibos_cliente_idx" ON "recibos" USING btree ("cliente_id");