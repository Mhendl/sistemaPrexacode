ALTER TABLE "pagos_suscripcion" ADD COLUMN "descuento_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plataforma_config" ADD COLUMN "promo" jsonb;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "promo_pct" integer;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "promo_pagos_restantes" integer DEFAULT 0 NOT NULL;