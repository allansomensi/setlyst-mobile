import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  User,
  LogOut,
  LogIn,
  UserPlus,
  Sun,
  Moon,
  Monitor,
  Languages,
  Type,
  Minus,
  Plus,
  ChevronRight,
  Info,
  Download,
} from "lucide-react";
import { useSync } from "@/lib/use-sync";
import { API_BASE_URL, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { preferencesApi, LocalApiError } from "@/lib/local-api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import packageJson from "../../../../package.json";
import { BackupSection } from "./_components/backup-section";
import { PreferencesConflict } from "@/types/api";
import { usePreferences } from "@/lib/use-preferences";

type ThemeOption = "light" | "dark" | "system";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português" },
  { code: "es", label: "Español" },
];

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background space-y-3 rounded-xl border p-4">
      <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { session, isLinked, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { status, report, error, runSync } = useSync();
  const navigate = useNavigate();

  const [conflict, setConflict] = useState<PreferencesConflict | null>(null);
  const clearConflict = () => setConflict(null);

  const {
    preferences,
    error: prefsError,
    update: updatePreferences,
  } = usePreferences(session?.user_id);

  const fontSize = preferences?.live_mode_font_size ?? 100;

  useEffect(() => {
    if (report?.preferences_conflict) {
      setConflict(report.preferences_conflict);
    }
  }, [report]);

  useEffect(() => {
    if (!preferences) return;
    if (preferences.theme !== theme) setTheme(preferences.theme as ThemeOption);
    if (preferences.language && preferences.language !== i18n.language) {
      i18n.changeLanguage(preferences.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  const persist = async (payload: {
    language?: string;
    theme?: ThemeOption;
    live_mode_font_size?: number;
  }) => {
    try {
      await updatePreferences(payload);
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("settings.saveFailed", "Failed to save preferences"),
      );
    }
  };

  const handleThemeChange = (next: ThemeOption) => {
    setTheme(next);
    void persist({ theme: next });
  };

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    void persist({ language: code });
  };

  const adjustFontSize = (delta: number) => {
    const next = Math.min(300, Math.max(50, fontSize + delta));
    void persist({ live_mode_font_size: next });
  };

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <SectionCard title={t("settings.account.title", "Account")} icon={User}>
        <button
          onClick={() => navigate("/dashboard/settings/account")}
          className="flex w-full items-center justify-between py-1 text-left"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {isLinked ? session?.username : t("common.guest", "Guest")}
            </p>
            <p className="text-muted-foreground text-xs">
              {isLinked
                ? session?.email ||
                  t("settings.account.linked", "Linked account")
                : t("settings.account.notLinked", "Tap to sign in")}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>
      </SectionCard>

      <SectionCard title={t("settings.theme")} icon={Sun}>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              {
                value: "light",
                label: t("settings.themeLight"),
                icon: Sun,
              },
              {
                value: "dark",
                label: t("settings.themeDark"),
                icon: Moon,
              },
              {
                value: "system",
                label: t("settings.themeSystem"),
                icon: Monitor,
              },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium transition-colors ${
                theme === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("settings.language")} icon={Languages}>
        <div className="flex flex-col gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex h-11 items-center justify-between rounded-lg border px-3 text-sm font-medium ${
                i18n.language === lang.code
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {lang.label}
              {i18n.language === lang.code && (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </button>
          ))}
        </div>
      </SectionCard>

      {prefsError && (
        <p className="text-destructive text-xs">
          {t("settings.saveFailed", prefsError)}
        </p>
      )}

      {/* Live Mode */}
      <SectionCard title={t("settings.liveModeFontSize")} icon={Type}>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => adjustFontSize(-10)}
            disabled={fontSize <= 50}
            aria-label={t(
              "liveMode.settings.decreaseSize",
              "Decrease font size",
            )}
            className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-16 text-center font-mono text-lg font-semibold tabular-nums">
            {fontSize}%
          </span>
          <button
            onClick={() => adjustFontSize(10)}
            disabled={fontSize >= 300}
            aria-label={t(
              "liveMode.settings.increaseSize",
              "Increase font size",
            )}
            className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("settings.liveModeFontSizeHelp")}
        </p>
      </SectionCard>

      <SectionCard
        title={t("settings.sync.title", "Cloud sync")}
        icon={RefreshCw}
      >
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.description")}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("settings.sync.lastSynced")}{" "}
          {session?.last_synced_at ?? t("settings.sync.never")}
        </p>

        <button
          onClick={runSync}
          disabled={status === "syncing" || !isLinked}
          className="bg-primary text-primary-foreground flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${status === "syncing" ? "animate-spin" : ""}`}
          />
          {status === "syncing"
            ? t("settings.sync.syncing")
            : t("settings.sync.syncNow")}
        </button>

        {!isLinked && (
          <p className="text-destructive text-xs">
            {t("settings.sync.loginRequired")}
          </p>
        )}
        {status === "success" && report && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            {t("settings.sync.success", {
              pushed: report.pushed,
              pulled: report.pulled,
            })}
          </p>
        )}
        {status === "error" && (
          <p className="text-destructive flex items-center gap-1.5 text-sm">
            <AlertTriangle className="h-4 w-4" />
            {error ?? report?.errors?.join(", ")}
          </p>
        )}
      </SectionCard>

      <SectionCard title={t("settings.backupTitle")} icon={Download}>
        <BackupSection />
      </SectionCard>

      <SectionCard title={t("settings.about", "About")} icon={Info}>
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>Setlyst Mobile</span>
          <span className="font-mono">v{packageJson.version}</span>
        </div>
      </SectionCard>

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background w-full max-w-sm space-y-4 rounded-xl p-4">
            <h2 className="text-lg font-semibold">
              {t("settings.conflict.title", "Preferências divergentes")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(
                "settings.conflict.description",
                "Este dispositivo e o servidor têm preferências diferentes. Qual você quer manter?",
              )}
            </p>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="font-medium">
                  {t("settings.conflict.local", "Este dispositivo")}
                </p>
                <p className="text-muted-foreground">
                  {conflict.local.theme} · {conflict.local.language} ·{" "}
                  {conflict.local.live_mode_font_size}%
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-medium">
                  {t("settings.conflict.remote", "Servidor")}
                </p>
                <p className="text-muted-foreground">
                  {conflict.remote.theme} · {conflict.remote.language} ·{" "}
                  {conflict.remote.live_mode_font_size}%
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await preferencesApi.resolveConflict(API_BASE_URL, "local");
                  clearConflict();
                }}
                className="h-10 flex-1 rounded-lg border text-sm font-medium"
              >
                {t("settings.conflict.keepLocal", "Manter este dispositivo")}
              </button>
              <button
                onClick={async () => {
                  await preferencesApi.resolveConflict(API_BASE_URL, "remote");
                  clearConflict();
                }}
                className="bg-primary text-primary-foreground h-10 flex-1 rounded-lg text-sm font-medium"
              >
                {t("settings.conflict.keepRemote", "Manter servidor")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
