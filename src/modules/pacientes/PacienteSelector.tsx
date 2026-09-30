import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/context/AuthProvider";
import { nombreCompleto, usePaciente, usePacientes } from "./api";
import { PacienteFormDialog } from "./PacienteFormDialog";
import { formatDni } from "./PacientesPage";

/** "Juan Pérez" → nombre Juan, apellido Pérez (se puede corregir en el formulario) */
const separar = (texto: string) => {
  const [nombre = "", ...resto] = texto.trim().split(/\s+/);
  return { nombre, apellido: resto.join(" ") };
};

/** Elegir el paciente de un turno: se busca por nombre, DNI o teléfono; si no está, se da de alta en el momento */
export function PacienteSelector({ value, onChange, invalido }: { value: string | null; onChange: (id: string | null, nombre: string | null) => void; invalido?: boolean }) {
  const { puede } = useRole();
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [alta, setAlta] = useState(false);
  const elegido = usePaciente(value ?? undefined);

  // Espera a que se termine de escribir para buscar
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);
  const resultados = usePacientes(busqueda.length >= 2 ? busqueda : undefined);
  const lista = busqueda.length >= 2 ? (resultados.data ?? []).filter((p) => p.estado === "Activo").slice(0, 8) : [];

  if (value) {
    const p = elegido.data;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2" data-testid="paciente-elegido">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{p ? nombreCompleto(p) : "Cargando…"}</div>
          {p && (
            <div className="truncate text-xs text-muted-foreground">
              {[p.dni && `DNI ${formatDni(p.dni)}`, p.obraSocial ?? "Particular", p.telefono].filter(Boolean).join(" · ")}
              {p.datosPendientes && <span className="text-warning"> · faltan datos</span>}
            </div>
          )}
        </div>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(null, null)} aria-label="Cambiar paciente">
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="ev-paciente"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, DNI o teléfono…"
          className="pl-9"
          aria-invalid={invalido}
          autoComplete="off"
          autoFocus
        />
      </div>
      {lista.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border" role="listbox" aria-label="Pacientes encontrados">
          {lista.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(p.id, nombreCompleto(p));
                  setTexto("");
                }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-accent"
              >
                <span className="text-sm">{nombreCompleto(p)}</span>
                <span className="text-xs text-muted-foreground">{[p.dni && `DNI ${formatDni(p.dni)}`, p.obraSocial ?? "Particular", p.telefono].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {busqueda.length >= 2 && !resultados.isFetching && lista.length === 0 && <p className="text-xs text-muted-foreground">No hay pacientes con “{busqueda}”.</p>}
      {puede("pacientes.editar") && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setAlta(true)}>
          <UserPlus className="size-4" /> {busqueda.length >= 2 && lista.length === 0 ? `Dar de alta a “${busqueda}”` : "Paciente nuevo"}
        </Button>
      )}
      <PacienteFormDialog
        open={alta}
        onOpenChange={setAlta}
        inicial={busqueda && !/\d{5,}/.test(busqueda) ? separar(busqueda) : undefined}
        onSaved={(p) => {
          onChange(p.id, nombreCompleto(p));
          setTexto("");
        }}
      />
    </div>
  );
}
