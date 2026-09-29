import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./AuthLayout";

/** Pide el link para elegir una contraseña nueva */
export function OlvideClavePage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  return (
    <AuthLayout title="¿Olvidaste tu contraseña?" subtitle="Te mandamos un link a tu email para que elijas una nueva.">
      {listo ? (
        <div className="grid gap-4" role="status" data-testid="olvide-listo">
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <span>
              Si <b>{email}</b> tiene una cuenta, en unos minutos te llega un email con el link. Vence en 1 hora. Revisá también la carpeta de spam.
            </span>
          </div>
          <Button variant="outline" asChild>
            <Link to="/login">Volver a ingresar</Link>
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setEnviando(true);
            try {
              await api("/auth/olvide", { method: "POST", body: { email } });
              setListo(true);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "No se pudo enviar");
            } finally {
              setEnviando(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="olvide-email">Email</Label>
            <Input id="olvide-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" disabled={enviando || !email.trim()}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            Mandarme el link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              Volver a ingresar
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

/** Elegir la contraseña nueva con el link del email */
export function RestablecerClavePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  return (
    <AuthLayout title="Elegí tu contraseña nueva" subtitle="Tiene que tener al menos 8 caracteres.">
      <form
        className="grid gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (clave.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
          if (clave !== repetir) return setError("Las dos contraseñas no coinciden");
          setEnviando(true);
          try {
            await api("/auth/restablecer", { method: "POST", body: { token, password: clave } });
            toast.success("Listo: ya podés entrar con tu contraseña nueva");
            navigate("/login", { replace: true });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
          } finally {
            setEnviando(false);
          }
        }}
      >
        {!token && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            El link está incompleto. Abrilo de nuevo desde el email, o pedí uno nuevo.
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="nueva-clave">Contraseña nueva</Label>
          <Input id="nueva-clave" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="repetir-clave">Repetila</Label>
          <Input id="repetir-clave" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </div>
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
            {error.includes("venció") && (
              <>
                {" "}
                <Link to="/olvide" className="font-medium underline">
                  Pedir otro link
                </Link>
              </>
            )}
          </div>
        )}
        <Button type="submit" size="lg" disabled={enviando || !token}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
