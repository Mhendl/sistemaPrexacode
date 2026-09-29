const TOKEN_KEY = "prexacode-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
}

/** Error de la API con el mensaje para mostrar y el detalle por campo */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, string> = {},
    /** Código estable del servidor (ej. EDICION_CONCURRENTE) */
    public code?: string,
  ) {
    super(message);
  }
}

let onUnauthorized: ((code?: string) => void) | null = null;
/** El AuthProvider se registra acá para cerrar la sesión si el token venció */
export const setUnauthorizedHandler = (fn: ((code?: string) => void) | null) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.(data.code);
    throw new ApiError(res.status, data.error ?? "Ocurrió un error inesperado", data.details, data.code);
  }
  return data as T;
}
