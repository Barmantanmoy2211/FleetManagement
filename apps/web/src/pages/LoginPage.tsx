import { confirmSignIn, signIn } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, hydrate, hydrate: refreshSession } =
    useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hydrate().then(() => {
      if (useAuthStore.getState().isAuthenticated) {
        navigate("/", { replace: true });
      }
    });
  }, [hydrate, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      if (needsNewPassword) {
        await confirmSignIn({ challengeResponse: newPassword });
        await refreshSession();
        navigate("/", { replace: true });
        return;
      }

      const result = await signIn({ username: email, password });
      if (
        result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
      ) {
        setNeedsNewPassword(true);
        return;
      }

      if (result.isSignedIn) {
        await refreshSession();
        navigate("/", { replace: true });
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError || error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl"
      >
        <h1 className="text-2xl font-semibold text-white">
          {needsNewPassword ? "Set new password" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Fleet &amp; Driver Intelligence Platform
        </p>
        {displayError && (
          <p className="mt-4 rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {displayError}
          </p>
        )}
        {!needsNewPassword && (
          <>
            <label className="mt-6 block text-sm text-slate-300">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </>
        )}
        {needsNewPassword && (
          <label className="mt-6 block text-sm text-slate-300">
            New password (min 10 characters, upper, lower, number)
            <input
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={isLoading || submitting}
          className="mt-6 w-full rounded-md bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting
            ? "Please wait…"
            : needsNewPassword
              ? "Save password & continue"
              : "Sign in"}
        </button>
      </form>
    </div>
  );
}
