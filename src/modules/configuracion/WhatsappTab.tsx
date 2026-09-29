import { CheckCircle2, Clock, MessageCircle } from "lucide-react";
import { Section } from "./parts";

/**
 * WhatsApp en dos niveles:
 * 1. Ya funciona, sin configurar nada: "Enviar por WhatsApp" abre el chat del cliente con el mensaje y el link.
 * 2. Envíos automáticos (sin que nadie toque un botón): requieren la API oficial de Meta; quedan para más adelante.
 */
export function WhatsappTab() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Enviar por WhatsApp" description="Ya está funcionando, sin configurar nada." action={<CheckCircle2 className="size-5 text-success" />}>
        <div className="grid gap-4 text-sm">
          <p>
            En cada factura y presupuesto, el botón <b>Enviar → Enviar por WhatsApp</b> abre WhatsApp (en la compu o en el celular) con el chat del cliente y este mensaje ya escrito:
          </p>
          <div className="rounded-lg bg-[#e7ffdb] p-3 text-[13px] leading-relaxed text-neutral-800 shadow-sm dark:bg-[#1f3a2a] dark:text-neutral-100" data-testid="ejemplo-whatsapp">
            Hola Julia,
            <br />
            Te enviamos la Factura A 0001-00000123 por $ 24.200,00.
            <br />
            Vence el 30/10/2026.
            <br />
            Ver factura: https://…/ver/…
          </div>
          <p>Vos lo revisás y tocás enviar. El cliente abre el link, ve el documento y lo puede guardar en PDF.</p>
          <div className="flex items-start gap-2 rounded-lg border p-3 text-muted-foreground">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Para que se abra directo el chat, cargá el <b className="text-foreground">teléfono del cliente con característica</b> (por ejemplo, <span className="tabular">11 5555-1234</span> o <span className="tabular">0351 15 555-0101</span>). Si no, WhatsApp te deja elegir el contacto.
            </span>
          </div>
        </div>
      </Section>

      <Section title="Envíos automáticos" description="Que salgan solos, sin que nadie toque un botón." action={<Clock className="size-5 text-muted-foreground" />}>
        <div className="grid gap-3 text-sm">
          <p>Por ejemplo: la factura apenas se emite, el recordatorio de un turno el día anterior o el aviso de una factura vencida.</p>
          <p className="text-muted-foreground">
            Para eso WhatsApp exige usar su API oficial (WhatsApp Business Platform de Meta): una cuenta de Meta Business verificada, un número dedicado y mensajes modelo aprobados por Meta. Cada mensaje tiene un costo que cobra Meta.
          </p>
          <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">
            <b className="text-foreground">Próximamente.</b> Mientras tanto, los envíos automáticos por <b className="text-foreground">email</b> ya funcionan (Configuración → Email).
          </p>
        </div>
      </Section>
    </div>
  );
}
