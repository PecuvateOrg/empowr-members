// Which extra sign-in methods are switched on.
//
// Each one needs config outside this repo before it can work — a provider app
// (Google Cloud / Microsoft Entra) wired into Supabase Auth, or the project's
// passkey settings. A button for a method that is not configured fails only
// after the member has clicked it, so every method is OFF until its env var
// says otherwise. Turning one on is a Netlify env change, not a code change.
//
//   NEXT_PUBLIC_AUTH_PROVIDERS="google,azure"   social buttons, in this order
//   NEXT_PUBLIC_PASSKEYS_ENABLED="true"         passkey sign-in + Account section
import type { Provider } from "@supabase/supabase-js";

export type SocialProvider = Extract<Provider, "google" | "azure">;

export const providerLabels: Record<SocialProvider, string> = {
  google: "Google",
  // Supabase calls Microsoft sign-in "azure"; members only ever see "Microsoft".
  azure: "Microsoft",
};

export const enabledProviders: SocialProvider[] = (
  process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? ""
)
  .split(",")
  .map((p) => p.trim())
  .filter((p): p is SocialProvider => p in providerLabels);

export const passkeysEnabled =
  process.env.NEXT_PUBLIC_PASSKEYS_ENABLED === "true";
