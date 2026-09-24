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
