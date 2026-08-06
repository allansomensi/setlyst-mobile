import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LogOut, Save, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { profileApi, LocalApiError } from "@/lib/local-api";

export default function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, isLinked, logout } = useAuth();

  const [username, setUsername] = useState(session?.username ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [firstName, setFirstName] = useState(session?.first_name ?? "");
  const [lastName, setLastName] = useState(session?.last_name ?? "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await profileApi.update({
        username: username.trim() || undefined,
        email: email.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
      });
      toast.success(t("profile.success", "Profile updated successfully"));
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.message
          : t("profile.failed", "Failed to update profile"),
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("profile.passwordsDoNotMatch", "Passwords do not match."));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(
        t(
          "profile.errors.passwordTooShort",
          "Password must be at least 8 characters",
        ),
      );
      return;
    }
    setIsSavingPassword(true);
    try {
      await profileApi.changePassword(currentPassword, newPassword);
      toast.success(
        t("profile.passwordChanged", "Password changed successfully!"),
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof LocalApiError
          ? err.code === "NETWORK_ERROR"
            ? t(
                "settings.sync.loginRequired",
                "You need to be online to change your password.",
              )
            : err.message
          : t("profile.failed", "Failed to change password"),
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/dashboard/artists");
  };

  const inputClass =
    "border-input mt-1 h-10 w-full rounded-lg border px-3 text-sm";

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border p-2"
          aria-label={t("common.back", "Back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">
          {t("settings.account.title", "Account")}
        </h1>
      </div>

      {!isLinked && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
          {t("settings.account.notLinked", "Not linked")} —{" "}
          <button
            className="text-primary underline"
            onClick={() => navigate("/login")}
          >
            {t("auth.login.submit")}
          </button>
        </p>
      )}

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("profile.personalInfo", "Personal Information")}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">
              {t("profile.firstNameLabel", "First name")}
            </label>
            <input
              className={inputClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              {t("profile.lastNameLabel", "Last name")}
            </label>
            <input
              className={inputClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">
            {t("profile.usernameLabel", "Username")}
          </label>
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">
            {t("profile.emailLabel", "Email")}
          </label>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button
          onClick={saveProfile}
          disabled={isSavingProfile}
          className="bg-primary text-primary-foreground flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {isSavingProfile ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t("common.save")}
        </button>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <KeyRound className="h-3.5 w-3.5" />{" "}
          {t("profile.changePasswordTitle", "Change Password")}
        </h2>

        <input
          type="password"
          placeholder={t("profile.currentPassword", "Current password")}
          className={inputClass}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder={t("profile.newPassword", "New password")}
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder={t("profile.confirmPassword", "Confirm new password")}
          className={inputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <button
          onClick={savePassword}
          disabled={isSavingPassword || !currentPassword || !newPassword}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-60"
        >
          {isSavingPassword ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {t("profile.updatePassword", "Update Password")}
        </button>
      </section>

      <button
        onClick={handleLogout}
        className="text-destructive flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium"
      >
        <LogOut className="h-4 w-4" />
        {t("nav.logout")}
      </button>
    </div>
  );
}
