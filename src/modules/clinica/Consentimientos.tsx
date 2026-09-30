import { useState } from "react";
import { FileSignature, Loader2, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDni } from "@/modules/pacientes/PacientesPage";
import { useAccionClinica, useConsentimiento, useConsentimientos, usePlantillas, usePrevia, VINCULOS } from "./api";
import { FirmaPad } from "./FirmaPad";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

/** Firmar un consentimiento en pantalla */
function NuevoConsentimiento({ pacienteId, open, onOpenChange }: { pacienteId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: plantillas = [] } = usePlantillas(open);
  const [plantillaId, setPlantillaId] = useState("");
  const previa = usePrevia(pacienteId, plantillaId);
  const [vinculo, setVinculo] = useState<(typeof VINCULOS)[number]>("Paciente");
  const [firmante, setFirmante] = useState("");
  const [firmanteDni, setFirmanteDni] = useState("");
  const [firmaPaciente, setFirmaPaciente] = useState<string | null>(null);
  const [firmaProfesional, setFirmaProfesional] = useState<string | null>(null);
  const accion = useAccionClinica();

  const guardar = async () => {
    try {
      await accion.mutateAsync({
        url: `/pacientes/${pacienteId}/consentimientos`,
        body: { plantillaId, vinculo, firmante: vinculo === "Paciente" ? null : firmante, firmanteDni: vinculo === "Paciente" ? null : firmanteDni, firmaPaciente, firmaProfesional },
      });
      toast.success("Consentimiento firmado y guardado");
      onOpenChange(false);
      setPlantillaId("");
      setFirmaPaciente(null);
      setFirmaProfesional(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Firmar consentimiento</DialogTitle>
          <DialogDescription>El paciente lee el texto y firma en la pantalla. Queda guardado tal cual, con la fecha y la hora.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="con-plantilla">Consentimiento</Label>
            <Select value={plantillaId} onValueChange={setPlantillaId}>
              <SelectTrigger id="con-plantilla" className="w-full">
                <SelectValue placeholder="Elegí cuál" />
              </SelectTrigger>
              <SelectContent>
                {plantillas
                  .filter((p) => p.activa)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titulo}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {previa.data && (
            <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap" data-testid="texto-consentimiento">
              {previa.data.texto}
            </div>
          )}
          {plantillaId && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="con-vinculo">Firma</Label>
                  <Select value={vinculo} onValueChange={(v) => setVinculo(v as typeof vinculo)}>
                    <SelectTrigger id="con-vinculo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VINCULOS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v === "Paciente" ? "El paciente" : v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {vinculo !== "Paciente" && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="con-firmante">Nombre de quien firma</Label>
                      <Input id="con-firmante" value={firmante} onChange={(e) => setFirmante(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="con-dni">Su DNI</Label>
                      <Input id="con-dni" inputMode="numeric" value={firmanteDni} onChange={(e) => setFirmanteDni(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <FirmaPad etiqueta={vinculo === "Paciente" ? "Firma del paciente" : "Firma de quien autoriza"} onChange={setFirmaPaciente} />
              <FirmaPad etiqueta="Firma del profesional (opcional)" onChange={setFirmaProfesional} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!plantillaId || !firmaPaciente || (vinculo !== "Paciente" && !firmante.trim()) || accion.isPending}>
            {accion.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar firmado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Consentimiento firmado, como se imprime */
function VerConsentimiento({ pacienteId, id, onClose }: { pacienteId: string; id: string | null; onClose: () => void }) {
  const { empresa, puede } = useRole();
  const { data: c } = useConsentimiento(pacienteId, id);
  const accion = useAccionClinica();
  const [revocando, setRevocando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const logo = urlLogo(empresa);

  const revocar = async () => {
    try {
      await accion.mutateAsync({ url: `/pacientes/${pacienteId}/consentimientos/${id}/revocar`, body: { motivo } });
      toast.success("Consentimiento revocado. Queda registrado.");
      setRevocando(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo revocar");
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="print:hidden">
          <DialogTitle>{c?.titulo ?? "Consentimiento"}</DialogTitle>
          <DialogDescription>{c ? `Firmado el ${fechaHora(c.firmadoEn)} por ${c.firmante}` : ""}</DialogDescription>
        </DialogHeader>
        {c && (
          <div className="zona-impresion relative rounded-lg border bg-white p-6 text-[13px] leading-relaxed text-neutral-900" data-testid="consentimiento-firmado">
            {c.revocadoEn && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-6 py-2 text-5xl font-black tracking-widest text-red-500/40">REVOCADO</span>
              </div>
            )}
            <div className="mb-4 flex items-center gap-3 border-b pb-3">
              {logo && <img src={logo} alt="" className="size-12 object-contain" />}
              <div>
                <div className="font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
                <div className="text-xs text-neutral-500">{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>
              </div>
            </div>
            <h2 className="mb-3 text-base font-bold">{c.titulo}</h2>
            <p className="whitespace-pre-wrap">{c.texto}</p>
            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                {c.firmaPaciente && <img src={c.firmaPaciente} alt="Firma" className="mx-auto h-20 object-contain" />}
                <div className="border-t pt-1">
                  {c.firmante}
                  {c.firmanteDni && ` · DNI ${formatDni(c.firmanteDni)}`}
                  <div className="text-neutral-500">{c.vinculo}</div>
                </div>
              </div>
              <div>
                {c.firmaProfesional ? <img src={c.firmaProfesional} alt="Firma del profesional" className="mx-auto h-20 object-contain" /> : <div className="h-20" />}
                <div className="border-t pt-1">
                  {c.profesional}
                  <div className="text-neutral-500">Profesional</div>
                </div>
              </div>
            </div>
            <div className="mt-6 text-[10px] text-neutral-500">
              Firmado en pantalla el {fechaHora(c.firmadoEn)}
              {c.ip && ` · IP ${c.ip}`}
              {c.revocadoEn && ` · Revocado el ${fechaHora(c.revocadoEn)} por ${c.revocadoPor}: ${c.motivoRevocacion}`}
            </div>
          </div>
        )}
        {revocando && (
          <div className="grid gap-2 print:hidden">
            <Label htmlFor="con-motivo">Motivo de la revocación</Label>
            <Input id="con-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </div>
        )}
        <DialogFooter className="print:hidden">
          {c && !c.revocadoEn && puede("historia.editar") && (
            revocando ? (
              <Button variant="destructive" onClick={revocar} disabled={motivo.trim().length < 3 || accion.isPending}>
                Confirmar revocación
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setRevocando(true)}>
                <Undo2 className="size-4" /> El paciente lo revoca
              </Button>
            )
          )}
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Consentimientos({ pacienteId }: { pacienteId: string }) {
  const { puede } = useRole();
  const lista = useConsentimientos(pacienteId);
  const [nuevo, setNuevo] = useState(false);
  const [viendo, setViendo] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      {puede("historia.editar") && (
        <div className="flex justify-end">
          <Button onClick={() => setNuevo(true)}>
            <FileSignature className="size-4" /> Firmar consentimiento
          </Button>
        </div>
      )}
      <QueryState isLoading={lista.isLoading} error={lista.error} onRetry={lista.refetch}>
        {lista.data?.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no firmó ningún consentimiento.</Card>
        ) : (
          <ul className="grid gap-2">
            {lista.data?.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setViendo(c.id)} className={cn("flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:border-primary", c.revocadoEn && "opacity-60")} data-testid="consentimiento">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.titulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(c.firmadoEn.slice(0, 10))} · firmó {c.firmante}
                      {c.vinculo !== "Paciente" && ` (${c.vinculo.toLowerCase()})`} · {c.profesional}
                    </span>
                  </span>
                  {c.revocadoEn ? <span className="text-xs font-semibold text-destructive">Revocado</span> : <span className="text-xs font-semibold text-success">Firmado</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <NuevoConsentimiento pacienteId={pacienteId} open={nuevo} onOpenChange={setNuevo} />
      <VerConsentimiento pacienteId={pacienteId} id={viendo} onClose={() => setViendo(null)} />
    </div>
  );
}
