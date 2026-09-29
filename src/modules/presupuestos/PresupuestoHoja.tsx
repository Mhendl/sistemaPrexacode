import type { EmpresaApi } from "@/api/types";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { brand } from "@/config/brand";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";

export interface HojaPresupuesto {
  numero: number | null;
  fecha: string;
  validoHasta: string;
  letra: "A" | "B" | "C";
  cliente: { razonSocial: string; cuit: string; condicionIva: string; domicilio?: string | null } | null;
  items: { codigo?: string | null; descripcion: string; cantidad: number; unidad: string; precioUnitario: number; bonificacion: number; alicuotaIva: number; subtotal: number }[];
  neto: number;
  exento: number;
  iva: { alicuota: number; importe: number }[];
  totalIva: number;
  total: number;
  condiciones?: string | null;
  observaciones?: string | null;
  estado?: string;
}

export const numeroPresupuesto = (n: number | null) => (n ? String(n).padStart(8, "0") : "—");
const cant = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

/** Presupuesto tal como se imprime o se manda al cliente */
export function PresupuestoHoja({ p, empresa }: { p: HojaPresupuesto; empresa: EmpresaApi }) {
  const logo = urlLogo(empresa);
  const discrimina = p.letra === "A";
  const factor = (a: number) => (discrimina || p.letra === "C" ? 1 : 1 + a / 100);
  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      <div className="flex items-start justify-between gap-6 border-b border-neutral-300 p-6">
        <div className="flex gap-4">
          {logo && <img src={logo} alt="" className="size-16 shrink-0 object-contain" />}
          <div>
            <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
            <div className="mt-1 space-y-0.5 text-neutral-600">
              {empresa.nombreFantasia && <div>{empresa.razonSocial}</div>}
              {(empresa.domicilio || empresa.localidad) && <div>{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>}
              {(empresa.telefono || empresa.email) && <div>{[empresa.telefono, empresa.email].filter(Boolean).join(" · ")}</div>}
              <div>CUIT {formatCuit(empresa.cuit)}</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">PRESUPUESTO</div>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            <div>
              <b className="text-neutral-800">N°:</b> <span data-testid="presupuesto-numero">{numeroPresupuesto(p.numero)}</span>
            </div>
            <div>
              <b className="text-neutral-800">Fecha:</b> {formatDate(p.fecha)}
            </div>
            <div>
              <b className="text-neutral-800">Válido hasta:</b> {formatDate(p.validoHasta)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 border-b border-neutral-300 px-6 py-3">
        <div>
          <b>Cliente:</b> {p.cliente?.razonSocial ?? "—"}
        </div>
        <div>
          <b>CUIT:</b> {p.cliente ? formatCuit(p.cliente.cuit) : "—"}
        </div>
        <div>
          <b>Condición IVA:</b> {p.cliente?.condicionIva ?? "—"}
        </div>
        {p.cliente?.domicilio && (
          <div>
            <b>Domicilio:</b> {p.cliente.domicilio}
          </div>
        )}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-100 text-left">
            <th className="px-6 py-2 font-semibold">Descripción</th>
            <th className="px-2 py-2 text-right font-semibold">Cant.</th>
            <th className="px-2 py-2 text-right font-semibold">P. unitario</th>
            <th className="px-2 py-2 text-right font-semibold">Bonif.</th>
            {discrimina && <th className="px-2 py-2 text-right font-semibold">IVA</th>}
            <th className="px-6 py-2 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((i, idx) => (
            <tr key={idx} className="border-b border-neutral-200">
              <td className="px-6 py-1.5">{i.descripcion}</td>
              <td className="tabular px-2 py-1.5 text-right whitespace-nowrap">
                {cant(i.cantidad)} {i.unidad}
              </td>
              <td className="tabular px-2 py-1.5 text-right whitespace-nowrap">{formatMoney(i.precioUnitario * factor(i.alicuotaIva))}</td>
              <td className="tabular px-2 py-1.5 text-right">{i.bonificacion ? `${cant(i.bonificacion)} %` : "—"}</td>
              {discrimina && <td className="tabular px-2 py-1.5 text-right">{i.alicuotaIva.toLocaleString("es-AR")} %</td>}
              <td className="tabular px-6 py-1.5 text-right whitespace-nowrap">{formatMoney(i.subtotal * factor(i.alicuotaIva))}</td>
            </tr>
          ))}
          {p.items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-neutral-400">
                Agregá ítems para ver la vista previa
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex justify-end border-b border-neutral-300 px-6 py-3">
        <dl className="tabular grid w-72 grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
          {discrimina && (
            <>
              <dt className="text-neutral-600">Subtotal neto</dt>
              <dd className="text-right whitespace-nowrap">{formatMoney(p.neto)}</dd>
              {p.iva.map((i) => (
                <FilaTotal key={i.alicuota} label={`IVA ${i.alicuota.toLocaleString("es-AR")} %`} valor={i.importe} />
              ))}
              {p.exento > 0 && <FilaTotal label="Exento" valor={p.exento} />}
            </>
          )}
          <dt className="mt-1 border-t border-neutral-300 pt-1 text-sm font-bold">Total{discrimina ? "" : " (IVA incluido)"}</dt>
          <dd className="mt-1 border-t border-neutral-300 pt-1 text-right text-sm font-bold whitespace-nowrap" data-testid="presupuesto-total">
            {formatMoney(p.total)}
          </dd>
        </dl>
      </div>

      {(p.condiciones || p.observaciones) && (
        <div className="space-y-2 border-b border-neutral-300 px-6 py-3">
          {p.condiciones && (
            <div>
              <b>Condiciones:</b> <span className="whitespace-pre-line">{p.condiciones}</span>
            </div>
          )}
          {p.observaciones && (
            <div>
              <b>Observaciones:</b> <span className="whitespace-pre-line">{p.observaciones}</span>
            </div>
          )}
        </div>
      )}
      <div className="px-6 py-3 text-[11px] text-neutral-500">Precios válidos hasta el {formatDate(p.validoHasta)}. Este presupuesto no es una factura.</div>
      <div className="border-t border-neutral-200 px-6 py-1.5 text-center text-[9px] text-neutral-400">
        Generado con {brand.nombre} · {brand.web}
      </div>
    </div>
  );
}

function FilaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <>
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right whitespace-nowrap">{formatMoney(valor)}</dd>
    </>
  );
}
