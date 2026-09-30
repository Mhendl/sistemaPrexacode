import type { EmpresaApi } from "@/api/types";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { brand } from "@/config/brand";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { formatDni } from "@/modules/pacientes/PacientesPage";
import type { PresupuestoDentalApi, ReciboApi } from "./api";

export const numeroDoc = (n: number) => String(n).padStart(8, "0");

function Membrete({ empresa, titulo, numero, fecha, extra }: { empresa: EmpresaApi; titulo: string; numero: string; fecha: string; extra?: React.ReactNode }) {
  const logo = urlLogo(empresa);
  return (
    <div className="grid grid-cols-[1.4fr_1fr] border-b border-neutral-300">
      <div className="flex gap-4 border-r border-neutral-300 p-5">
        {logo && <img src={logo} alt="" className="size-16 shrink-0 object-contain" />}
        <div>
          <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            {empresa.nombreFantasia && <div>{empresa.razonSocial}</div>}
            {(empresa.domicilio || empresa.localidad) && <div>{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>}
            {empresa.telefono && <div>Tel.: {empresa.telefono}</div>}
            <div>CUIT: {formatCuit(empresa.cuit)}</div>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="text-lg font-bold">{titulo}</div>
        <div className="mt-1 space-y-0.5 text-neutral-600">
          <div>
            <b className="text-neutral-800">N°:</b> {numero}
          </div>
          <div>
            <b className="text-neutral-800">Fecha:</b> {formatDate(fecha)}
          </div>
          {extra}
        </div>
      </div>
    </div>
  );
}

const Pie = ({ texto }: { texto: string }) => (
  <div className="border-t border-neutral-300 px-5 py-2 text-[10px] text-neutral-500">
    {texto} · Generado con {brand.nombre}
  </div>
);

/** Recibo interno de pago de un paciente (no es factura) */
export function ReciboPacienteHoja({ r, empresa }: { r: ReciboApi; empresa: EmpresaApi }) {
  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      {r.anuladoEn && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-8 py-2 text-7xl font-black tracking-widest text-red-500/40">ANULADO</span>
        </div>
      )}
      <Membrete empresa={empresa} titulo="RECIBO" numero={numeroDoc(r.numero)} fecha={r.fecha} />
      <div className="border-b border-neutral-300 py-1 text-center text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">Documento no válido como factura</div>
      <div className="space-y-3 px-5 py-5 text-[13px]">
        <p>
          Recibimos de <b>{`${r.paciente.apellido}, ${r.paciente.nombre}`}</b>
          {r.paciente.dni && ` (DNI ${formatDni(r.paciente.dni)})`} la suma de <b data-testid="recibo-paciente-total">{formatMoney(r.importe)}</b> en concepto de pago de prestaciones odontológicas.
        </p>
        <div className="grid grid-cols-2 gap-2 text-neutral-700">
          <div>
            <b>Medio de pago:</b> {r.medio}
            {r.referencia && ` (${r.referencia})`}
          </div>
          <div>
            <b>Cobertura:</b> {r.paciente.obraSocial ?? "Particular"}
          </div>
          {r.notas && (
            <div className="col-span-2">
              <b>Observaciones:</b> {r.notas}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-10 px-5 pt-10 pb-6 text-center text-[11px] text-neutral-600">
        <div className="border-t border-neutral-400 pt-1">Firma y aclaración</div>
        <div className="border-t border-neutral-400 pt-1">Recibió: {r.cobradoPor}</div>
      </div>
      <Pie texto="Recibo interno de pago" />
    </div>
  );
}

/** Presupuesto odontológico, para entregar o enviar al paciente */
export function PresupuestoDentalHoja({ p, empresa }: { p: PresupuestoDentalApi; empresa: EmpresaApi }) {
  return (
    <div className="hoja w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      <Membrete
        empresa={empresa}
        titulo="PRESUPUESTO"
        numero={numeroDoc(p.numero)}
        fecha={p.fecha}
        extra={
          <div>
            <b className="text-neutral-800">Válido hasta:</b> {formatDate(p.validoHasta)}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-2 border-b border-neutral-300 px-5 py-3">
        <div>
          <b>Paciente:</b> {p.paciente}
          {p.dni && ` · DNI ${formatDni(p.dni)}`}
        </div>
        <div>
          <b>Cobertura:</b> {p.obraSocial ?? "Particular"}
        </div>
        <div>
          <b>Profesional:</b> {p.profesional}
        </div>
      </div>
      <table className="w-full text-left">
        <thead className="bg-neutral-100 text-[11px] text-neutral-600 uppercase">
          <tr>
            <th className="px-5 py-2 font-semibold">Código</th>
            <th className="py-2 font-semibold">Prestación</th>
            <th className="py-2 font-semibold">Pieza</th>
            <th className="py-2 text-right font-semibold">Bonif.</th>
            <th className="px-5 py-2 text-right font-semibold">A cargo del paciente</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((i) => (
            <tr key={i.id} className="border-b border-neutral-200">
              <td className="px-5 py-1.5 tabular-nums">{i.codigo}</td>
              <td className="py-1.5">{i.prestacion}</td>
              <td className="py-1.5">{i.pieza ? `${i.pieza}${i.caras.length ? ` (${i.caras.join(", ")})` : ""}` : "—"}</td>
              <td className="py-1.5 text-right">{i.descuento ? `${i.descuento} %` : ""}</td>
              <td className="px-5 py-1.5 text-right tabular-nums">{formatMoney(i.importePaciente)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end px-5 py-4 text-[15px]">
        <span className="mr-6 font-semibold">Total a cargo del paciente</span>
        <b className="tabular-nums" data-testid="presupuesto-dental-total">
          {formatMoney(p.total)}
        </b>
      </div>
      {p.observaciones && <div className="border-t border-neutral-300 px-5 py-3 whitespace-pre-wrap">{p.observaciones}</div>}
      <div className="px-5 pb-4 text-[10px] text-neutral-500">
        Los importes pueden cambiar si durante el tratamiento surge la necesidad de otras prestaciones. {p.obraSocial ? `La parte que cubre ${p.obraSocial} se liquida directamente con la obra social.` : ""}
      </div>
      <Pie texto="Presupuesto odontológico" />
    </div>
  );
}
