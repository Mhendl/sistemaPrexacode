import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ComprobanteApi, EmpresaApi } from "@/api/types";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { brand } from "@/config/brand";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { codigoTipo, numeroComprobante } from "@/lib/facturacion";

export interface HojaComprobante {
  tipo: string;
  letra: "A" | "B" | "C";
  tipoCbte: number;
  puntoVenta: number;
  numero: number | null;
  fecha: string;
  vencimiento: string;
  condicionVenta: string;
  concepto: number;
  fechaServicioDesde?: string | null;
  fechaServicioHasta?: string | null;
  receptor: ComprobanteApi["receptor"];
  items: { codigo?: string | null; descripcion: string; cantidad: number; unidad: string; precioUnitario: number; bonificacion: number; alicuotaIva: number; subtotal: number }[];
  neto: number;
  exento: number;
  iva: ComprobanteApi["iva"];
  totalIva: number;
  total: number;
  cae?: string | null;
  caeVencimiento?: string | null;
  qr?: string | null;
  modo: ComprobanteApi["modo"];
  estado?: ComprobanteApi["estado"] | "Borrador";
  observaciones?: string | null;
  asociado?: string | null;
}

function QrArca({ url }: { url: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 0, width: 220, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(undefined));
  }, [url]);
  return src ? <img src={src} alt="Código QR de ARCA" className="size-24" data-testid="qr-arca" /> : <div className="size-24" />;
}

const cant = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

