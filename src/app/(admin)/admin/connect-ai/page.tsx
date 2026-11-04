import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Section } from "@/components/guides/GuideKit";
import { CopyValue } from "@/components/admin/CopyValue";

export const metadata: Metadata = { title: "Connect AI — Members Admin" };

// Where staff connect their own AI tool to Members' MCP server (/api/mcp). Each person signs in
// with their own Members account; the staff list decides what the tools can do (spec:
// planning/spec/agent-access.md). Nothing here is secret: the URL is public and sign-in is OAuth.
const MCP_URL = "https://members.empowrcic.org/api/mcp";
const NAME = "Empowr Members";

function OpenButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-blue px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
    >
      {label} <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  );
}

export default function ConnectAiPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Connect your AI tool</h1>
        <p className="mt-1 text-mid">
          Use Members from your own AI assistant: ask who is booked, check a register, draft a message. Pick your app
          below, add the details, then sign in with <strong>your usual Members account</strong> and tap{" "}
          <strong>Allow</strong>. It can only do what your role allows, and everything it sends is logged under your
          name in <Link href="/admin/agent-activity" className="font-bold text-blue underline">AI tool activity</Link>.
        </p>
      </div>

      <Section title="The details you need">
        <CopyValue label="Name" value={NAME} />
        <CopyValue label="Server URL" value={MCP_URL} />
        <p>
          Authentication is <strong>OAuth</strong>. There is no key or client ID to enter: leave those fields empty and
          the Members sign-in opens by itself.
        </p>
      </Section>

      <Section title="On your phone">
        <p>
          Set the connector up <strong>once on a computer</strong>, in the web version of Claude or ChatGPT. The phone
          apps cannot add a custom connector, but once it is added on the web it appears in the app on your phone,
          signed in, with nothing more to do. The buttons below open the web settings page, or the app if your phone
          sends those links to it.
        </p>
      </Section>

      <Section title="Claude (claude.ai, desktop or mobile app)">
        <ol>
          <li>Open Claude's connector settings with the button below.</li>
          <li>
            Choose <strong>Add custom connector</strong>, paste the name and server URL, and save.
          </li>
          <li>
            Tap <strong>Connect</strong>, sign in to Members and tap <strong>Allow</strong>.
          </li>
          <li>Start a new chat. The Members tools appear under the connectors menu.</li>
        </ol>
        <OpenButton href="https://claude.ai/settings/connectors" label="Open Claude connectors" />
        <p>Add it once on the web and it also appears in the Claude desktop and phone apps.</p>
      </Section>

      <Section title="ChatGPT">
        <ol>
          <li>Open ChatGPT with the button below and tap <strong>Add</strong> (the + button).</li>
          <li>
            Enter the name. Under <strong>Connection</strong>, keep <strong>Server URL</strong> selected and paste the
            server URL.
          </li>
          <li>
            <strong>Authentication</strong> should say <strong>OAuth</strong>. Leave <strong>Advanced OAuth
            settings</strong> alone.
          </li>
          <li>
            Tick <strong>I understand and want to continue</strong>, then create it.
          </li>
          <li>When it asks, sign in to Members and tap <strong>Allow</strong>.</li>
        </ol>
        <OpenButton href="https://chatgpt.com/plugins" label="Open ChatGPT connectors" />
        <p>Custom connectors need a paid ChatGPT plan (Plus, Pro, Business or Enterprise).</p>
      </Section>

      <Section title="Claude Code (terminal)">
        <CopyValue label="Run" value={`claude mcp add --transport http empowr-members ${MCP_URL}`} />
        <p>
          Then type <strong>/mcp</strong> inside Claude Code, pick <strong>empowr-members</strong> and sign in.
        </p>
      </Section>

      <Section title="Any other AI tool">
        <p>
          Any app that supports <strong>remote MCP servers</strong> over HTTP with OAuth works. Add a custom MCP
          server with the URL above and follow its sign-in.
        </p>
      </Section>

      <Section title="Stopping access">
        <p>
          To disconnect, remove the connector in your AI app. Someone taken off the staff list loses AI access at the
          same time as screen access.
        </p>
      </Section>
    </main>
  );
}
