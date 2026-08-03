import { useActionState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [error, registerAction, isPending] = useActionState(
    async (_previousState: string | null, formData: FormData) => {
      const username = (formData.get("username") as string)?.trim();
      const password = formData.get("password") as string;
      const email = (formData.get("email") as string)?.trim() || undefined;
      const first_name =
        (formData.get("first_name") as string)?.trim() || undefined;
      const last_name =
        (formData.get("last_name") as string)?.trim() || undefined;

      if (!username || username.length < 3 || username.length > 128) {
        return t("auth.register.errors.usernameLength");
      }
      if (!password || password.length < 8 || password.length > 256) {
        return t("auth.register.errors.passwordLength");
      }

      const payload: Record<string, string> = { username, password };
      if (email) payload.email = email;
      if (first_name) payload.first_name = first_name;
      if (last_name) payload.last_name = last_name;

      try {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          if (res.status === 409) return t("auth.register.errors.conflict");
          if (res.status === 422) return t("auth.register.errors.validation");
          return t("auth.register.errors.generic");
        }

        toast.success(t("auth.register.success"));
        navigate("/login?registered=true");
        return null;
      } catch {
        return t("auth.register.errors.serverError");
      }
    },
    null,
  );

  return (
    <div className="flex h-full min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label={t("common.back", "Back")}
          className="absolute -left-2 -top-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <form action={registerAction} className="w-full space-y-4 pt-10">
          <div className="text-center space-y-1.5 mb-6">
            <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.register.subtitle")}
            </p>
          </div>

          <div className="space-y-2">
            <input
              id="username"
              name="username"
              type="text"
              placeholder={`${t("auth.register.username")} *`}
              required
              disabled={isPending}
              autoComplete="username"
              className="border-input h-10 w-full rounded-lg border px-3 text-sm"
            />
          </div>

          <div className="space-y-2">
            <input
              id="email"
              name="email"
              type="email"
              placeholder={t("auth.register.email")}
              disabled={isPending}
              autoComplete="email"
              className="border-input h-10 w-full rounded-lg border px-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <input
                id="first_name"
                name="first_name"
                type="text"
                placeholder={t("auth.register.firstName")}
                disabled={isPending}
                autoComplete="given-name"
                className="border-input h-10 w-full rounded-lg border px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <input
                id="last_name"
                name="last_name"
                type="text"
                placeholder={t("auth.register.lastName")}
                disabled={isPending}
                autoComplete="family-name"
                className="border-input h-10 w-full rounded-lg border px-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <input
              id="password"
              name="password"
              type="password"
              placeholder={`${t("auth.register.password")} *`}
              required
              disabled={isPending}
              autoComplete="new-password"
              className="border-input h-10 w-full rounded-lg border px-3 text-sm"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-center text-sm font-medium text-destructive"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="bg-primary text-primary-foreground flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("auth.register.submitting")}
              </>
            ) : (
              t("auth.register.submit")
            )}
          </button>

          <p className="text-muted-foreground mt-4 text-center text-xs">
            {t("auth.register.alreadyHaveAccount")}{" "}
            <Link
              to="/login"
              className="text-primary font-medium hover:underline"
            >
              {t("auth.register.signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
