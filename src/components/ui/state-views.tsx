import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LoadingView() {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-4 text-center">
      <AlertTriangle className="text-destructive h-6 w-6" />
      <p className="text-muted-foreground text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t("common.tryAgain")}
      </button>
    </div>
  );
}
