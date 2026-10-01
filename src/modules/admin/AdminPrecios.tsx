import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { apiAdmin } from "./api";
import { fechaHora } from "./comun";

interface Transferencia {
  titular: string;
  cuit: string | null;
  banco: string | null;
  cbu: string | null;
  alias: string | null;
}
interface CobrosApi {
  planes: { id: "basico" | "profesional" | "empresa"; nombre: string; precioUsd: number; usuarios: number }[];
  usuarioAdicionalUsd: number;
  mesesCobradosAnual: number;
  transferencia: Transferencia | null;
  transferencias: { id: string; referencia: string; empresa: string; producto: string; periodo: string; plan: string; importeArs: number; importeUsd: number; estado: string; proveedorPagoId: string | null; createdAt: string; aprobadoAt: string | null }[];
}

const mensaje = (e: unknown) => (e instanceof ApiError ? (Object.values(e.details)[0] ?? e.message) : "No se pudo");
const NOMBRES: Record<string, string> = { basico: "Básico · Consultorio", profesional: "Profesional · Clínica", empresa: "Empresa · Centro odontológico" };

/** Los precios de los planes (los dos productos) y los pagos por transferencia */
export function AdminPrecios() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin", "cobros"], queryFn: () => apiAdmin<CobrosApi>("/plataforma/cobros") });
  return (
    <>
      <PageHeader title="Precios y cobros" description="Los precios de Prexacode y CoreDental, y los pagos que te hacen por transferencia." />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && (
          <div className="grid gap-6">
            <Transferencias d={data} />
            <Precios d={data} />
            <DatosTransferencia d={data} />
          </div>
        )}
      </QueryState>
    </>
  );
}

