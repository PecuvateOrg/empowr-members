# Skills

This file catalogs the reusable skills and slash commands available in this project. In context engineering, a skill is a repeatable, composable unit of agent behaviour: a named action Claude can be instructed to perform consistently.

## What Belongs Here

- Slash commands: any `/command` configured for this project, what it does, and when to use it
- Reusable prompts: named instruction patterns that get reused across sessions
- Automation triggers: any hooks or scheduled tasks wired to this project
- Usage notes: any gotchas, prerequisites, or ordering constraints

## Available Skills

| Skill | What it does | When |
|---|---|---|
| /netlify-deploy | Deploy to Netlify + custom domain via Route53 | Go-live and redeploys |
| /netlify-supabase-check | Audit Netlify + Supabase integration failure points | Before every go-live |
| /pre-deploy-security | Secrets, headers, RLS, CVE checks | Before every deploy — runs first |
| /pre-build-check | Framework/build structure validation | Deploy path |
| /webapp-testing | Playwright UI testing against local dev | UI verification |
| /design-audit | Build + run the Web Build Framework's multi-viewport audit harness (tap-target, contrast, layout) | Checking against the framework's quality floor, or verifying a fix landed |
| /init-brand | Favicons, manifest, brand assets | Once, before first deploy |
| /audit-mwp | MWP structure compliance check | After structural changes |
| /update-mwp | Update MWP files as the project evolves | Workspaces/integrations change |

## Usage Notes

- npm commands always run from `src/`, never the project root
- git push to main triggers Netlify auto-deploy — do not also fire a manual deploy
