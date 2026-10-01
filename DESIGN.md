# LILTEAM Cloud design

Blue and white cloud studio: navy Thai Kanit headlines, cobalt actions, pale background, authored line icons and real shop screenshots. Public homepage explains the storefront through an interactive seven-screen gallery, real package prices, setup steps and FAQs. Member console gives shop status, credit balance, shop links and renewal controls. Admin uses one responsive navigation shell, real operational totals and existing protected management forms.

Tokens live in public/css/cloud-studio-v2.css. Light is the default, persisted dark choice is respected. White/cobalt buttons invert in dark mode. Focus rings, keyboard gallery tabs, native zoom dialog, mobile navigation and reduced-motion behavior are part of the shared contract. No content depends on a reveal animation to become visible.

Public screenshots come from lilteam.site. Admin screenshot examples use the actual shop templates with isolated seeded records, labeled as test data. No customer stock or financial details are published. Sources are recorded in docs/showcase-provenance.md.

Future components should reuse existing tokens, nav and button classes, give clear labels and honest error states, and preserve authentication, payment, transaction and upload boundaries. UI animations remain brief and interruptible. Package prices are always server data.
