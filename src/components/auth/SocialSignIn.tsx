"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  enabledProviders,
  passkeysEnabled,
  providerLabels,
  type SocialProvider,
} from "@/lib/auth-providers";
import { links } from "@/lib/links";
import { Button, FormNotice } from "@/components/ui/form";

/** "Continue with Google / Microsoft" plus, on the sign-in page, "Sign in
 *  with a passkey". Renders nothing when no method is switched on (see
 *  lib/auth-providers.ts), so the email forms below it look as they did.
 *
 *  A social button CREATES an account the first time it is used, on /login as
 *  much as on /signup — unlike the magic link, which is shouldCreateUser:false.
 *  So the Terms/Privacy line goes beside these buttons on BOTH pages: it is the
 *  only place a social sign-up is told what it is agreeing to (UK GDPR Art. 13,
 *  same reasoning as the line in SignupForm). Do not drop it from /login.
 *
 *  An existing member who signed up by email and then picks Google with the
 *  same, verified address lands in their existing account: Supabase links
 *  identities on a verified email match. */
export function SocialSignIn({
  next,
  showPasskey = false,
}: {
  next: string;
  showPasskey?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<SocialProvider | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Feature-detected after mount: the server render cannot know, and a
  // passkey button on a browser without WebAuthn can only ever fail.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => {
    setCanPasskey(
      passkeysEnabled && showPasskey && typeof window.PublicKeyCredential === "function"
    );
  }, [showPasskey]);

  if (enabledProviders.length === 0 && !canPasskey) return null;

  async function withProvider(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Microsoft only returns an email when asked; Supabase refuses the
        // sign-in without one.
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    // On success the browser is already navigating to the provider.
    if (error) {
      setError(error.message);
      setPending(null);
    }
  }

  async function withPasskey() {
    setError(null);
    setPending("passkey");
    const { error } = await createClient().auth.signInWithPasskey();
    if (error) {
      // Closing the browser's passkey prompt is a choice, not a failure.
      if (!/abort|cancel|not allowed/i.test(error.message)) {
        setError("That passkey didn't work — sign in another way, then check Your account.");
      }
      setPending(null);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <FormNotice tone="error">{error}</FormNotice>}
      {canPasskey && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending !== null}
          onClick={withPasskey}
        >
          {pending === "passkey" ? "Waiting for your passkey…" : "Sign in with a passkey"}
        </Button>
      )}
      {enabledProviders.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending !== null}
          onClick={() => withProvider(provider)}
        >
          {pending === provider
            ? "Redirecting…"
            : `Continue with ${providerLabels[provider]}`}
        </Button>
      ))}
      {enabledProviders.length > 0 && (
        <p className="text-center text-xs leading-relaxed text-mid">
          New here? Continuing with {enabledProviders.map((p) => providerLabels[p]).join(" or ")}{" "}
          creates an account, and you agree to our{" "}
          <a
            href={links.termsAndConditions}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue underline hover:text-blue-dark"
          >
            Terms &amp; Conditions
          </a>{" "}
          and{" "}
          <a
            href={links.privacyPolicy}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue underline hover:text-blue-dark"
          >
            Privacy Policy
          </a>
          .
        </p>
      )}
      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-mid">
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
