<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# CraftCompass scalability rule

Before adding or changing anything in CraftCompass AI, verify that the change fits the scalable multi-company platform architecture.

Every implementation should be checked for:
- tenant isolation and company ownership of data
- role and permission boundaries
- company-level configuration instead of hard-coded customer behavior
- reuse across companies, trades, jurisdictions, and future plans
- usage, billing, seat, and observability implications when relevant
- migration/backward-compatibility impact on existing companies
- avoiding one-off shortcuts that make later scaling harder

If a requested change conflicts with the scalable platform architecture, redesign the implementation so the user-facing goal is achieved without weakening the platform foundation.


# CraftCompass deployment efficiency rule

Batch related CraftCompass changes into the fewest safe Vercel deployments possible.

Before committing:
- finish and review the full related change batch
- avoid separate deployments for small changes that belong to the same feature or architecture pass
- keep unrelated or high-risk behavior changes in a separate batch when that improves safety
- verify the current deployment is READY before starting the next deployment
- diagnose failed deployments before adding more changes

The goal is architecture check -> batch related work -> one commit -> one Vercel deployment -> verify READY -> next batch.
