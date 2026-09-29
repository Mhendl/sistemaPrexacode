import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useGuardarEmpresa, useQuitarLogo, useSubirLogo } from "@/api/hooks";
import type { EmpresaInput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { urlLogo } from "@/components/shared/EmpresaLogo";
import { useAuth, useRole } from "@/context/AuthProvider";
import { formatCuit } from "@/lib/format";
import { Field, Section } from "./parts";

const LADO_MAX = 600;

/** Achica la imagen en el navegador y la devuelve como PNG en base64 (así una foto grande pesa poco) */
async function prepararLogo(archivo: File): Promise<string> {
  if (!archivo.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth || LADO_MAX, img.naturalHeight || LADO_MAX));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || LADO_MAX) * escala));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || LADO_MAX) * escala));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const condiciones = ["Responsable Inscripto", "Monotributista", "Exento"] as const;

export function EmpresaTab() {
  const { empresa } = useRole();
  const { actualizarEmpresa } = useAuth();
  const guardar = useGuardarEmpresa();
  const subir = useSubirLogo();
  const quitar = useQuitarLogo();
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [f, setF] = useState<EmpresaInput>(empresa);

  useEffect(() => setF(empresa), [empresa]);

  const set = (campo: keyof EmpresaInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [campo]: e.target.value });

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErrores({});
    try {
      actualizarEmpresa(await guardar.mutateAsync(f));
      toast.success("Datos de la empresa guardados");
    } catch (e) {
      if (e instanceof ApiError) {
        setErrores(e.details);
        toast.error(e.message);
      } else throw e;
    }
  };

  const elegirLogo = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    try {
      const datos = await prepararLogo(archivo);
      actualizarEmpresa(await subir.mutateAsync(datos));
      toast.success("Logo actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el logo");
    }
  };

  const borrarLogo = async () => {
    actualizarEmpresa(await quitar.mutateAsync());
    toast.success("Logo quitado");
  };

  const campo = (id: keyof EmpresaInput, label: string, props: React.ComponentProps<typeof Input> = {}, className?: string) => (
    <Field label={label} htmlFor={`emp-${id}`} className={className}>
      <Input id={`emp-${id}`} value={(f[id] as string) ?? ""} onChange={set(id)} aria-invalid={!!errores[id]} {...props} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </Field>
  );

  const logo = urlLogo(empresa);
  const subiendo = subir.isPending || quitar.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Section title="Datos de la empresa" description="Aparecen en los comprobantes, remitos y emails.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          {campo("razonSocial", "Razón social", {}, "sm:col-span-2")}
          {campo("nombreFantasia", "Nombre de fantasía")}
          <Field label="CUIT" htmlFor="emp-cuit" hint="No se puede cambiar: identifica a la empresa ante ARCA.">
            <Input id="emp-cuit" value={formatCuit(empresa.cuit)} disabled />
          </Field>
          <Field label="Condición frente al IVA" htmlFor="emp-condicionIva">
            <Select value={f.condicionIva} onValueChange={(v) => setF({ ...f, condicionIva: v as EmpresaInput["condicionIva"] })}>
              <SelectTrigger id="emp-condicionIva" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {condiciones.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {campo("ingresosBrutos", "Ingresos Brutos")}
          {campo("inicioActividades", "Inicio de actividades", { type: "date" })}
          {campo("domicilio", "Domicilio")}
          {campo("localidad", "Localidad")}
          {campo("codigoPostal", "Código postal")}
          {campo("telefono", "Teléfono")}
          {campo("email", "Email", { type: "email" }, "sm:col-span-2")}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Logo" description="Se usa en la barra lateral, comprobantes y remitos. PNG, JPG o WEBP.">
        <input ref={inputArchivo} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={elegirLogo} aria-label="Archivo de logo" />
        <button
          type="button"
          onClick={() => inputArchivo.current?.click()}
          disabled={subiendo}
          className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed bg-white text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {subiendo ? (
            <Loader2 className="size-6 animate-spin" />
          ) : logo ? (
            <img src={logo} alt="Logo actual" className="max-h-full max-w-full object-contain p-3" />
          ) : (
            <>
              <ImagePlus className="size-6" />
              Subir logo
            </>
          )}
        </button>
        {logo && (
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => inputArchivo.current?.click()} disabled={subiendo}>
              Cambiar
            </Button>
            <Button variant="outline" size="sm" onClick={borrarLogo} disabled={subiendo} aria-label="Quitar logo">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
