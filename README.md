# Cake Lovers

Multi-tenant custom cake ordering platform. A customer describes a cake,
gets an AI-generated preview, picks a pickup time, and submits an order;
the shop owner manages incoming orders through a staff dashboard.

Built with Next.js 15, TypeScript, Tailwind, shadcn/ui, Supabase
(Postgres, Auth, Storage), and OpenAI image generation.

## Documentation

The full architecture, database schema, and phase-by-phase design
history live in [`docs/`](./docs), most notably:

- [`docs/03_Architecture.md`](./docs/03_Architecture.md) — system architecture
- [`docs/07_schema.sql`](./docs/07_schema.sql) — database schema
- [`docs/13_Production_Readiness.md`](./docs/13_Production_Readiness.md) — deployment guide and pre-launch checklist

## Local development

```bash
npm install
npm run dev
```

Requires a `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`OPENAI_API_KEY` — see `.env.example`.

## Key routes

| Route | Purpose |
|---|---|
| `/s/[storeSlug]/order` | Customer ordering wizard |
| `/orders/[orderId]` | Public order tracking (no login required) |
| `/admin/[storeSlug]/orders` | Staff order dashboard (requires login) |
| `/login` | Staff sign-in (magic link) |
