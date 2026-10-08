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
- Asaas credentials and fee config live in `platform_settings` (service-role only); read them only inside server functions via `src/lib/asaas.server.ts` — keeps the API key out of the browser.
- Fee/split math lives only in `src/lib/fees.ts` (`computeFees`), shared by checkout, server and admin simulator — one source of truth for buyer total, producer split and platform cut.
- Order status changes go through `applyOrderStatus` (webhook + manual refresh) — guarantees ticket counters and email notifications fire once.
- Email notifications go through `notifyOrder` in `src/lib/notify.server.ts` — swap its body for real sending once an email domain exists.
- First user to sign up becomes super_admin (signup trigger); producers get the producer role when an admin approves them.
- Homepage image overrides live in platform_settings.home_images; admin-authorized signed uploads use the homepage prefix in event-files, and getBranding exposes only safe branding fields to public pages.
- Receipt PDFs are generated on demand in the browser from RLS-protected paid orders through src/lib/receipt-pdf.ts; they never change payment or kit-delivery status.
- Event countdowns calculate from starts_at after hydration and stop at zero; no stored countdown state is needed.
