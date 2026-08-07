import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="text-destructive h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your data is safe on this device. Restart the app to continue.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium"
          >
            <RotateCcw className="h-4 w-4" /> Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
