import { Outlet, NavLink } from "react-router-dom";
import { Disc3, ListMusic, Music, Settings, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/lib/use-online";

export default function DashboardLayout() {
  const { t } = useTranslation();
  const online = useOnline();

  const NAV_ITEMS = [
    { to: "/dashboard/artists", icon: Disc3, label: t("nav.artists") },
    { to: "/dashboard/songs", icon: Music, label: t("nav.songs") },
    { to: "/dashboard/setlists", icon: ListMusic, label: t("nav.setlists") },
    { to: "/dashboard/settings", icon: Settings, label: t("settings.title") },
  ];

  return (
    <div className="bg-background flex h-full flex-col">
      <main
        className="flex-1 overflow-y-auto px-4"
        style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}
      >
        {!online && (
          <div
            className="mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            role="status"
          >
            <WifiOff className="h-3.5 w-3.5" />
            {t("common.offline", "Offline — changes will sync later")}
          </div>
        )}
        <Outlet />
      </main>

      <nav
        className="bg-background flex h-16 items-center justify-around border-t"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-xs ${
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
