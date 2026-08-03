import { useActionState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { LocalApiError } from "@/lib/local-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [error, loginAction, isPending] = useActionState(
    async (_previousState: string | null, formData: FormData) => {
      const username = formData.get("username") as string;
      const password = formData.get("password") as string;

      try {
        await login(username, password, true);
        toast.success(t("auth.login.welcomeBack"));
        navigate("/dashboard/artists");
        return null;
      } catch (err) {
        if (err instanceof LocalApiError && err.code === "NETWORK_ERROR") {
          try {
            await login(username, password, false);
            toast.info(t("auth.login.offlineSuccess"));
            navigate("/dashboard/artists");
            return null;
          } catch {
            return t("auth.login.noCachedSession");
          }
        } else if (err instanceof LocalApiError) {
          return err.message;
        } else {
          return t("auth.login.unexpectedError");
        }
      }
    },
    null,
  );

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label={t("common.back", "Back")}
          className="absolute left-4 top-4"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {t("auth.login.title")}
          </CardTitle>
          <CardDescription>{t("auth.login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.login.username")}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder={t("auth.login.usernamePlaceholder")}
                required
                disabled={isPending}
                tabIndex={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.login.password")}</Label>
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground text-sm hover:underline"
                  tabIndex={4}
                >
                  {t("auth.login.forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t("auth.login.passwordPlaceholder")}
                required
                disabled={isPending}
                tabIndex={2}
              />
            </div>

            {error && (
              <p className="text-center text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              tabIndex={3}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.login.submitting")}
                </>
              ) : (
                t("auth.login.submit")
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col justify-center gap-4 border-t py-4">
          <p className="text-muted-foreground text-center text-xs">
            {t("auth.login.offlineHint")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("auth.login.noAccount")}{" "}
            <Link
              to="/register"
              className="text-primary font-medium hover:underline"
              tabIndex={5}
            >
              {t("auth.login.signUp")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
