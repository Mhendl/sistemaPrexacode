ALTER TABLE "usuarios" ADD COLUMN "sesion_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "sesiones_pisadas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ultima_sesion_pisada" uuid;