<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Super admins and producers share the existing event editor, with a dedicated queue tab selected through URL search — avoids duplicate event forms and keeps queue settings consistent.
- Activity auditing combines transactional database triggers with authenticated action middleware and browser events; logs omit payloads, secrets and personal fields, and only super admins can read them.
- Financial totals use an RLS-scoped SQL aggregate and paginated order reads; confirmed registrations include free orders while paid counts require a positive total.
- Post-login navigation is resolved once on the auth page after roles finish loading, including OAuth returns, to avoid competing redirects.
- The Hostinger mailbox uses fetch-only authenticated server functions with a super_admin role check on every operation; credentials and raw email HTML never enter the main page context.
- Asaas credentials and fee config live in `platform_settings` (service-role only); read them only inside server functions via `src/lib/asaas.server.ts` — keeps the API key out of the browser.
- Fee/split math lives only in `src/lib/fees.ts` (`computeFees`), shared by checkout, server and admin simulator — one source of truth for buyer total, producer split and platform cut.
- Order status changes go through `applyOrderStatus` (webhook + manual refresh) — guarantees ticket counters and email notifications fire once.
- Email notifications go through `notifyOrder` in `src/lib/notify.server.ts` — swap its body for real sending once an email domain exists.
- First user to sign up becomes super_admin (signup trigger); producers get the producer role when an admin approves them.
- Homepage image overrides live in platform_settings.home_images; admin-authorized signed uploads use the homepage prefix in event-files, and getBranding exposes only safe branding fields to public pages.
- Receipt PDFs are generated on demand in the browser from RLS-protected paid orders through src/lib/receipt-pdf.ts; they never change payment or kit-delivery status.
- Event countdowns calculate from starts_at after hydration and stop at zero; no stored countdown state is needed.
- Calendar actions use browser-generated RFC 5545 files and Google Calendar template links from actual event timestamps; no account access is required and exports never mutate registrations.
- Event descriptions use Tiptap HTML sanitized through src/lib/description.ts on editor input and public rendering, with legacy plain text/Markdown image support; clipboard HTML supports remote and raster base64 images, while pasted image files use the existing event upload flow.
- Coupon rules (event scope, percent, minimum, expiry, usage limit) are evaluated only server-side in src/lib/coupons.server.ts; the discount reduces the price before computeFees.
- Producer withdrawals: balance is computed server-side in src/lib/withdrawals.functions.ts (card sales release after platform_settings.card_release_days), confirmed by a hashed 6-digit e-mail code, and paid only by super admin via the producer's subaccount key in service-role-only producer_secrets — keeps payout keys and codes out of the browser.
- Event waiting queue: admission is serialized in the security-definer SQL function queue_enter (advisory lock per event) and createOrder rejects users without an unexpired admitted entry — keeps throttling atomic under thousands of concurrent buyers without in-memory state.
- Time-based automations (unpaid auto-cancel, abandoned-checkout and pre-event emails) run in one idempotent routine src/lib/automations.server.ts, called every 5 min by a single pg_cron job via /api/public/cron/automations — one consolidated job, safe to re-run.
