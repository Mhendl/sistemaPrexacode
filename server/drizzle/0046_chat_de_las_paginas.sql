CREATE TABLE "chat_conversaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto" text NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"nombre" text,
	"origen" text,
	"ip" text,
	"pendiente" boolean DEFAULT false NOT NULL,
	"avisado_en" timestamp with time zone,
	"ultimo_mensaje_en" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversaciones_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "chat_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"n" bigserial NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"de" text NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_mensajes" ADD CONSTRAINT "chat_mensajes_conversacion_id_chat_conversaciones_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."chat_conversaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversaciones_pendiente_idx" ON "chat_conversaciones" USING btree ("pendiente","ultimo_mensaje_en");--> statement-breakpoint
CREATE INDEX "chat_mensajes_conversacion_idx" ON "chat_mensajes" USING btree ("conversacion_id","created_at");