import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthProvider";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const { login, motivo } = useAuth();
  const aviso =
    motivo === "SESION_REEMPLAZADA"
      ? "Se abrió tu usuario en otro dispositivo, por eso se cerró esta sesión. Cada persona tiene que usar su propio usuario."
      : motivo === "USUARIO_SUSPENDIDO"
        ? "Tu usuario fue suspendido. Hablá con el administrador de tu empresa."
        : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      // Al quedar autenticado, SoloAnonimo (App.tsx) redirige a la pantalla pedida
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout title="Ingresá a tu cuenta" subtitle="Usá el email y la contraseña de tu usuario.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {aviso && !error && (
          <div role="status" data-testid="aviso-sesion" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
            {aviso}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Ingresar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Tu empresa todavía no usa el sistema?{" "}
        <Link to="/registro" className="font-medium text-primary hover:underline">
          Crear cuenta
        </Link>
      </p>
    </AuthLayout>
  );
}