function Precios({ d }: { d: CobrosApi }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setV({ ...Object.fromEntries(d.planes.map((p) => [p.id, String(p.precioUsd)])), adicional: String(d.usuarioAdicionalUsd), meses: String(d.mesesCobradosAnual) });
  }, [d]);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await apiAdmin<CobrosApi>("/plataforma/cobros/precios", {
        method: "PUT",
        body: { planes: { basico: aNumero(v.basico ?? ""), profesional: aNumero(v.profesional ?? ""), empresa: aNumero(v.empresa ?? "") }, usuarioAdicionalUsd: aNumero(v.adicional ?? ""), mesesCobradosAnual: Number(v.meses) },
      });
      qc.setQueryData(["admin", "cobros"], r);
      toast.success("Precios actualizados", { description: "Rigen para los próximos pagos. Las landings ya muestran los nuevos." });
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };
  const campo = (k: string, label: string, sufijo: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pc-${k}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={`pc-${k}`} inputMode="decimal" className="w-28" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        <span className="text-sm text-muted-foreground">{sufijo}</span>
      </div>
    </div>
  );
  const meses = Number(v.meses) || d.mesesCobradosAnual;
  return (
    <Card className="gap-4 p-4 shadow-none" data-testid="precios-planes">
      <div className="flex items-center gap-2">
        <Tags className="size-4 text-primary" />
        <h3 className="font-semibold">Precios de los planes</h3>
      </div>
      <p className="text-sm text-muted-foreground">Son los mismos para Prexacode y CoreDental. Rigen para los próximos pagos: lo que ya pagó cada cliente no cambia. Las landings y la pantalla de Plan de los clientes se actualizan solas.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {d.planes.map((p) => (
          <div key={p.id}>{campo(p.id, `${NOMBRES[p.id] ?? p.nombre} (${p.usuarios} usuarios)`, "USD / mes")}</div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {campo("adicional", "Cada usuario adicional", "USD / mes")}
        {campo("meses", "Pagando el año se cobran", `meses (${Math.max(0, 12 - meses)} gratis)`)}
      </div>
      <div>
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="size-4 animate-spin" />} Guardar precios
        </Button>
      </div>
    </Card>
  );
}

function DatosTransferencia({ d }: { d: CobrosApi }) {
  const qc = useQueryClient();
  const vacio = { titular: "", cuit: "", banco: "", cbu: "", alias: "" };
  const [v, setV] = useState(vacio);
  useEffect(() => {
    const t = d.transferencia;
    setV(t ? { titular: t.titular, cuit: t.cuit ?? "", banco: t.banco ?? "", cbu: t.cbu ?? "", alias: t.alias ?? "" } : vacio);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async (body: object | null, ok: string) => {
    try {
      const r = await apiAdmin<CobrosApi>("/plataforma/cobros/transferencia", { method: "PUT", body });
      qc.setQueryData(["admin", "cobros"], r);
      toast.success(ok);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const campo = (k: keyof typeof v, label: string, placeholder = "") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`tr-${k}`}>{label}</Label>
      <Input id={`tr-${k}`} value={v[k]} placeholder={placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <Card className="gap-4 p-4 shadow-none" data-testid="datos-transferencia">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Banknote className="size-4 text-primary" />
          <h3 className="font-semibold">Cobrar por transferencia</h3>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", d.transferencia ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>{d.transferencia ? "Los clientes la ven" : "Apagada"}</span>
      </div>
      <p className="text-sm text-muted-foreground">Con estos datos, en la pantalla de Plan de cada cliente aparece "Pagar por transferencia": ve el importe en pesos, transfiere y te avisa. Vos lo confirmás arriba cuando ves la plata.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("titular", "Titular de la cuenta")}
        {campo("cuit", "CUIT", "24-35324876-2")}
        {campo("banco", "Banco o billetera", "Ej.: Banco Galicia, Mercado Pago")}
        {campo("cbu", "CBU o CVU (22 números)")}
        {campo("alias", "Alias", "Ej.: prexacode.pagos")}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => guardar({ ...v, cuit: v.cuit || null, banco: v.banco || null, cbu: v.cbu || null, alias: v.alias || null }, "Datos para transferir guardados")}>Guardar y mostrar a los clientes</Button>
        {d.transferencia && (
          <Button variant="outline" onClick={() => guardar(null, "Pago por transferencia apagado")}>
            Apagar
          </Button>
        )}
      </div>
    </Card>
  );
}

function Transferencias({ d }: { d: CobrosApi }) {
  const qc = useQueryClient();
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const pendientes = d.transferencias.filter((t) => t.estado === "Pendiente");
  const resueltas = d.transferencias.filter((t) => t.estado !== "Pendiente").slice(0, 10);
  const accion = async (id: string, que: "confirmar" | "rechazar") => {
    let body: object = {};
    if (que === "rechazar") {
      const motivo = window.prompt("¿Por qué la rechazás? (ej.: no llegó la plata, el importe no coincide)");
      if (!motivo) return;
      body = { motivo };
    }
    setHaciendo(id);
    try {
      const r = await apiAdmin<CobrosApi>(`/plataforma/cobros/transferencias/${id}/${que}`, { method: "POST", body });
      qc.setQueryData(["admin", "cobros"], r);
      toast.success(que === "confirmar" ? "Pago confirmado: se le extendió la suscripción (y se factura sola si está activa)" : "Transferencia rechazada");
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setHaciendo(null);
    }
  };
  return (
    <Card className="gap-0 p-0 shadow-none" data-testid="transferencias">
      <div className="border-b p-4">
        <h3 className="font-semibold">Transferencias para confirmar {pendientes.length > 0 && <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-ink">{pendientes.length}</span>}</h3>
        <p className="text-sm text-muted-foreground">Cuando veas la plata en tu cuenta, confirmala: se le extiende la suscripción al cliente.</p>
      </div>
      {pendientes.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No hay transferencias esperando.</p>
      ) : (
        <div className="divide-y">
          {pendientes.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-testid="transferencia-pendiente">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.empresa}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.producto === "dental" ? "CoreDental" : "Prexacode"} · {t.periodo === "anual" ? "12 meses" : "1 mes"} · avisó {fechaHora(t.createdAt)}
                  {t.proveedorPagoId && ` · comprobante: ${t.proveedorPagoId}`}
                </span>
              </span>
              <span className="tabular font-semibold">{formatMoney(t.importeArs)}</span>
              <Button size="sm" onClick={() => accion(t.id, "confirmar")} disabled={!!haciendo} aria-label={`Confirmar la transferencia de ${t.empresa}`}>
                {haciendo === t.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Llegó, confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => accion(t.id, "rechazar")} disabled={!!haciendo} aria-label={`Rechazar la transferencia de ${t.empresa}`}>
                <X className="size-4" /> Rechazar
              </Button>
            </div>
          ))}
        </div>
      )}
      {resueltas.length > 0 && (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Últimas: {resueltas.map((t) => `${t.empresa} ${formatMoney(t.importeArs)} (${t.estado === "Aprobado" ? "confirmada" : "rechazada"})`).join(" · ")}
        </div>
      )}
    </Card>
  );
}
