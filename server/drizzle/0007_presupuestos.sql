CREATE TABLE "presupuesto_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" uuid NOT NULL,
	"producto_id" uuid,
	"codigo" text,
	"descripcion" text NOT NULL,
	"unidad" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"precio_unitario" numeric(14, 2) NOT NULL,
	"bonificacion" numeric(5, 2) DEFAULT 0 NOT NULL,
	"alicuota_iva" numeric(4, 1) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" text NOT NULL,
	"valido_hasta" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"letra" text NOT NULL,
	"neto" numeric(14, 2) NOT NULL,
	"exento" numeric(14, 2) NOT NULL,
	"total_iva" numeric(14, 2) NOT NULL,
	"iva" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"condiciones" text,
	"observaciones" text,
	"comprobante_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_comprobante_id_comprobantes_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_empresa_numero_uq" ON "presupuestos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "presupuestos_cliente_idx" ON "presupuestos" USING btree ("cliente_id");