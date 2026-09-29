import type { EmpresaApi, RemitoApi } from "@/api/types";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { brand } from "@/config/brand";
import { formatCuit, formatDate } from "@/lib/format";
import { formatCantidad } from "@/modules/productos/stock";

export const numeroRemito = (r: Pick<RemitoApi, "puntoVenta" | "numero">) => `${String(r.puntoVenta).padStart(4, "0")}-${String(r.numero).padStart(8, "0")}`;

/** Remito tal como se imprime (A4, siempre en claro) */
export function RemitoHoja({ remito: r, empresa }: { remito: RemitoApi; empresa: EmpresaApi }) {
  const logo = urlLogo(empresa);
  const c = r.cliente;
  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      {r.estado === "Anulado" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-8 py-2 text-7xl font-black tracking-widest text-red-500/40">ANULADO</span>
        </div>
      )}

      {/* Encabezado */}
      <div className="relative grid grid-cols-2 border-b border-neutral-300">
        <div className="flex gap-4 border-r border-neutral-300 p-5 pr-10">
          {logo && <img src={logo} alt="" className="size-16 shrink-0 object-contain" />}
          <div>
            <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
            <div className="mt-1 space-y-0.5 text-neutral-600">
              {empresa.nombreFantasia && <div>{empresa.razonSocial}</div>}
              {(empresa.domicilio || empresa.localidad) && <div>{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>}
              {(empresa.telefono || empresa.email) && <div>{[empresa.telefono, empresa.email].filter(Boolean).join(" · ")}</div>}
              <div>
                <b className="text-neutral-800">Condición IVA:</b> {empresa.condicionIva}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 pl-10">
          <div className="text-lg font-bold">REMITO</div>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            <div>
              <b className="text-neutral-800">N°:</b> <span data-testid="remito-numero">{numeroRemito(r)}</span>
            </div>
            <div>
              <b className="text-neutral-800">Fecha:</b> {formatDate(r.fecha)}
            </div>
            <div>
              <b className="text-neutral-800">CUIT:</b> {formatCuit(empresa.cuit)}
              {empresa.ingresosBrutos && (
                <>
                  {" "}
                  · <b className="text-neutral-800">IIBB:</b> {empresa.ingresosBrutos}
                </>
              )}
            </div>
            {empresa.inicioActividades && (
              <div>
                <b className="text-neutral-800">Inicio de actividades:</b> {formatDate(empresa.inicioActividades)}
              </div>
            )}
          </div>
        </div>
        <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center border border-t-0 border-neutral-400 bg-white px-3 pt-1 pb-1.5">
          <span className="text-3xl leading-none font-bold">X</span>
        </div>
      </div>
      <div className="border-b border-neutral-300 py-1 text-center text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">Documento no válido como factura</div>

      {/* Destinatario */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 border-b border-neutral-300 px-5 py-3">
        <div>
          <b>Cliente:</b> {c.razonSocial}
        </div>
        <div>
          <b>CUIT:</b> {formatCuit(c.cuit)}
        </div>
        <div>
          <b>Condición IVA:</b> {c.condicionIva}
        </div>
        <div>
          <b>Teléfono:</b> {c.telefono ?? "—"}
        </div>
        <div className="col-span-2">
          <b>Domicilio de entrega:</b> {r.domicilioEntrega ?? "—"}
        </div>
      </div>

      {/* Ítems */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-100 text-left">
            <th className="w-32 px-5 py-2 font-semibold">Código</th>
            <th className="px-3 py-2 font-semibold">Descripción</th>
            <th className="w-28 px-3 py-2 text-right font-semibold">Cantidad</th>
            <th className="w-20 px-5 py-2 font-semibold">Unidad</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((i) => (
            <tr key={i.id} className="border-b border-neutral-200">
              <td className="px-5 py-1.5 text-neutral-600">{i.codigo}</td>
              <td className="px-3 py-1.5">{i.descripcion}</td>
              <td className="tabular px-3 py-1.5 text-right font-medium">{formatCantidad(i.cantidad)}</td>
              <td className="px-5 py-1.5">{i.unidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {r.observaciones && (
        <div className="border-b border-neutral-300 px-5 py-3">
          <b>Observaciones:</b> <span className="whitespace-pre-line">{r.observaciones}</span>
        </div>
      )}
      {r.estado === "Anulado" && r.motivoAnulacion && (
        <div className="border-b border-neutral-300 px-5 py-2 text-red-700">
          <b>Anulado:</b> {r.motivoAnulacion}
        </div>
      )}

      {/* Recepción */}
      <div className="grid grid-cols-3 gap-8 px-5 pt-16 pb-6 text-center text-[11px] text-neutral-600">
        {["Firma", "Aclaración", "DNI"].map((t) => (
          <div key={t} className="border-t border-neutral-400 pt-1">
            {t}
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-200 px-5 py-1.5 text-center text-[9px] text-neutral-400">
        Generado con {brand.nombre} · {brand.web}
      </div>
    </div>
  );
}
