import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { AgendaTab } from "./AgendaTab";
import { ArcaTab } from "./ArcaTab";
import { EmailTab } from "./EmailTab";
import { EmpresaTab } from "./EmpresaTab";
import { PlanTab } from "./PlanTab";
import { RolesTab } from "./RolesTab";
import { useRole } from "@/context/AuthProvider";
import { UsuariosTab } from "./UsuariosTab";
import { WhatsappTab } from "./WhatsappTab";

/** soloAdmin: usuarios, roles y plan no se delegan; el resto lo ve quien tiene el permiso "configuración" */
const todas = [
  { id: "empresa", label: "Empresa", el: <EmpresaTab />, soloAdmin: false },
  { id: "usuarios", label: "Usuarios", el: <UsuariosTab />, soloAdmin: true },
  { id: "roles", label: "Roles y permisos", el: <RolesTab />, soloAdmin: true },
  { id: "arca", label: "Facturación ARCA", el: <ArcaTab />, soloAdmin: false },
  { id: "email", label: "Email", el: <EmailTab />, soloAdmin: false },
  { id: "whatsapp", label: "WhatsApp", el: <WhatsappTab />, soloAdmin: false },
  { id: "agenda", label: "Agenda", el: <AgendaTab />, soloAdmin: false },
  { id: "plan", label: "Plan y suscripción", el: <PlanTab />, soloAdmin: true },
];

export function ConfiguracionPage() {
  const [params, setParams] = useSearchParams();
  const { esAdmin, puede } = useRole();
  const tabs = todas.filter((t) => (t.soloAdmin ? esAdmin : puede("configuracion")));
  const tab = tabs.some((t) => t.id === params.get("tab")) ? params.get("tab")! : (tabs[0]?.id ?? "empresa");

  return (
    <>
      <PageHeader title="Configuración" description="Datos de la empresa, usuarios, integraciones y suscripción." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <TabsList className="w-max">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4">
            {t.el}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
