CREATE TABLE "numeradores" (
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "numeradores_empresa_id_tipo_pk" PRIMARY KEY("empresa_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "remito_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remito_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text NOT NULL,
	"unidad" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"punto_venta" integer DEFAULT 1 NOT NULL,
	"numero" integer NOT NULL,
	"cliente_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"domicilio_entrega" text,
	"observaciones" text,
	"estado" text DEFAULT 'Emitido' NOT NULL,
	"motivo_anulacion" text,
	"anulado_en" timestamp with time zone,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "numeradores" ADD CONSTRAINT "numeradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remito_items" ADD CONSTRAINT "remito_items_remito_id_remitos_id_fk" FOREIGN KEY ("remito_id") REFERENCES "public"."remitos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remito_items" ADD CONSTRAINT "remito_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "remitos_empresa_numero_uq" ON "remitos" USING btree ("empresa_id","punto_venta","numero");--> statement-breakpoint
CREATE INDEX "remitos_cliente_idx" ON "remitos" USING btree ("cliente_id");