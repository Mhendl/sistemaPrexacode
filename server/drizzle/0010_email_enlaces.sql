CREATE TABLE "config_email" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"modo" text DEFAULT 'plataforma' NOT NULL,
	"host" text,
	"puerto" integer,
	"seguridad" text,
	"usuario" text,
	"password_cifrada" text,
	"remitente_nombre" text,
	"responder_a" text,
	"verificado" boolean DEFAULT false NOT NULL,
	"ultimo_error" text,
	"enviar_factura_al_emitir" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"para" text NOT NULL,
	"asunto" text NOT NULL,
	"estado" text NOT NULL,
	"error" text,
	"tipo" text NOT NULL,
	"ref_id" uuid,
	"automatico" boolean DEFAULT false NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enlaces_publicos" (
	"token" text PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"vistas" integer DEFAULT 0 NOT NULL,
	"ultima_vista" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config_email" ADD CONSTRAINT "config_email_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_enviados" ADD CONSTRAINT "emails_enviados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_enviados" ADD CONSTRAINT "emails_enviados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enlaces_publicos" ADD CONSTRAINT "enlaces_publicos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_empresa_fecha_idx" ON "emails_enviados" USING btree ("empresa_id","created_at");--> statement-breakpoint
CREATE INDEX "emails_ref_idx" ON "emails_enviados" USING btree ("ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enlaces_ref_uq" ON "enlaces_publicos" USING btree ("empresa_id","tipo","ref_id");