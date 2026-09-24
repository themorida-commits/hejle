# Stabilize Hejleh UI and Make Supabase the Sole Backend

## Confirmed decisions

- Supabase is the only authentication and cloud data backend.
- Existing Firestore data will not be migrated; Firebase runtime code and configuration can be removed.
- A Persian configuration-error page is shown when required Supabase environment variables are absent.
- localStorage remains a client cache only; it is not an alternative backend.
- Schema deployment is a prerequisite before deploying the updated application.

## Implementation plan

1. **Add safe application bootstrap and visible failure states**
   - Add a small Supabase configuration module that validates the presence of `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` without logging or rendering their values.
   - Update `index.tsx` to validate configuration before dynamically importing `App`, so a missing-variable error cannot escape during module initialization and leave a blank screen.
   - Add a full-screen Persian configuration error explaining the missing variable names and the `.env.local`/deployment environment requirement.
   - Add a React error boundary around the main application with a Persian fallback, retry action, and safe diagnostic logging.
   - Treat missing table/RPC, network, and permission errors after startup as non-fatal banner/error states so the cached UI remains usable.

2. **Correct HTML, CSS entry, and browser secret exposure**
   - Set `index.html` to `lang="fa" dir="rtl"`, remove duplicated inline styles, and import `index.css` from `index.tsx` so Vite processes one authoritative stylesheet.
   - Remove the stale Vite import map; Vite must resolve React and bundled packages itself.
   - Remove the unused browser-only `LiveVoiceAssistant` and the Vite `define` entries that inject `GEMINI_API_KEY` into frontend bundles.
   - Keep the Gemini SDK and key server-side for the existing server API only; remove the unused frontend Gemini environment type.
   - Preserve the working `h-screen` app shell and static assets.

3. **Complete Tailwind v4 presentation and RTL behavior**
   - Add explicit local definitions in `index.css` for every non-core utility currently referenced by components, including `custom-scrollbar`, `animate-in`, `fade-in`, `zoom-in`, slide directions, and related variants.
   - Consolidate duplicated global keyframes/font rules and preserve existing highlight behavior.
   - Audit Tailwind classes used by the app and replace unsupported/noncanonical values with valid Tailwind v4 syntax.
   - Convert semantic RTL positioning and spacing to logical utilities (`start/end`, `ms/me`, `ps/pe`, `text-start/text-end`) in sidebar controls, popovers, tooltips, search icons, reminders, and modal alignment.
   - Keep intentionally physical positioning where the design requires it, especially the RTL scheduler table’s sticky-column offsets and centered decorative transforms.
   - Manually verify every page and modal at desktop and mobile widths after CSS generation.

4. **Remove Firebase/Firestore from the runtime**
   - Remove Firebase auth/Firestore imports, Firestore seed/load functions, obsolete synchronization refs, and related error handling from `App.tsx`.
   - Remove the `firebase` package and lockfile entries, `services/firebase.ts`, Firebase configuration/blueprint files, and the obsolete Firestore rules file.
   - Rename remaining state/refs that still say “Firestore” so they accurately describe Supabase synchronization.
   - Do not migrate or read any existing Firestore data.

5. **Stabilize Supabase authentication and cloud synchronization**
   - Use a single initialization/session flow to prevent the current duplicate `onAuthStateChange` plus `getSession` load race.
   - Track explicit cloud states (`idle`, `loading`, `ready`, `error`) and prevent autosave while remote hydration is in progress, avoiding local defaults overwriting cloud data.
   - Keep the 1.5-second debounce, but serialize/retry writes safely and expose a visible retryable error banner for save/load failures.
   - Fix auth error presentation so actual Supabase/OAuth errors are shown rather than requiring the unused literal `network-error`.
   - Keep anonymous local-cache editing and cloud sync after login, but do not label it as a second backend.

6. **Make cached data fail safely**
   - Replace direct `JSON.parse(localStorage...)` calls with typed, exception-safe read helpers that fall back to defaults and optionally remove corrupt entries.
   - Centralize localStorage writes so quota/serialization failures produce a non-fatal message rather than crashing render.
   - Preserve the current key names so existing browser cache data remains readable.

7. **Repair the Supabase schema and persistence semantics**
   - Rewrite `supabase/schema.sql` to be safely rerunnable; replace unsupported `create policy if not exists` usage with drop/create policy statements.
   - Retain the `public.app_data` table, indexes, RLS ownership checks, and add an `updated_at` trigger.
   - Add an RLS-invoking, atomic `replace_user_app_data` RPC authenticated by `auth.uid()` that replaces the current user’s records from a JSONB row set.
   - Update `services/supabaseData.ts` to serialize all collections into the RPC payload. This removes stale records that current upsert-only logic never deletes and makes each full save atomic.
   - Keep read operations per-user and keep singleton documents (`globalSettings`, `manualBalances`) intact.
   - Update the existing Supabase setup instructions and environment example to the publishable-key variable; never add secrets to tracked files.

8. **Deployment order and validation**
   - Apply the revised `supabase/schema.sql` to the Supabase project first.
   - Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `GEMINI_API_KEY` in the Vercel project; configure the production OAuth callback URL in Supabase.
   - Run `npm run lint` and `npm run build`.
   - After the remote schema is applied, run `npm run check:supabase`; success must return data from `public.app_data` without schema-cache, permission, or RLS errors.
   - Browser-smoke-test: missing-env error page, valid startup, corrupt localStorage recovery, Google login/logout, first-user seed, reload persistence, add/update/delete persistence, autosave ordering, save failure retry, all pages/modals, desktop RTL layout, and mobile layout.
   - Verify in browser Network/Console that there are no blank-screen errors, no duplicate initial cloud load, no Firebase requests, and no Gemini key in frontend assets or browser JavaScript.

## Risks and safeguards

- The application code will be deployed only after the RPC/schema exists; otherwise the UI must show a Persian database-not-ready error rather than crash.
- No Firestore recovery path is included by decision; removal is destructive only to repository runtime/config files, not to remotely stored Firestore data.
- OAuth callbacks must include the exact deployed origin or login will fail after redirect.
- Scheduler table positioning is highly custom; validate its sticky columns and palette separately from general RTL changes.
