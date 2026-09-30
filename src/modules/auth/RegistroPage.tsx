import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brand, productoActivo } from "@/config/brand";
import { conversionRegistro } from "@/lib/medicion";

/** Código de quien lo recomendó: viene en el link (?ref=) y se recuerda aunque pase por otras pantallas */
function codigoReferido(): string | null {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) sessionStorage.setItem("prexacode-ref", ref);
    return ref ?? sessionStorage.getItem("prexacode-ref");
  } catch {
    return null;
  }
}
import { useAuth } from "@/context/AuthProvider";
import { AuthLayout } from "./AuthLayout";

const condiciones = ["Responsable Inscripto", "Monotributista", "Exento"];

export function RegistroPage() {
  const { registrar } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ razonSocial: "", cuit: "", condicionIva: "", nombre: "", email: "", password: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [acepta, setAcepta] = useState(false);
  // Si vino con un link de recomendación, se recuerda desde que abre la página
  useEffect(() => {
    codigoReferido();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    setError("");
    setEnviando(true);
    try {
      await registrar({
        empresa: { razonSocial: f.razonSocial, cuit: f.cuit, condicionIva: f.condicionIva },
        usuario: { nombre: f.nombre, email: f.email, password: f.password },
        aceptaTerminos: acepta,
        ref: codigoReferido(),
      });
      conversionRegistro(productoActivo());
      toast.success(`¡Bienvenido a ${brand.nombre}!`);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // La API devuelve "empresa.cuit", "usuario.email"… → nos quedamos con el nombre del campo
        const porCampo: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.details)) porCampo[k.split(".").pop()!] = v;
        setErrores(porCampo);
        setError(err.message);
      } else setError("No se pudo crear la cuenta");
    } finally {
      setEnviando(false);
    }
  };

  const campo = (id: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`reg-${id}`}>{label}</Label>
      <Input id={`reg-${id}`} value={f[id]} onChange={(e) => setF({ ...f, [id]: e.target.value })} aria-invalid={!!errores[id]} {...props} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </div>
  );

  return (
    <AuthLayout title="Creá la cuenta de tu empresa" subtitle="Te lleva un minuto. Después podés cargar clientes, productos y usuarios.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tu empresa</div>
        {campo("razonSocial", "Razón social", { autoFocus: true })}
        <div className="grid gap-4 sm:grid-cols-2">
          {campo("cuit", "CUIT", { placeholder: "30-12345678-9", inputMode: "numeric" })}
          <div className="grid gap-1.5">
            <Label htmlFor="reg-condicionIva">Condición frente al IVA</Label>
            <Select value={f.condicionIva} onValueChange={(v) => setF({ ...f, condicionIva: v })}>
              <SelectTrigger id="reg-condicionIva" className="w-full" aria-invalid={!!errores.condicionIva}>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {condiciones.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.condicionIva && <p className="text-xs text-destructive">{errores.condicionIva}</p>}
          </div>
        </div>

        <div className="mt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tu usuario (administrador)</div>
        {campo("nombre", "Nombre y apellido", { autoComplete: "name" })}
        {campo("email", "Email", { type: "email", autoComplete: "email" })}
        {campo("password", "Contraseña", { type: "password", autoComplete: "new-password", placeholder: "Mínimo 8 caracteres" })}

        <div className="grid gap-1">
          <div className="flex items-start gap-2.5">
            <Checkbox id="reg-acepta" checked={acepta} onCheckedChange={(v) => setAcepta(v === true)} aria-invalid={!!errores.aceptaTerminos} className="mt-0.5" />
            <Label htmlFor="reg-acepta" className="text-sm leading-snug font-normal">
              <span>
                Leí y acepto los{" "}
                <Link to="/terminos" target="_blank" className="font-medium text-primary hover:underline">
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link to="/privacidad" target="_blank" className="font-medium text-primary hover:underline">
                  Política de Privacidad
                </Link>
              </span>
            </Label>
          </div>
          {errores.aceptaTerminos && <p className="text-xs text-destructive">{errores.aceptaTerminos}</p>}
        </div>

        {error && Object.keys(errores).length === 0 && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Crear cuenta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Ingresar
        </Link>
      </p>
    </AuthLayout>
  );
}
