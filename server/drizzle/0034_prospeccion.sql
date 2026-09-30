CREATE TABLE "prospeccion_campanas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"producto" text NOT NULL,
	"pasos" jsonb NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospeccion_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"remitente_email" text,
	"remitente_nombre" text,
	"usuario" text,
	"password_cifrada" text,
	"smtp_host" text DEFAULT 'smtp.hostinger.com' NOT NULL,
	"smtp_puerto" integer DEFAULT 465 NOT NULL,
	"imap_host" text DEFAULT 'imap.hostinger.com' NOT NULL,
	"imap_puerto" integer DEFAULT 993 NOT NULL,
	"max_por_dia" integer DEFAULT 30 NOT NULL,
	"hora_desde" integer DEFAULT 9 NOT NULL,
	"hora_hasta" integer DEFAULT 18 NOT NULL,
	"activa" boolean DEFAULT false NOT NULL,
	"ultimo_error" text,
	"primer_envio_en" timestamp with time zone,
	"imap_revisado_en" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospeccion_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospecto_id" uuid NOT NULL,
	"paso" integer NOT NULL,
	"asunto" text NOT NULL,
	"estado" text NOT NULL,
	"error" text,
	"enviado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospectos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campana_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"empresa" text,
	"rubro" text,
	"ciudad" text,
	"web" text,
	"telefono" text,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"paso" integer DEFAULT 0 NOT NULL,
	"proximo_envio" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio" timestamp with time zone,
	"token" text NOT NULL,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospectos_email_unique" UNIQUE("email"),
	CONSTRAINT "prospectos_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "prospeccion_envios" ADD CONSTRAINT "prospeccion_envios_prospecto_id_prospectos_id_fk" FOREIGN KEY ("prospecto_id") REFERENCES "public"."prospectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospectos" ADD CONSTRAINT "prospectos_campana_id_prospeccion_campanas_id_fk" FOREIGN KEY ("campana_id") REFERENCES "public"."prospeccion_campanas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospeccion_envios_fecha_idx" ON "prospeccion_envios" USING btree ("enviado_en");--> statement-breakpoint
CREATE INDEX "prospectos_estado_idx" ON "prospectos" USING btree ("estado","proximo_envio");--> statement-breakpoint
CREATE INDEX "prospectos_campana_idx" ON "prospectos" USING btree ("campana_id");