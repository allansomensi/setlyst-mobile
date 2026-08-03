import { useState } from "react";
import { MoreVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ActionSheetItem {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
}

export function ActionMenuButton({ items }: { items: ActionSheetItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("common.actions", "Actions")}
        className="p-2 -m-2 rounded-lg active:bg-muted"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="bg-background w-full max-w-md space-y-1 rounded-t-xl p-2"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {t("common.actions", "Actions")}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("common.close", "Close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium active:bg-muted ${
                    item.destructive ? "text-destructive" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
