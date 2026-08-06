import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { authApi } from "./local-api";
import type { LocalSession } from "@/types/api";

interface AuthContextValue {
  session: LocalSession | null;
  isLinked: boolean; // true when the guest has signed in to an account
  isLoading: boolean;
  login: (username: string, password: string, online: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const API_BASE_URL = "https://setlyst-api.onrender.com/api/v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authApi.ensureLocalProfile().then((s) => {
      setSession(s);
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(
    async (username: string, password: string, online: boolean) => {
      const result = await authApi.login(
        API_BASE_URL,
        username,
        password,
        online,
      );
      setSession(result);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      const fresh = await authApi.logout();
      setSession(fresh);
    } catch (err) {
      console.error("Failed to persist logout:", err);
    }
  }, []);

  const isLinked = !!session?.api_token;

  return (
    <AuthContext.Provider
      value={{ session, isLinked, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
