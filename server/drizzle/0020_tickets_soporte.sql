CREATE TABLE "ticket_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"autor" text NOT NULL,
	"nombre" text NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid,
	"asunto" text NOT NULL,
	"categoria" text NOT NULL,
	"estado" text DEFAULT 'Abierto' NOT NULL,
	"pantalla" text,
	"sin_leer_cliente" boolean DEFAULT false NOT NULL,
	"sin_leer_soporte" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "ticket_mensajes" ADD CONSTRAINT "ticket_mensajes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_mensajes_ticket_idx" ON "ticket_mensajes" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_empresa_idx" ON "tickets" USING btree ("empresa_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_estado_idx" ON "tickets" USING btree ("estado");