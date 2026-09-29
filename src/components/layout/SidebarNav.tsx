import { NavLink } from "react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRole } from "@/context/AuthProvider";
import { sectionsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { acceso } = useRole();
  const sections = sectionsFor(acceso);

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          {collapsed ? (
            <div className="mx-3 mb-2 border-t border-sidebar-border" />
          ) : (
            <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
              {section.title}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const link = (
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white",
                      collapsed && "justify-center px-0",
                      isActive && "bg-sidebar-accent font-medium text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand" />
                      )}
                      <item.icon className={cn("size-[18px] shrink-0", isActive && "text-brand")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );

              return (
                <li key={item.path}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
