import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from "@/api/client";
import type { EmpresaApi, Sesion, UsuarioApi } from "@/api/types";
import type { Acceso, Role } from "@/types";
import { puede as puedeAcceso } from "@/lib/navigation";
import { productoDelSitio, setProductoActivo } from "@/config/brand";

interface AuthState {
  status: "cargando" | "anonimo" | "autenticado";
  /** true si el usuario cerró sesión a propósito (no se recuerda la pantalla donde estaba) */
  cerroSesion?: boolean;
  /** Por qué se cerró la sesión sin que el usuario lo pidiera (ej. se abrió en otro dispositivo) */
  motivo?: string;
  usuario: UsuarioApi | null;
  empresa: EmpresaApi | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  registrar: (datos: RegistroInput) => Promise<void>;
  logout: () => void;
  /** Refresca los datos de la empresa en la sesión (ej. después de cambiar el logo) */
  actualizarEmpresa: (e: EmpresaApi) => void;
}

export interface RegistroInput {
  empresa: { razonSocial: string; cuit: string; condicionIva: string };
  usuario: { nombre: string; email: string; password: string };
  aceptaTerminos: boolean;
  /** Código de quien lo recomendó (link /registro?ref=…) */
  ref?: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    status: getToken() ? "cargando" : "anonimo",
    usuario: null,
    empresa: null,
  });

  /** Cierre de sesión pedido por el usuario */
  const logout = useCallback(() => {
    // Que el token deje de servir también en el servidor (si falla, igual se cierra acá)
    api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    queryClient.clear();
    setState({ status: "anonimo", usuario: null, empresa: null, cerroSesion: true });
  }, [queryClient]);

  /** Sesión vencida o inválida: se recuerda la pantalla para volver después del login */
  const expirar = useCallback((code?: string) => {
    setToken(null);
    queryClient.clear();
    setState({ status: "anonimo", usuario: null, empresa: null, motivo: code });
  }, [queryClient]);

  const iniciar = useCallback((s: Sesion) => {
    setToken(s.token);
    queryClient.clear();
    setState({ status: "autenticado", usuario: s.usuario, empresa: s.empresa });
  }, [queryClient]);

  // Recupera la sesión guardada al abrir la app
  useEffect(() => {
    setUnauthorizedHandler(expirar);
    if (!getToken()) return;
    api<{ usuario: UsuarioApi; empresa: EmpresaApi }>("/auth/me")
      .then((r) => setState({ status: "autenticado", ...r }))
      .catch((e) => expirar(e instanceof ApiError ? e.code : undefined));
    return () => setUnauthorizedHandler(null);
  }, [expirar]);

  const login = async (email: string, password: string) => {
    iniciar(await api<Sesion>("/auth/login", { method: "POST", body: { email, password } }));
  };

  const registrar = async (datos: RegistroInput) => {
    iniciar(await api<Sesion>("/auth/registro", { method: "POST", body: { ...datos, producto: productoDelSitio() } }));
  };

  const actualizarEmpresa = useCallback((empresa: EmpresaApi) => setState((s) => ({ ...s, empresa })), []);

  // La marca (nombre, colores, menú) es la del producto de la empresa; sin sesión, la de la dirección web.
  // Se fija antes de dibujar a los hijos, así todo sale con la misma marca.
  setProductoActivo(state.empresa?.producto ?? productoDelSitio());

  return <AuthContext.Provider value={{ ...state, login, registrar, logout, actualizarEmpresa }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Atajo para las pantallas: rol y usuario de la sesión (solo usar dentro de rutas protegidas) */
export function useRole(): { role: Role; usuario: UsuarioApi & { iniciales: string }; empresa: EmpresaApi; acceso: Acceso; esAdmin: boolean; puede: (...alguno: string[]) => boolean } {
  const { usuario, empresa } = useAuth();
  if (!usuario || !empresa) throw new Error("useRole requiere sesión iniciada");
  const acceso: Acceso = { esAdmin: !!usuario.esAdmin, permisos: usuario.permisos ?? [] };
  return { role: usuario.rol, usuario: { ...usuario, iniciales: iniciales(usuario.nombre) }, empresa, acceso, esAdmin: acceso.esAdmin, puede: (...alguno) => puedeAcceso(acceso, ...alguno) };
}

/** Muestra lo de adentro solo si el usuario tiene alguno de los permisos */
export function Si({ permiso, children }: { permiso: string | string[]; children: ReactNode }) {
  const { puede } = useRole();
  return puede(...(Array.isArray(permiso) ? permiso : [permiso])) ? <>{children}</> : null;
}