/** Comprobante tal como se imprime (A4, siempre en claro) */
export function ComprobanteHoja({ c, empresa }: { c: HojaComprobante; empresa: EmpresaApi }) {
  const logo = urlLogo(empresa);
  const discrimina = c.letra === "A";
  const sinValidez = c.modo !== "produccion";
  const factorIva = (alicuota: number) => (discrimina || c.letra === "C" ? 1 : 1 + alicuota / 100);

  return (
    <div className="hoja relative w-full bg-white text-[12px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/10">
      {sinValidez && (
        <div className="border-b-2 border-amber-500 bg-amber-100 px-5 py-1.5 text-center text-[11px] font-bold tracking-wide text-amber-900 uppercase" data-testid="aviso-sin-validez">
          {c.modo === "simulado" ? "Modo de prueba (simulador): sin validez fiscal" : "ARCA homologación: comprobante de prueba sin validez fiscal"}
        </div>
      )}
      {c.estado === "Rechazado" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-8 py-2 text-6xl font-black tracking-widest text-red-500/40">RECHAZADO</span>
        </div>
      )}

      <div className="relative grid grid-cols-2 border-b border-neutral-300">
        <div className="flex gap-4 border-r border-neutral-300 p-5 pr-10">
          {logo && <img src={logo} alt="" className="size-16 shrink-0 object-contain" />}
          <div>
            <div className="text-lg font-bold">{empresa.nombreFantasia ?? empresa.razonSocial}</div>
            <div className="mt-1 space-y-0.5 text-neutral-600">
              <div>
                <b className="text-neutral-800">Razón social:</b> {empresa.razonSocial}
              </div>
              {(empresa.domicilio || empresa.localidad) && <div>{[empresa.domicilio, empresa.localidad].filter(Boolean).join(", ")}</div>}
              <div>
                <b className="text-neutral-800">Condición IVA:</b> {empresa.condicionIva}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 pl-10">
          <div className="text-lg font-bold uppercase">{c.tipo.replace(/ [ABC]$/, "")}</div>
          <div className="mt-1 space-y-0.5 text-neutral-600">
            <div>
              <b className="text-neutral-800">Punto de venta / N°:</b> <span data-testid="comprobante-numero">{numeroComprobante(c.puntoVenta, c.numero)}</span>
            </div>
            <div>
              <b className="text-neutral-800">Fecha de emisión:</b> {formatDate(c.fecha)}
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
          <span className="text-3xl leading-none font-bold" data-testid="comprobante-letra">
            {c.letra}
          </span>
          <span className="text-[9px] text-neutral-600">COD. {codigoTipo(c.tipoCbte)}</span>
        </div>
      </div>

      {(c.concepto !== 1 || c.asociado) && (
        <div className="flex flex-wrap gap-x-8 border-b border-neutral-300 px-5 py-2 text-neutral-700">
          {c.concepto !== 1 && c.fechaServicioDesde && (
            <span>
              <b>Período facturado:</b> {formatDate(c.fechaServicioDesde)} al {formatDate(c.fechaServicioHasta ?? c.fechaServicioDesde)}
            </span>
          )}
          {c.asociado && (
            <span>
              <b>Comprobante asociado:</b> {c.asociado}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 border-b border-neutral-300 px-5 py-3">
        <div>
          <b>Cliente:</b> {c.receptor.razonSocial || "—"}
        </div>
        <div>
          {c.receptor.dni ? <><b>DNI:</b> {Number(c.receptor.dni).toLocaleString("es-AR")}</> : <><b>CUIT:</b> {c.receptor.cuit ? formatCuit(c.receptor.cuit) : "—"}</>}
        </div>
        <div>
          <b>Condición IVA:</b> {c.receptor.condicionIva || "—"}
        </div>
        <div>
          <b>Condición de venta:</b> {c.condicionVenta}
          {c.condicionVenta !== "Contado" && ` · vence ${formatDate(c.vencimiento)}`}
        </div>
        {c.receptor.domicilio && (
          <div className="col-span-2">
            <b>Domicilio:</b> {c.receptor.domicilio}
          </div>
        )}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-100 text-left">
            <th className="px-5 py-2 font-semibold">Descripción</th>
            <th className="px-2 py-2 text-right font-semibold">Cant.</th>
            <th className="px-2 py-2 text-right font-semibold">P. unitario</th>
            <th className="px-2 py-2 text-right font-semibold">Bonif.</th>
            {discrimina && <th className="px-2 py-2 text-right font-semibold">IVA</th>}
            <th className="px-5 py-2 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((i, idx) => (
            <tr key={idx} className="border-b border-neutral-200">
              <td className="px-5 py-1.5">
                {i.descripcion}
                {i.codigo && <span className="text-neutral-400"> · {i.codigo}</span>}
              </td>
              <td className="tabular px-2 py-1.5 text-right">
                {cant(i.cantidad)} {i.unidad}
              </td>
              <td className="tabular px-2 py-1.5 text-right whitespace-nowrap">{formatMoney(i.precioUnitario * factorIva(i.alicuotaIva))}</td>
              <td className="tabular px-2 py-1.5 text-right">{i.bonificacion ? `${cant(i.bonificacion)} %` : "—"}</td>
              {discrimina && <td className="tabular px-2 py-1.5 text-right">{i.alicuotaIva.toLocaleString("es-AR")} %</td>}
              <td className="tabular px-5 py-1.5 text-right whitespace-nowrap">{formatMoney(i.subtotal * factorIva(i.alicuotaIva))}</td>
            </tr>
          ))}
          {c.items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-neutral-400">
                Agregá ítems para ver la vista previa
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex justify-between gap-6 border-b border-neutral-300 px-5 py-3">
        <div className="max-w-[55%] text-neutral-700">{c.observaciones && <><b>Observaciones:</b> <span className="whitespace-pre-line">{c.observaciones}</span></>}</div>
        <dl className="tabular grid w-72 shrink-0 grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
          {discrimina && (
            <>
              <dt className="text-neutral-600">Importe neto gravado</dt>
              <dd className="text-right whitespace-nowrap">{formatMoney(c.neto)}</dd>
              {c.iva.map((i) => (
                <FilaTotal key={i.alicuota} label={`IVA ${i.alicuota.toLocaleString("es-AR")} %`} valor={i.importe} />
              ))}
              {c.exento > 0 && <FilaTotal label="Exento" valor={c.exento} />}
            </>
          )}
          <dt className="mt-1 border-t border-neutral-300 pt-1 text-sm font-bold">Total</dt>
          <dd className="mt-1 border-t border-neutral-300 pt-1 text-right text-sm font-bold" data-testid="comprobante-total">
            {formatMoney(c.total)}
          </dd>
        </dl>
      </div>
      {c.letra === "B" && (
        <div className="border-b border-neutral-300 px-5 py-2 text-[10px] text-neutral-600">
          Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) · IVA contenido: {formatMoney(c.totalIva)}
        </div>
      )}

      <div className="flex items-center gap-5 px-5 py-4">
        {c.qr ? <QrArca url={c.qr} /> : <div className="flex size-24 items-center justify-center border border-dashed border-neutral-300 text-center text-[10px] text-neutral-400">QR al autorizar</div>}
        <div className="flex-1">
          <div className="text-sm font-bold tracking-wide">ARCA</div>
          <div className="text-[11px] text-neutral-600">{c.cae ? "Comprobante autorizado" : "Pendiente de autorización"}</div>
          <div className="text-[10px] text-neutral-500">Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación</div>
        </div>
        <div className="tabular text-right">
          <div>
            <b>CAE N°:</b> <span data-testid="comprobante-cae">{c.cae ?? "—"}</span>
          </div>
          <div>
            <b>Vto. de CAE:</b> {c.caeVencimiento ? formatDate(c.caeVencimiento) : "—"}
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-200 px-5 py-1.5 text-center text-[9px] text-neutral-400">
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
