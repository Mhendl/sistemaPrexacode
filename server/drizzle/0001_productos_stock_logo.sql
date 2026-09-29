CREATE TABLE "empresa_logos" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"datos" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"stock_resultante" numeric(14, 3) NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text NOT NULL,
	"categoria" text,
	"unidad" text DEFAULT 'u.' NOT NULL,
	"precio" numeric(14, 2) NOT NULL,
	"alicuota_iva" numeric(4, 1) NOT NULL,
	"controla_stock" boolean DEFAULT true NOT NULL,
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"stock_minimo" numeric(14, 3) DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "ingresos_brutos" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "inicio_actividades" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "codigo_postal" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "logo_actualizado" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "empresa_logos" ADD CONSTRAINT "empresa_logos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_empresa_idx" ON "movimientos_stock" USING btree ("empresa_id","created_at");--> statement-breakpoint
CREATE INDEX "movimientos_producto_idx" ON "movimientos_stock" USING btree ("producto_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_empresa_codigo_uq" ON "productos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "productos_empresa_idx" ON "productos" USING btree ("empresa_id");