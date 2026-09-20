# Inicontent Starter

A minimal [Nuxt 4](https://nuxt.com/docs/getting-started/introduction) app whose only job is to
mount the **[Inicontent CMS](https://www.npmjs.com/package/inicontent)** as a Nuxt layer —
installed from the `inicontent` npm package. It gives you, out of the box:

- The full CMS admin UI — table grids, item forms, flows, settings, API docs (`/admin`).
- A per-database **REST API** served at `https://api.inicontent.com/{databaseSlug}/{table}`
  (authenticate with `PUT {databaseSlug}/auth/signin`, then pass the `{databaseSlug}_sid` session).
- A place for your own pages under `pages/` that **override** the CMS routes.
- **[`CONTEXT.md`](CONTEXT.md)** — the AI-agent build context: authentication, REST API,
  query language, table schemas & flows, and how to register custom table routes.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Configuration (`.env`)

```dotenv
# REQUIRED — the slug of the database the app manages.
database=myapp

# OPTIONAL — override the public API base (default https://api.inicontent.com/).
# apiBase=https://api.inicontent.com/

# OPTIONAL — override the super-admin role id.
# idOne=d7b3d61a582e53ee29b5a1d02a436d55
```

- With `database` set, the admin interface opens the tables of that DB directly at `/admin`.
- Without it, `/admin` lists all available databases, and each DB's admin lives at `/{db}/admin`.

## Development Server

Start the development server on `http://localhost:3434`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

## Building your app on top of the layer

- The CMS layer comes from the `inicontent` npm package; `package.json` pins the version
  (e.g. `^1.0.0`), and `pnpm up inicontent` pulls newer releases.
- **Remove `app.vue`** — the layer provides its own.
- Add your own files under `pages/`: they **override** the CMS routes of the same name.
- Per-table screens are **not auto-discovered** from `pages/` — register every custom table route
  explicitly in `nuxt.config.ts` via `hooks["pages:extend"]` (see `CONTEXT.md` §11).
- Reusable code goes in `components/`, `composables/`, `layouts/` as in any Nuxt app.
- **Read [`CONTEXT.md`](CONTEXT.md) before building** — it documents authentication, the REST API,
  the Inison query language, table schemas, flows, and the route-registration rules the AI and
  developers must follow.