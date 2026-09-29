CREATE TABLE "avisos_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recuperaciones_clave" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recuperaciones_clave_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "config_email" ADD COLUMN "recordar_facturas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "avisos_enviados" ADD CONSTRAINT "avisos_enviados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recuperaciones_clave" ADD CONSTRAINT "recuperaciones_clave_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avisos_enviados_uq" ON "avisos_enviados" USING btree ("empresa_id","clave");--> statement-breakpoint
CREATE INDEX "recuperaciones_usuario_idx" ON "recuperaciones_clave" USING btree ("usuario_id");