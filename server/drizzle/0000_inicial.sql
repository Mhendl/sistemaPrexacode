CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"razon_social" text NOT NULL,
	"cuit" text NOT NULL,
	"condicion_iva" text NOT NULL,
	"contacto" text,
	"email" text,
	"telefono" text,
	"domicilio" text,
	"localidad" text,
	"rubro" text,
	"notas" text,
	"estado" text DEFAULT 'Activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"cuit" text NOT NULL,
	"condicion_iva" text NOT NULL,
	"domicilio" text,
	"localidad" text,
	"email" text,
	"telefono" text,
	"plan" text DEFAULT 'profesional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cuit_unique" UNIQUE("cuit")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" text NOT NULL,
	"estado" text DEFAULT 'Activo' NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_cuit_uq" ON "clientes" USING btree ("empresa_id","cuit");--> statement-breakpoint
CREATE INDEX "clientes_empresa_idx" ON "clientes" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE INDEX "usuarios_empresa_idx" ON "usuarios" USING btree ("empresa_id");