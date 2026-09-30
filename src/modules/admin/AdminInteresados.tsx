import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiAdmin, useAccionAdmin } from "./api";
import { fechaHora } from "./comun";

type Estado = "Nuevo" | "Contactado" | "Cliente" | "Descartado";
interface InteresadoApi {
  id: string;
  producto: "gestion" | "dental";
  nombre: string;
  email: string;
  telefono: string | null;
  empresa: string | null;
  cargo: string | null;
  tamano: string | null;
  mensaje: string | null;
  origen: string | null;
  estado: Estado;
  nota: string | null;
  createdAt: string;
}

const ESTADOS: Estado[] = ["Nuevo", "Contactado", "Cliente", "Descartado"];
const color: Record<Estado, string> = {
  Nuevo: "bg-primary/10 text-primary",
  Contactado: "bg-warning/15 text-warning-ink",
  Cliente: "bg-success/10 text-success",
  Descartado: "bg-muted text-muted-foreground",
};

/** Teléfono argentino → WhatsApp (549 + característica + número) */
function whatsapp(tel: string) {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("54")) d = d.slice(2).replace(/^9/, "");
  d = d.replace(/^0/, "");
  if (d.length === 12) d = d.replace(/^(\d{2,4})15/, "$1");
  return d.length === 10 ? `549${d}` : d;
}

/** Pedidos de demo que llegan desde las landings de Prexacode y CoreDental */
export function AdminInteresados() {
  const { data = [], isLoading, error, refetch } = useQuery({ queryKey: ["admin", "interesados"], queryFn: () => apiAdmin<InteresadoApi[]>("/plataforma/interesados") });
  const [filtro, setFiltro] = useState<Estado | "Todos">("Todos");
  const lista = filtro === "Todos" ? data : data.filter((i) => i.estado === filtro);
  return (
    <>
      <PageHeader title="Interesados" description="Pedidos de demo desde las landings. Respondé en el día: es cuando más chances hay de que se sumen." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["Todos", ...ESTADOS] as const).map((e) => (
          <button key={e} type="button" onClick={() => setFiltro(e)} aria-pressed={filtro === e} className={cn("rounded-full border px-3 py-1 text-xs", filtro === e ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>
            {e} ({e === "Todos" ? data.length : data.filter((i) => i.estado === e).length})
          </button>
        ))}
      </div>
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay interesados{filtro !== "Todos" ? ` en «${filtro}»` : ""}.</p>
        ) : (
          <div className="grid gap-3">
            {lista.map((i) => (
              <Fila key={i.id} i={i} />
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}

function Fila({ i }: { i: InteresadoApi }) {
  const accion = useAccionAdmin();
  const [nota, setNota] = useState(i.nota ?? "");
  const guardar = async (estado: Estado) => {
    try {
      await accion.mutateAsync({ url: `/plataforma/interesados/${i.id}`, metodo: "PUT", body: { estado, nota } });
      toast.success("Guardado");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };
  return (
    <Card className="gap-2 p-4 shadow-none" data-testid="interesado">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{i.nombre}</span>
          {i.empresa && <span className="text-sm text-muted-foreground">· {i.empresa}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", i.producto === "dental" ? "bg-[#e3f5f8] text-[#0e8fae]" : "bg-primary/10 text-primary")}>{i.producto === "dental" ? "CoreDental" : "Prexacode"}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", color[i.estado])}>{i.estado}</span>
        </div>
        <span className="text-xs text-muted-foreground">{fechaHora(i.createdAt)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={`mailto:${i.email}`} className="flex items-center gap-1 text-primary hover:underline">
          <Mail className="size-3.5" /> {i.email}
        </a>
        {i.telefono && (
          <>
            <a href={`tel:${i.telefono}`} className="flex items-center gap-1 hover:underline">
              <Phone className="size-3.5" /> {i.telefono}
            </a>
            <a href={`https://wa.me/${whatsapp(i.telefono)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-success hover:underline">
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
          </>
        )}
      </div>
      {(i.cargo || i.tamano) && <p className="text-xs text-muted-foreground">{[i.cargo, i.tamano && `${i.tamano} ${i.producto === "dental" ? "profesionales" : "personas"}`].filter(Boolean).join(" · ")}</p>}
      {i.mensaje && <p className="text-sm text-muted-foreground italic">"{i.mensaje}"</p>}
      {i.origen && <p className="truncate text-xs text-muted-foreground">Vino de: {i.origen}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota de seguimiento (ej.: demo el jueves 10 hs)" className="h-8 min-w-0 flex-1 text-sm" aria-label={`Nota de ${i.nombre}`} />
        <Select value={i.estado} onValueChange={(v) => guardar(v as Estado)}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Estado de ${i.nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {nota !== (i.nota ?? "") && (
          <Button size="sm" onClick={() => guardar(i.estado)} disabled={accion.isPending}>
            Guardar nota
          </Button>
        )}
      </div>
    </Card>
  );
}
