ALTER TABLE "config_agenda" ADD COLUMN "recordatorio_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "recordatorio_horas" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "aviso_al_agendar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "codigo_referido" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "referida_por" uuid;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "referido_recompensado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "confirmacion_token" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "recordatorio_enviado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "avisado_whatsapp_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "respuesta_paciente_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pagos_paciente" ADD COLUMN "comprobante_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos_paciente" ADD CONSTRAINT "pagos_paciente_comprobante_id_comprobantes_id_fk" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobantes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_codigo_referido_unique" UNIQUE("codigo_referido");--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_confirmacion_token_unique" UNIQUE("confirmacion_token");