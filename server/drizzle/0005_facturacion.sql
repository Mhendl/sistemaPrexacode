CREATE TABLE "comprobante_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comprobante_id" uuid NOT NULL,
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
CREATE TABLE "comprobantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_cbte" integer NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer,
	"fecha" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"receptor" jsonb NOT NULL,
	"concepto" integer NOT NULL,
	"fecha_servicio_desde" text,
	"fecha_servicio_hasta" text,
	"vencimiento" text NOT NULL,
	"condicion_venta" text NOT NULL,
	"neto" numeric(14, 2) NOT NULL,
	"exento" numeric(14, 2) NOT NULL,
	"total_iva" numeric(14, 2) NOT NULL,
	"iva" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"estado" text NOT NULL,
	"cae" text,
	"cae_vencimiento" text,
	"errores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modo" text NOT NULL,
	"observaciones" text,
	"asociado_id" uuid,
	"desconto_stock" boolean DEFAULT false NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_arca" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"modo" text DEFAULT 'simulado' NOT NULL,
	"certificado" text,
	"clave_privada_cifrada" text,
	"certificado_vence" timestamp with time zone,
	"token" text,
	"sign" text,
	"token_vence" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puntos_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comprobante_items" ADD CONSTRAINT "comprobante_items_comprobante_id_comprobantes_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_items" ADD CONSTRAINT "comprobante_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_arca" ADD CONSTRAINT "config_arca_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntos_venta" ADD CONSTRAINT "puntos_venta_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_numero_uq" ON "comprobantes" USING btree ("empresa_id","tipo_cbte","punto_venta","numero");--> statement-breakpoint
CREATE INDEX "comprobantes_empresa_fecha_idx" ON "comprobantes" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "comprobantes_cliente_idx" ON "comprobantes" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "puntos_venta_empresa_numero_uq" ON "puntos_venta" USING btree ("empresa_id","numero");