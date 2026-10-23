CREATE TABLE "actividad_usuarios" (
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fecha" text NOT NULL,
	"pedidos" integer DEFAULT 0 NOT NULL,
	"cambios" integer DEFAULT 0 NOT NULL,
	"ultima_vez" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actividad_usuarios_usuario_id_fecha_pk" PRIMARY KEY("usuario_id","fecha")
);
--> statement-breakpoint
ALTER TABLE "actividad_usuarios" ADD CONSTRAINT "actividad_usuarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad_usuarios" ADD CONSTRAINT "actividad_usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividad_empresa_idx" ON "actividad_usuarios" USING btree ("empresa_id","fecha");