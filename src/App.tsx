import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import LoginPage from "@/routes/login/login-page";
import DashboardLayout from "@/routes/dashboard/dashboard-layout";
import ArtistsPage from "@/routes/dashboard/artists/artists-page";
import SettingsPage from "@/routes/dashboard/settings/settings-page";
import SongsPage from "./routes/dashboard/songs/songs-page";
import SetlistsPage from "./routes/dashboard/setlists/setlists-page";
import SetlistDetailPage from "./routes/dashboard/setlists/setlist-detail-page";
import LiveModePage from "./routes/dashboard/setlists/live/live-mode-page";
import LyricsEditorPage from "./routes/dashboard/songs/lyrics-editor-page";
import RegisterPage from "./routes/register/register-page";

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard/setlists/:id/live"
            element={<LiveModePage />}
          />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<ArtistsPage />} />
            <Route path="artists" element={<ArtistsPage />} />
            <Route path="songs" element={<SongsPage />} />
            <Route path="songs/:id/lyrics" element={<LyricsEditorPage />} />
            <Route path="setlists" element={<SetlistsPage />} />
            <Route path="setlists/:id" element={<SetlistDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
      <Toaster
        position="top-center"
        offset="calc(var(--safe-top) + 16px)"
        mobileOffset="calc(var(--safe-top) + 16px)"
      />
    </AuthProvider>
  );
}
