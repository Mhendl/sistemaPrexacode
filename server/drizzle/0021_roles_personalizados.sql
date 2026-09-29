CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"es_admin" boolean DEFAULT false NOT NULL,
	"prearmado" text,
	"permisos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "rol_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_empresa_nombre_uq" ON "roles" USING btree ("empresa_id","nombre");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "roles" ("empresa_id", "nombre", "descripcion", "es_admin", "prearmado", "permisos") SELECT "id", 'Administrador', 'Acceso completo, incluidos usuarios, roles, plan y pagos', true, 'admin', '["clientes.ver", "clientes.editar", "oportunidades.ver", "oportunidades.editar", "agenda.ver", "agenda.editar", "presupuestos.ver", "presupuestos.editar", "facturacion.ver", "facturacion.emitir", "cobranzas.ver", "cobranzas.cobrar", "cobranzas.anular", "remitos.ver", "remitos.emitir", "remitos.anular", "productos.ver", "productos.editar", "stock.movimientos", "reportes.ver", "importar.clientes", "importar.productos", "empleados.ver", "empleados.editar", "configuracion"]'::jsonb FROM "empresas";
--> statement-breakpoint
INSERT INTO "roles" ("empresa_id", "nombre", "descripcion", "es_admin", "prearmado", "permisos") SELECT "id", 'Ventas', 'Clientes, oportunidades, agenda, presupuestos, facturación, cobranzas y reportes', false, 'ventas', '["clientes.ver", "clientes.editar", "oportunidades.ver", "oportunidades.editar", "agenda.ver", "agenda.editar", "presupuestos.ver", "presupuestos.editar", "facturacion.ver", "facturacion.emitir", "cobranzas.ver", "cobranzas.cobrar", "remitos.ver", "remitos.emitir", "productos.ver", "reportes.ver", "importar.clientes"]'::jsonb FROM "empresas";
--> statement-breakpoint
INSERT INTO "roles" ("empresa_id", "nombre", "descripcion", "es_admin", "prearmado", "permisos") SELECT "id", 'Operaciones', 'Agenda, productos, stock, movimientos y remitos', false, 'operaciones', '["agenda.ver", "agenda.editar", "remitos.ver", "remitos.emitir", "remitos.anular", "productos.ver", "productos.editar", "stock.movimientos", "importar.productos"]'::jsonb FROM "empresas";
--> statement-breakpoint
UPDATE "usuarios" u SET "rol_id" = r."id" FROM "roles" r WHERE r."empresa_id" = u."empresa_id" AND r."prearmado" = u."rol";
