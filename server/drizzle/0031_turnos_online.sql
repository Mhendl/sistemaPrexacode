ALTER TABLE "agenda_recursos" ADD COLUMN "reserva_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "reserva_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "reserva_codigo" text;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "reserva_anticipacion_horas" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "reserva_dias_max" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD COLUMN "reserva_mensaje" text;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "reservado_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_agenda" ADD CONSTRAINT "config_agenda_reserva_codigo_unique" UNIQUE("reserva_codigo");