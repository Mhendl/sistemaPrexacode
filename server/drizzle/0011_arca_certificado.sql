ALTER TABLE "config_arca" ADD COLUMN "csr" text;--> statement-breakpoint
ALTER TABLE "config_arca" ADD COLUMN "clave_pendiente_cifrada" text;--> statement-breakpoint
ALTER TABLE "config_arca" ADD COLUMN "ultima_conexion" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "config_arca" ADD COLUMN "ultimo_error" text;