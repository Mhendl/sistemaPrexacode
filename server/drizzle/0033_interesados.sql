CREATE TABLE "interesados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"empresa" text,
	"cargo" text,
	"tamano" text,
	"mensaje" text,
	"origen" text,
	"estado" text DEFAULT 'Nuevo' NOT NULL,
	"nota" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "interesados_estado_idx" ON "interesados" USING btree ("estado","created_at");