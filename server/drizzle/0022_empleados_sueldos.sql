CREATE TABLE "empleado_novedades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"desde" text NOT NULL,
	"hasta" text NOT NULL,
	"dias" integer NOT NULL,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empleado_pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"tipo" text NOT NULL,
	"periodo" text NOT NULL,
	"fecha" text NOT NULL,
	"conceptos" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"medio" text NOT NULL,
	"nota" text,
	"estado" text DEFAULT 'Emitido' NOT NULL,
	"motivo_anulacion" text,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"cuil" text,
	"puesto" text,
	"fecha_ingreso" text NOT NULL,
	"fecha_egreso" text,
	"motivo_egreso" text,
	"modalidad" text DEFAULT 'Mensual' NOT NULL,
	"sueldo" numeric(14, 2) NOT NULL,
	"telefono" text,
	"email" text,
	"domicilio" text,
	"cbu" text,
	"obra_social" text,
	"notas" text,
	"estado" text DEFAULT 'Activo' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empleado_novedades" ADD CONSTRAINT "empleado_novedades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado_novedades" ADD CONSTRAINT "empleado_novedades_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado_pagos" ADD CONSTRAINT "empleado_pagos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado_pagos" ADD CONSTRAINT "empleado_pagos_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado_pagos" ADD CONSTRAINT "empleado_pagos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "empleado_novedades_empleado_idx" ON "empleado_novedades" USING btree ("empleado_id","desde");--> statement-breakpoint
CREATE INDEX "empleado_pagos_empleado_idx" ON "empleado_pagos" USING btree ("empleado_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "empleado_pagos_numero_uq" ON "empleado_pagos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "empleados_empresa_idx" ON "empleados" USING btree ("empresa_id");