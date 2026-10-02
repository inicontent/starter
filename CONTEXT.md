# Inicontent — AI Build Context

> Purpose: give an AI agent everything it needs to build apps on top of **Inicontent CMS**
> using the **[inicontent/starter](https://github.com/inicontent/starter)** project, including
> authenticated access to the user's database through the Inicontent REST API.
>
> Verified against `inicontent` **1.1.0** (layer), `inibase` **3.3+** (engine, computed fields),
> and the current public API.

---

## 1. What Inicontent is

Inicontent is a **headless content management system / multi-database manager** built with **Nuxt 4 + Vue 3**.
It is a **Nuxt Layer**: your app extends it as a layer and the CMS provides the admin UI, the data model,
and the REST API out of the box.

Stack and key libraries:

| Piece | Technology |
| --- | --- |
| Framework | Nuxt 4 (SSR disabled), Vue 3, Vue Router |
| Admin UI components | Naive UI |
| Icons | Tabler Icons (`tabler:*`) |
| Rich text editor | Tiptap |
| Database engine | `inibase` (file-based, ACID, relational) — **3.3+** for computed fields |
| HTTPS public API | `https://api.inicontent.com/` |
| Query serialization | `inison` (compact string format used for `options` param) |

Key concepts:

- **Database** — every Inicontent project manages 1+ named databases, each identified by a **slug**
  (e.g. `myapp`). A DB is a set of **tables**.
- **Table** — collections of records (rows/items), each defined by a **schema** (list of fields).
- **Field / Schema** — the column/type definition of a table (string, number, email, password, table ref, arrays, objects, dates…).
- **Item / Row** — a single record in a table. Every item has an `id` and often `createdBy`, timestamps, etc.
- **Roles** — each user has a `role` id. The **super-admin role id** is `idOne`
  (default `d7b3d61a582e53ee29b5a1d02a436d55`); it gates dashboard/role-management features
  and the admin-only writes (backups, export, domains).
- **allowedMethods** — per-table permission string; letters `r` (read), `c` (create), `u` (update), `d` (delete).
  Respect it: a table with `allowedMethods: "r"` is read-only.
- **System tables** — a new database ships with `users`, `sessions`, `assets`, `translations`, `pages`,
  `blocks`, `dashboards`, `passkey_credentials`, `passkey_challenges`, `templates`, `backups`.
  Some are protected (`show: false` or admin-only flows): never rename or delete them.
- **Flows** — per-table automation stored on the table as `onRequest`/`onResponse` rule arrays
  (validate/mutate incoming data or query filters, abort with an error, send emails) — see §9.
- **Computed fields** — columns whose value the **engine derives on every write** from an expression
  over other fields (`total = sum(5 * 6)`) — see §8.
- **Dashboards** — saved chart/counter/table widgets stored in the `dashboards` table — see §12.
- **Backups** — on-demand full/table archives with scoped restore — see §10.5.
- **Realtime** — per-table WebSocket change feed (`config.realtime`) — see §13.
- **Content config** — per-table `config.content` declaration that derives SEO artifacts (sitemap/feed/JSON-LD) — see §4.2.
- **Locale** — the API accepts a `locale` param; supported values: `ar`, `en`, `fr`, `es`.

---

## 2. The starter project (`github.com/inicontent/starter`)

The starter is a minimal Nuxt app whose only job is to mount the Inicontent layer from the
[`inicontent` npm package](https://www.npmjs.com/package/inicontent).

Its `nuxt.config.ts`:
```ts
export default defineNuxtConfig({
  compatibilityDate: 'latest',
  extends: ["inicontent"],
})
```
- The layer is resolved from the `inicontent` version pinned in `package.json` (current generation: **1.1.0**).
- Upgrading to a new CMS release is `pnpm up inicontent` (or `npm update inicontent`) followed by a rebuild.
- Pin `^1.1.0` (or newer) for the current admin surface, dashboards and override-aware table
  navigation; per-table override files themselves work from **1.0.5** (§15).

### Setup & run

```bash
git clone https://github.com/inicontent/starter.git my-app
cd my-app
pnpm install        # or npm / yarn / bun
pnpm dev            # dev server → http://localhost:3434
pnpm build          # production build
pnpm preview        # preview the production build
```

### Configuration (`.env`)

```dotenv
# REQUIRED — the slug of the database the app manages.
database=myapp

# OPTIONAL — override the public API base (default https://api.inicontent.com/).
# apiBase=https://api.inicontent.com/

# OPTIONAL — override the super-admin role id.
# idOne=d7b3d61a582e53ee29b5a1d02a436d55
```

- If `database` is set, the `/admin` route opens the tables of that DB directly
  (no DB-name segment in the URL).
- If `database` is **not** set, `/admin` lists all available databases and each DB's
  admin lives at `/{databaseSlug}/admin`.

### Layout rules of a layer app

- **Remove `app/app.vue`** so the layer's own `app.vue` is used (the starter has no `app.vue`).
- Add your own files under `app/pages/`: they **override** the CMS routes of the same name. Custom
  per-table screens are just files too — `app/pages/admin/tables/<tableSlug>/…`, no route
  registration step (§15).
- Reusable code goes in `components/`, `composables/`, `layouts/` as in any Nuxt app.

---

## 3. Authentication — the AI agent must ask the user for credentials first

> **Rule:** before touching any database data, the agent MUST collect these from the user:
> the **database slug**, the **username**, and the **password**.
> Never hardcode real credentials in code — put them in `.env` or an environment, e.g.:
> ```
> INICONTENT_DATABASE=myapp
> INICONTENT_USERNAME=admin
> INICONTENT_PASSWORD=*****
> ```

### 3.1 Sign in

```
PUT https://api.inicontent.com/{databaseSlug}/auth/signin?locale=en
Content-Type: application/json
Body: { "username": "admin", "password": "*****" }
```

Example:
```bash
curl -s -X PUT "https://api.inicontent.com/myapp/auth/signin?locale=en" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","password":"PASSWORD"}'
```

Response shape (`apiResponse<T>`):
```json
{
  "result": {
    "id": "...",
    "username": "admin",
    "email": "admin@example.com",
    "role": "d7b3d61a582e53ee29b5a1d02a436d55",
    "sessionID": "<session-id>"
  },
  "message": "...",
  "code": 200
}
```

Store `result.sessionID`. On success the response also sets a **per-database session cookie**
named `{databaseSlug}_sid`.

### 3.2 Use the session on every data request

For every subsequent API call pass the session as a query parameter (or as the `{dbSlug}_sid` cookie):
```
{databaseSlug}_sid=<sessionID>
```

Example (params shown URL-decoded; URL-encode them when sending — see §5.1):
```bash
curl -s "https://api.inicontent.com/myapp/articles?myapp_sid=<session-id>&options=%7Bpage:1,perPage:25,columns:[title,id]%7D&where=%7Band:%7Bstatus:published%7D%7D&locale=en" \
  -H "Content-Type: application/json"
```

> UI convention: `credentials: "include"` + the `{dbSlug}_sid` query param
> (the app keeps the session in a scoped cookie named `{dbSlug}_sid`; the global `sid` cookie is deliberately wiped).
> `options` and `where` are the two Inison-stringified query params carrying pagination and filters (see §5.1 and §6).

### 3.3 Verify the session / current user

```
GET https://api.inicontent.com/{databaseSlug}/auth/current?isSignedIn=true&{databaseSlug}_sid=<session-id>
```
→ `{ "result": { "id": "...", "username": "...", ... } }` (or `result: null` when the session is invalid).
Use this as a cheap "is my session alive?" check.

### 3.4 Other auth endpoints

| Action | Method & path | Body / notes |
| --- | --- | --- |
| Sign up | `POST {apiBase}{db}/users` | Create an item in the `users` table (include a role id, e.g. `b4694ff1f8c483824582c1e2dc75f0f9`). Only when the `users` table `allowedMethods` includes `c`. |
| Sign out | `GET {apiBase}{db}/auth/signout` | Invalidates the active session and clears the `{db}_sid` cookie. |
| Request password reset | `POST {apiBase}{db}/auth/reset` | `{ "email": "..." }` → emails a reset link. |
| Confirm password reset | `PUT {apiBase}{db}/auth/reset` | `{ "token": "...", "password": "..." }` (min 8 chars) |
| Passkey sign-in begin | `PUT {apiBase}{db}/auth/passkey/authenticate/begin` | `{ "identifier": "..." }` |
| Passkey sign-in complete | `PUT {apiBase}{db}/auth/passkey/authenticate/complete` | challenge + `challengeRef` + credential |
| Passkey register begin/complete | `PUT {apiBase}{db}/auth/passkey/register/begin` & `/complete` | source: `"auth"` |

> The in-app API docs page (`/admin/api/auth`) advertises a `POST /auth/signup` path. **No such route exists** —
> signup is a `users` table create (`POST {db}/users`), which the built-in users flows gate.

### 3.5 Platform sessions (`inicontent_sid`) — the second session scope

The platform is not a separate auth system: `routes/inicontent/auth/signin` **is** the tenant
sign-in handler mounted at the `inicontent` segment. So the platform is just another "database"
name, and signing in to it yields a second, independent session scope.

```bash
# Platform sign-in — the account that owns/creates databases
curl -s -X PUT "https://api.inicontent.com/inicontent/auth/signin?locale=en" \
  -H 'Content-Type: application/json' \
  -d '{"username":"…","password":"…"}'
# → capture result.sessionID as $PLATFORM_SID
```

| Scope | Session param | Signs in via | Reaches |
| --- | --- | --- | --- |
| **Tenant / database** | `{db}_sid=<sessionID>` | `PUT {db}/auth/signin` (§3.1) | one database — everything in §3.1–§3.4 and §5 |
| **Platform** | `inicontent_sid=<sessionID>` | `PUT inicontent/auth/signin` | `inicontent/*` — database create (§10.8), billing, domains |

Verify it with `GET {apiBase}inicontent/auth/current?inicontent_sid=<sessionID>` (§3.3, same handler).

The platform sign-in response is **flat** — `sessionID` sits at the top of `result`, next to
`id`, `username`, `email`, `role` and `hasPasskey`; there is no nested `user` object. Its `code` is
the **string** `loginSuccess`, and the body echoes a hashed `password`: treat the whole response as
a secret and never log it.

> **Creating a database needs the platform session**, not a `{db}_sid` — see §10.8. Everything
> else in this document is tenant-scoped, and the layer's own UI only ever holds a `{db}_sid`.

---

## 4. Database discovery (the AI agent's map of the data)

Before writing any code, fetch the database metadata to learn its tables, schemas, and roles:

```
GET https://api.inicontent.com/inicontent/databases/{databaseSlug}?{databaseSlug}_sid=<session-id>
```

Response `result` (a `Database`) contains:
- `slug` — database slug
- `primaryColor`, `primaryDarkColor`
- `primaryLanguage`, `secondaryLanguages`
- `domains` — custom domains attached to the database
- `roles` — `[{ name, id }]`
- `size` — stored size of the database
- `email` — SMTP settings (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_secure`, `from_email`, `from_name`)
- `tables` — array of `Table` objects:
  ```ts
  {
    slug: string;
    label?: string;
    icon?: string;
    allowedMethods?: string;     // "r" | "c" | "u" | "d" | combinations
    schema?: Schema;             // the field list (see §7)
    onRequest?: FlowType[];      // table automation (see §9)
    onResponse?: FlowType[];
    columns?: string[];
    displayAs?: "table" | "kanban" | "cards";
    groupBy?: string;
    show?: boolean;              // false hides it from the public API list
    size?: number;
    config?: {                   // see §4.1
      log?: boolean;             // create + keep a {table}/logs table (item history)
      realtime?: boolean;        // broadcast changes over the WebSocket (§13)
      content?: ContentConfig;   // SEO/publishing declaration (§4.2)
      cache?: boolean;
      compression?: boolean;
      prepend?: boolean;
      decodeID?: boolean;
    };
    defaultSearchableColumns?: number[];
    defaultTableColumns?: number[];
    currentJob?: "export" | "import";   // non-empty while an import/export job is running
  }
  ```

> Note the metadata endpoint lives under the `inicontent` system slug, while data endpoints use the DB slug.
> - Metadata: `.../inicontent/databases/{db}`
> - Table data: `.../{db}/{tableSlug}`
>
> `GET .../inicontent/databases` (no slug) lists the databases the session can see.

### 4.1 Table `config` keys

| Key | Effect |
| --- | --- |
| `log` | `true` creates a companion `{table}/logs` table recording every change of every item (enables `GET {db}/{table}/logs` and `POST {db}/{table}/{id}/revert`, §5.8) |
| `realtime` | `true` broadcasts create/update/delete over the WebSocket at `wss://{apiHost}/realtime` and adds the `X-Realtime-Enabled: true` response header on reads |
| `content` | declarative publishing metadata used to derive SEO artifacts (§4.2) |
| `cache` | trades database size for faster reads |
| `compression` | shrinks stored data; slower reads |
| `prepend` | engine-level file layout hint used by internal tables (do not set on app tables) |
| `decodeID` | engine-level id encoding hint (do not set on app tables) |

### 4.2 `config.content` — publishing / SEO declaration

`config.content` describes *where* a table's content lives so the platform can derive
`sitemap.xml`, `feed.xml` and per-record JSON-LD without any per-use-case code. It grants **no access**:
read/write gating stays in the table's `onRequest`/`onResponse` flows.

| Key | Meaning |
| --- | --- |
| `path` | URL path template for one record, e.g. `"articles/[slug]"` |
| `titleField` | column holding the human-readable title |
| `slugField` | column holding the URL segment (defaults to `slug`) |
| `bodyField` | column holding the long-form body |
| `excerptField` | column holding a short summary |
| `imageField` | column holding the share image (asset or URL) |
| `dateField` | column holding the publish date |
| `statusField` / `publishedValue` | column whose value marks a record public, and the value that means published |
| `sitemap` / `feed` | include this table's records in `sitemap.xml` / `feed.xml` |
| `noindex` | emit `noindex` for this table's records |
| `where` | extra filter merged into the record query |

---

## 5. REST API reference (table data)

Base pattern for all table operations:

```
https://api.inicontent.com/{databaseSlug}/{tableSlug}
```

All requests include the session param `{databaseSlug}_sid=<session-id>` (or the cookie).

### 5.1 List items

```
GET {apiBase}{db}/{table}?options={page:1,perPage:10,columns:[title],sort:{age:-1}}&where={and:{status:published}}&locale=en&{db}_sid=<sid>
```

Query params:

| Param | Description |
| --- | --- |
| `options` | **Inison-stringified** `{ page, perPage, columns, sort }` — ALL pagination/projection/sorting live here: `page` (1-based, default `1`), `perPage` (page size, **default `15`**), `columns` (array of keys; prefix `!` to exclude), `sort` (a field name, an array, or an object like `{age:-1}`) |
| `where` | **Inison-stringified** Inibase criteria object, e.g. `{and:{status:published,tag:*news}}` (operators & grouping in §6) |
| `locale` | translation locale: `ar`, `en`, `fr`, `es` |
| `{db}_sid` | session id |

> `options` and `where` are serialized with `Inison.stringify(...)` and sent **URL-encoded** in the query string
> (use `encodeURIComponent`). Inison is a light JSON-like syntax **without quotes**:
> `{page:1,perPage:25,columns:[title,!password],sort:{age:-1}}` or `{and:{status:published}}`.
>
> **There is no `page`/`perPage`/`columns`/`sort`/`search` top-level query param** — plain values are ignored.
> The in-app docs page (`/admin/api/tables/{table}`) still lists `page`, `limit`, `columns` and `search` as
> top-level params and claims a default of 25; that page is out of date — trust this section.
> (`limit` in particular is never read; the page size is `options.perPage`.) An unauthenticated request
> confirms the real defaults: the error body echoes `"options": { "page": 1, "perPage": 15 }`.

Response:
```json
{
  "result": [ /* Item[] */ ],
  "options": { "page": 1, "perPage": 15, "total": 42 },
  "message": "",
  "code": 202
}
```
Successful reads answer with `code: 202`; the `options` object is the request's `options` merged with the
engine's page info (`page`, `perPage`, `total`, and `totalPages`).

> **Read the body, not just the HTTP status.** Most JSON endpoints answer
> `{ result, message, code, options?, where? }`, and **their errors come back with HTTP 200**:
> ```json
> { "result": null, "message": "The database does not exist",
>   "code": "dbNotFound", "options": { "page": 1, "perPage": 15 } }
> ```
> On failure `message` is the human-readable (localized) text and `result` is `null`. On success
> `result` is populated.
>
> **Judge by `result`, not by `code`.** `result === null` is the *only* reliable failure signal. The
> type of `code` is not a shortcut: a successful sign-in answers `code: "loginSuccess"` (a
> **string**), and an account that owns no databases answers `code: 404` (a **number**) with
> `result: null` (§10.8). Numeric success codes are `200` / `201` / `202` / `204`, and failure codes
> are otherwise arbitrary — `dbNotFound`, `accessDenied`, `notFound`, `tableNotFound`,
> `noActiveSubscription`, `emptyBody`, `databaseExist`, `tableExist`, `COMPUTED_FIELD_SETTABLE`, ….
>
> A few routes — schema validation — throw instead and answer with a **real HTTP
> status** (`401 authRequired`, `403 accessDenied`, `400 emptyBody`). Handle both shapes.

### 5.2 Get one item

```
GET {apiBase}{db}/{table}/{id}
```
Returns the single item (with `createdBy` expanded) and `code: 202`.

### 5.3 Create item(s)

```
POST {apiBase}{db}/{table}
Body: { ... }            // single item
Body: [ { ... }, ... ]   // bulk array
```
Answers `code: 201` (or the `signupSuccess` message when the table is `users`).
Never send computed keys — they are derived by the engine (§8.5).

### 5.4 Update item

```
PUT {apiBase}{db}/{table}/{id}
Body: { "field": "new value", ... }
```
Answers `code: 200` with the updated item. Add `?return=false` to get `true` instead of the row.

Bulk update (no id in the path) uses `where` as the selector:
```
PUT {apiBase}{db}/{table}?where={and:{status:draft}}&{db}_sid=<sid>
Body: { "status": "published" }
```

### 5.5 Delete item(s)

```
DELETE {apiBase}{db}/{table}/{id}        // single → result: true, code: 204
DELETE {apiBase}{db}/{table}             // with body = array of ids for bulk
```

### 5.6 Aggregate — sum a column

```
GET {apiBase}{db}/{table}/sum?columns=total&where={and:{status:paid}}&{db}_sid=<sid>
```

| Param | Type | Description |
| --- | --- | --- |
| `columns` | string \| list | **required** — one column, a comma-separated list, or an Inison/JSON array. A dotted child path (`items.quantity`) is allowed **only** with `nested=true`. |
| `where` | Inison | optional, same format as the list GET |
| `nested` | boolean | `true` aggregates element-wise over an array-of-objects column (dotted path) |
| `locale`, `{db}_sid` | | as on every read endpoint |

Response (`code: 200`):
```json
{ "result": 4250, "message": "", "options": { "page": 1, "perPage": 15 }, "where": {}, "code": 200 }
```
- A **single** column returns a number; **several** columns return `{ "total": 4250, "tax": 380 }`.
- With `nested=true`, `where` keys that resolve as **children of the array root** become per-element
  predicates and everything else stays a row-level filter:
  ```
  # rows where SOME element has quantity > 2, summing that element's quantity
  GET {db}/{table}/sum?columns=items.quantity&nested=true&where={quantity:>2}
  ```
- This is a **server-side** aggregate (no page-size cap) — it is what dashboard counters use (§12.3).
  `paramsNotCorrect` is returned when `columns` is missing/empty.

### 5.7 Assets (uploads are a two-step flow)

Assets live in the `assets` table; other tables reference them with `type: "table", table: "assets"`.

**The record shape** — an asset row is:
```ts
type Asset = Item & {
  name: string;        // the name WITHOUT its extension
  type: string;        // the MIME type for a file, or the literal "dir" for a folder
  extension: string;   // "png", "jpg"… — empty for a folder
  size: number;
  publicURL: string;   // empty/absent for a folder
};
```
> `type` does double duty: a **folder is an ordinary asset row with `type: "dir"`**, not a separate
> resource. There is no `folders` table and no folder endpoint. A file's display name is always
> `name + "." + extension` (the CMS renders them separately, so `name` never carries the extension).

#### 5.7.1 Upload (step 1 — describe the file)

```
POST {apiBase}{db}/assets                    // single file
POST {apiBase}{db}/assets/{folder}           // into a folder
Body: [ { "name": "logo", "size": 204800, "type": "image/png", "extension": "png" } ]
```
Each object requires `name`, `size`, `type` (MIME) and `extension`. Arrays are supported for multiple files at once.

> Send `name` **without** the extension — `"logo"`, not `"logo.png"` — since `extension` is its own field
> (the CMS splits the browser's `File.name` on the last dot before sending).

**Response:** the API returns the same fields **plus** `id`, `createdAt`, `publicURL`, and — crucially — **`uploadURL`**.

#### 5.7.2 Upload (step 2 — send the binary)

```
POST <uploadURL>          // or PUT when the URL contains "s3"
Header: Content-Type: <mimeType>
Body:   the raw file
```
```bash
curl -X POST "<uploadURL>" -H "Content-Type: image/png" --data-binary "@logo.png"
```
After this the file is stored and reachable via `publicURL`.

> **Custom upload endpoint:** if you already manage your own storage, include `publicURL` in the initial
> `/assets` request and the API **skips returning `uploadURL`** (no second step).
> **Cleanup:** if no `uploadURL` comes back unexpectedly, delete the just-created record:
> `DELETE {apiBase}{db}/assets/{id}`.

#### 5.7.3 Import by URL (server-side fetch)

Needs S3 or local storage configured, else `noStorageConfigured`:
```
POST {apiBase}{db}/assets/import          // also /assets/import/{folder}
Body: [ "https://example.com/logo.png", "https://example.com/hero.jpg" ]
```
The server creates the `assets` rows (and returns `uploadURL`/`publicURL` when the target storage needs a
client-side upload).

#### 5.7.4 Folders

A folder path is a plain slash-joined string appended to `/assets`, at any depth:
`/assets`, `/assets/logos`, `/assets/logos/2026`.

**Create a folder = POST to the folder path with no body at all** (no `name`/`size`/`type`):
```
POST {apiBase}{db}/assets/logos/2026        // empty body → creates the "2026" folder inside "logos"
```
It throws if the folder already exists, so create parents before children and treat "already exists" as success.
This is the only way to make a folder — the body documented in §5.7.1 always creates a *file* row.

**Read the assets table** (the reference for all of the above):
```
GET {apiBase}{db}/assets[/{folder}]
```
This is an ordinary list endpoint: it accepts `options` / `where` / `locale` (§5.1, §6) and returns
`options.total` / `options.totalPages` for pagination. It returns **direct children only** — one level,
never a recursive or flattened tree.

> **Recursion is the caller's job.** To walk a whole tree, request one path, then for every row with
> `type === "dir"` request `/assets/{that name}` and repeat. That is one request per directory (the CMS
> pages at `perPage: 500` while doing it), so budget accordingly on deep trees.

#### 5.7.5 Rename

```
POST {apiBase}{db}/assets/rename/{parent folders…}/{id}
Body: { "name": "new-name" }
```
Returns the updated asset (`200`).

- **The full parent path is mandatory** — the caller must know every ancestor folder *name*, exactly as for
  `GET /assets/{path}`. The asset id alone is not addressable: each parent segment is resolved to a folder id
  (404 on a wrong or incomplete chain), and the target lookup is scoped to that resolved chain, so an id
  belonging to a different folder will not match.
- The action segment is `rename`, placed **before** the path. A trailing segment (`/assets/{path}/{id}/rename`)
  compiles to `**:path/rename`, which radix3 cannot match — the path is swallowed and the request silently
  falls through to the assets catch-all. Keep the wildcard terminal, like `assets/import/{path}`.
- Renaming is gated on the `assets` table's `allowedMethods` containing `u` — the same permission the CMS
  checks before offering the action — and answers `accessDenied` otherwise.
- The endpoint renames the row **and moves the stored object server-side** (S3 copy, or copy+delete for
  local storage), then recomputes `publicURL`. There is no re-upload step and no window in which
  `publicURL` points at a missing object. `extension` is not renameable — it is a separate field, and a
  folder's `extension` stays `dir`.
- `name` is a single path segment. An empty name or one containing `/` is rejected: `missingName` /
  `invalidName`. An unchanged name is a `200` no-op. Duplicate names are allowed, as on upload.
- A failed storage move leaves the row and its `publicURL` untouched: `renameFailed`. A leftover old object
  after a successful move is an orphan, not data loss.
- Renaming a **folder needs no cascade** — the hierarchy is stored as an array of ancestor folder **ids**,
  not names, so children are unaffected. Existing links to `/assets/{old folder name}/…` stop resolving
  under the new name.
- There is **no move** (rename in place instead) and no copy.

> **Do not rename via the ordinary item update.** `PUT {db}/assets` with a changed `name`/`extension` is the
> *replace* flow: it deletes the old stored object, returns a fresh `uploadURL`, and expects the client to
> re-upload the binary — and it only repoints `publicURL` when it is empty or an `s3://`/`local://`
> placeholder. Ignoring the returned `uploadURL` leaves the row pointing at a deleted object. Use
> `POST /assets/rename/{path}/{id}` instead.

#### 5.7.6 Delete

Files and folders are addressed differently in the path — a file by its `id`, a folder by its `name`:
```
DELETE {apiBase}{db}/assets/{id}                    // a file
DELETE {apiBase}{db}/assets/{folder}/{folderName}   // a folder (by name, not id)
```

#### 5.7.7 Auth & params

Every assets request needs the session (§3.2) and accepts `locale`:
```
GET|POST|PUT|DELETE {apiBase}{db}/assets…?{db}_sid=<sessionID>&locale=<ar|en|fr|es>
```
Send the session as a cookie (`credentials: "include"`) or as the `{db}_sid` query param, and respect the
`assets` table's `allowedMethods` — the CMS only offers rename when `u` is granted and delete when `d` is.

> **Not covered by database export:** `POST {apiBase}inicontent/databases/{db}/export` archives schemas and
> records but **not the asset files** (§10.3). Storage usage/quota is only surfaced on `/admin/billing` (§14).

### 5.8 Table sub-resources

| Resource | Endpoints | Notes |
| --- | --- | --- |
| Activity logs | `GET {apiBase}{db}/{table}/logs` | Requires `config.log: true`. Each entry: `{ item, actions, madeBy, createdAt }` where `actions` is a JSON array of change tuples. |
| Revert to a log entry | `POST {apiBase}{db}/{table}/{id}/revert` — body `{ "logId": "<logs.id>" }` | Rebuilds the item as it was at that log entry, writes it back, and appends a `revert` log entry. Errors: `missingLogId`, `noLogsFound`, `logNotFound`, `reconstructFailed`, `updateFailed`. |
| Scheduled actions | `GET/POST {apiBase}{db}/{table}/schedules`, `POST .../schedules/preview`, `PUT/DELETE .../schedules/{id}`, `POST .../schedules/{id}/run` | Cron-based row creation; `excludeWeekdays`, `nextRunAt`, `lastRunAt`, `lastError` (§10.6). |
| Import | `POST {apiBase}inicontent/databases/{db}/{table}/import` · `GET .../import` | Send the file name via the `x-import-file-name` header (or `{ "fileName": "..." }` / `?fileName=`). Only `.csv` / `.json` (else `unsupportedFormat`); requires `allowedMethods` to include `c`. `GET` returns the job status `{ state, progress, processedRows, totalBytes, error, … }`. |
| Export | `POST .../export?format=json\|csv` · `GET .../export` · `GET .../export/download` | `format` defaults to `json`. `GET .../export` polls progress (a number, or 404 when idle). Download requires an admin session. |
| Sum | `GET {apiBase}{db}/{table}/sum` | §5.6 |

---

## 6. Query language (Inibase criteria + Inison options)

In API calls, **both `options` and `where` are sent as Inison-stringified query params**
(`import Inison from "inison"`, then `Inison.stringify(...)`, URL-encoded).
The **field values inside `where`** use the comparison operators below.

### 6.1 Comparison operators (`where` values)

Prefix a value with an operator. No prefix = strict equality (`=`).

| Operator | Meaning | Example (value as it appears inside a `where` Inison string) |
| --- | --- | --- |
| *(none)* / `=` | equal to | `status:published` |
| `!=` | not equal | `status:!draft` |
| `*` | contains | `title:*hello` |
| `!*` | does not contain | `title:!*spam` |
| `[]` | is one of | `category:[]news,blog` |
| `![]` | is not one of | `category:![]news,blog` |
| `>` `>=` `<` `<=` | numeric/date comparisons | `age:>18` |
| `r=` `r!=` `r>` `r>=` `r<` `r<=` | relative (dates/numbers) | `createdAt:r>=last month` |

Relative date values: `now`, `yesterday`, `tomorrow`, `last week`, `last month`, `last year`,
`next week`, `next month`, `next year`, `in 3 days`, `5 days ago`, etc.
Relative number values: plain numbers or numeric strings (`5000`).

Logical grouping — keys `and` / `or` (shown inside a `where` Inison string, i.e. without quotes):
```text
// AND
{and:{status:published,author:*ada}}
// OR
{or:{status:draft,status:archived}}
// Mixed (indexed groups)
{and:{status:published,age:{or:[>10,<20]}}}
```

Nested field paths work in `where` and in `columns` — `items.product`, `items.quantity`, and dotted
computed columns such as `items.lineTotal` (§8.8).

### 6.2 `options` param (pagination / projection / sort) — Inison format

Serialize with the `inison` package:
```ts
import Inison from "inison";

const options = Inison.stringify({
  page: 1,
  perPage: 25,
  columns: ["!password"],   // prefix "!" to exclude
  sort: { age: -1, username: "asc" }, // or "age", or ["age", "username"]
});
// => {page:1,perPage:25,columns:[title,!password],sort:{age:-1,username:asc}}
```
- `columns`: array of keys; prefix with `!` to exclude.
- `sort`: field name, array of names, or object `{age:-1, username:"asc"}`.
- The `where` param is stringified the same way:
  ```ts
  const where = Inison.stringify({ and: { status: "published", tag: "*news" } });
  // => {and:{status:published,tag:*news}}
  ```
- Send both URL-encoded in the query string (`encodeURIComponent(options)` / `encodeURIComponent(where)`).
- `perPage: -1` returns **every** matching row (no cap) — use it for small tables and reference pickers
  only; the default cap is 15.

---

## 7. Table structure — schema & field types (read it, edit it, create it)

A table's structure is its **schema** — a `Schema` (that is `Field[]`). Read it from the DB
metadata (§4, `tables[*].schema`). You create/edit it with the **meta endpoints** (§10), or let the
platform AI design it (§11.3) using the rules below (§7.4).

### 7.1 The `Field` object

```ts
type Field = {
  id?: number;                                 // numeric id, assigned when the field is created
  key: string;                                  // field name (DB's primary language)
  type: "string" | "number" | "boolean" | "date" | "email" | "url"
      | "table" | "object" | "array" | "password" | "html" | "ip" | "json" | "id";
  subType?: "text" | "textarea" | "radio" | "checkbox" | "tags" | "color"
          | "select" | "role" | "icon" | "multiple" | "range" | "locale" | "table" | ...;
  required?: boolean;
  unique?: boolean | string;                    // string = grouped-uniqueness key, e.g. "nameCategoryGroup"
  regex?: string;                               // validation pattern
  options?: (string | number)[];                // choices for select/radio/checkbox/multiple...
  defaultValue?: unknown;
  table?: string;                               // target slug — REQUIRED on type "table" (and table-list arrays)
  children?: Children;                          // REQUIRED on type "array" / "object"
  date?: "datetime" | "daterange" | "month" | "year" | "week" | "quarter" | ...;
  min?: number;
  max?: number;
  computed?: string | { expr: string; ast: unknown };  // engine-derived column — see §8
  prefix?: string;                              // display-only affix for number columns (e.g. "$")
  suffix?: string;                              // display-only affix (e.g. "%", "kg")
};
```

> Fields also carry a numeric `id` (assigned when the field is created) — flows reference fields
> by `id` or by `key` (§9), and **computed expressions reference fields by `id` only** (§8.2).
> `prefix` / `suffix` are pure presentation: they are stored on the field so they survive schema
> round-trips but are never sent to the expression engine.

### 7.2 `children` rules (array / object)

- `array` and `object` **must** have `children`; **no other type may**.
- `children` may be one of:
  - a list of type names: `["string", "number"]`
  - a single type name: `"email"`, `"string"`
  - an array of nested Field objects: `[{ key: "firstName", type: "string" }, ...]`
  - a relation list: `{ type: "array", children: "table", table: "users" }`
- `type: "table"` is a **single** relation — do NOT set `children`, only `table`.
- Any `children` that mention `table`/`id` require a matching `table` target.
- Nested Field objects may themselves be computed (§8.4).

### 7.3 Field types at a glance

| Type | Notes |
| --- | --- |
| `string` | plain text |
| `number` | numeric — the **only** type a computed column may use |
| `boolean` | true/false |
| `date` | date/time; `date` sub-property: `datetime`, `daterange`, `month`, `year`, `week`, `quarter`… |
| `email` | validated email |
| `url` | validated URL |
| `password` | encrypted; never read back |
| `html` | rich text (rendered via Tiptap) |
| `ip` | IP address |
| `json` | free JSON value (e.g. `config`, `widgets`) |
| `id` | an id/role reference; `subType: "role"` for role ids |
| `object` | nested object (has `children`) |
| `array` | list (has `children`); `children: "table"` + `table:` = relation list; `children: "string"` = tag list |
| `table` | single reference to another table: `{ type:"table", table:"users" }` (e.g. `createdBy`, `updatedBy`) |

Widgets (`subType` and CMS-specific forms — the *data* you send stays plain):

| subType / widget | Sends / stores |
| --- | --- |
| `text`, `textarea` | plain string |
| `select`, `radio` | the chosen value (string/number) |
| `checkbox`, `tags`, `multiple`, `range`, `array-select` | an array of values |
| `color`, `icon`, `role`, `locale`, `slider`, `mention` | a single value (color hex, tabler icon name, role id, locale code…) |
| `asset`, `array-asset` | sugar for `type: "table", table: "assets"` (and its array form) |
| `table`, `array-table` | relation widgets over a `table` field |

> When **creating** items, send plain values: strings for `select`/`radio`, arrays for
> `tags`/`checkbox`/`array-*`, IDs for `table` refs, objects/arrays for `object`/`array`.

### 7.4 Canonical schema rules (apply them when you design tables)

These are the conventions the platform itself uses — an agent connected through the MCP server
(`@inicontent/mcp`, §11) is told the same rules:

1. **Editing** an existing table → send the **full** schema (existing fields + new/modified ones).
   A partial `schema` **replaces** the whole field list on update — always merge first.
2. **`users` is a built-in system table.** Never propose a new users-equivalent table in any
   language (`users`, `utilisateurs`, `مستعملين`, `users_ar`, `customer_users`…). Reuse the
   `users` slug; if extra user fields are needed, **edit** the existing `users` table (keep its
   fields, add only what's missing). Use `label` for localized display text (§7.6).
3. **Never create per-locale columns.** Do not add suffixed fields like `title_en`, `title_fr`,
   `content_ar`. Multilingual content lives in the system `translations` table (§7.6): define
   single keys (`title`, `content`) and read them back with `?locale=<code>`.
4. Audit fields `createdBy` / `updatedBy` → `{ type: "table", table: "users" }`.
5. **Never send `id` — and there is no `isNew` param.** The server assigns `id` itself
   (`max(existing ids) + 1`) on table create. Keep the ids the create response returns: it echoes
   the engine-normalized schema, and those field ids are what computed expressions (§8.2) and flow
   rules (§9) reference.
6. Icons are **Tabler icon names** normalized to kebab-case (`building-store`) — tabler.io/icons.
7. Use the DB's **primary language** for table slugs, field keys, role names and labels.
8. Add a `label` on tables/fields when the app is multilingual; it is translated through the
   `translations` table, not by renaming keys.

### 7.5 Example — the default `users` table (real source)

```jsonc
[
  { "key": "username", "type": "string", "required": true },   // field id 1
  { "key": "password", "type": "password", "required": true }, // field id 2
  { "key": "email",    "type": "email",   "required": true },  // field id 3
  { "key": "role",     "type": "id", "subType": "role", "required": true }, // id 4
  { "key": "createdBy","type": "table", "table": "users" },    // id 5
  { "key": "config",   "type": "json" },                       // id 6
]
```
(Default roles: 1 = admin, 2 = user, 3 = guest. The built-in flows use field ids: `@user.4`
= role, `@data.2` = password, `@data.5` = createdBy. `config` is a free JSON column for
per-user preferences.)

---

### 7.6 Translations (multilingual content)

The platform stores multilingual content in the **system `translations` table**, not as per-locale columns on the source table.

**Correct pattern (single source fields):**
```json
{
  "schema": [
    { "key": "title", "type": "string", "required": true },
    { "key": "content", "type": "html" }
  ]
}
```

Fetch translated content by passing the `locale` query param (as documented in §5.1):  
`GET {apiBase}{db}/{table}?locale=fr&options={page:1,perPage:10}` merges translations for translatable fields into the returned items.

**Incorrect anti-pattern (do not do this):**
```json
{ "key": "title_en", "type": "string" },
{ "key": "title_fr", "type": "string" },
{ "key": "content_en", "type": "html" },
{ "key": "content_fr", "type": "html" }
```

**Notes:**
- Translatable fields generally include `string`, `text`, `textarea`, `html`, `url`, `table`, `asset`, and array forms of references (see `isTranslatableField()` in the layer). Fields like `password`, `email`, `color`, `icon`, `link`, `role`, `ids`, `id`, and similar identifiers are not translatable.
- Table and field `label`s are also translated via the `translations` table (rule 8 in §7.4).
- The Translate drawer in the admin UI manages per-item translations; programmatic access uses the `translations` table directly if needed.

**The `translations` row shape** (seeded by the API; `table`/`field`/`item` are the key):

| Key | Type | Notes |
| --- | --- | --- |
| `original` | `string` | the source-language value |
| `translation` | `string` | **required** — the translated value |
| `locale` | `string` (`subType: "locale"`) | **required** — `ar` / `en` / `fr` / `es` |
| `table` | `id` | **encoded** table id, not the slug |
| `field` | `number` | the field **id**, not the key |
| `item` | `string` \| `number` | the item id |
| `createdBy` | `table` → `users` | **required** |

> `table` and `field` are ids, not slugs/keys — read them from `GET inicontent/databases/{db}`
> (§4) and from the normalized schema a table create/update returns (§7.4 rule 5). `translations`
> also backs table and field `label`s, so a label row has `field` set and no `item`.

---

## 8. Computed fields — engine-derived columns

A **computed field** is a column the **database engine** recalculates on every write. The result is
stored on the row, is **read-only**, and can never be assigned by a client. This is the supported way
to derive totals, averages, line totals, discounts, scores — anything that must always be consistent
with its inputs.

### 8.1 Declaring a computed field

Put a `computed` expression on the field (the field itself is always a `number`):

```jsonc
{
  "key": "total",
  "type": "number",
  "computed": "sum(5 * 6)"   // quantity × price, summed over every item
}
```

The engine compiles it and persists the compiled form on the schema:

```jsonc
"computed": { "expr": "sum(5 * 6)", "ast": { /* id-based AST */ } }
```

- Send the **raw string** when creating/editing a table; the API answers with the persisted
  `{ expr, ast }` spec — read `expr` back for display (`computedExprOf(field)` in the layer).
- The AST stores **field ids**, not keys, so renaming a field or a table never retargets an expression.
- Adding or editing an expression on an existing table **backfills every existing row**; a failing
  expression aborts the schema change and leaves the old schema and values untouched.

### 8.2 The expression language

```
expression := term (("+" | "-") term)*
term       := factor (("*" | "/" | "%") factor)*      // "*" = multiply
factor     := integer | path | function | "(" expression ")"
path       := id ( "." id )*                          // "." = link/binding hop
function   := ("sum" | "count" | "avg" | "min" | "max") "(" expression ")"
```

| Rule | Detail |
| --- | --- |
| Operators | `+` add, `-` subtract, `*` multiply, `/` divide, `%` modulo, `(...)` grouping |
| Precedence | `* / %` bind tighter than `+ -`: `2 * 3 + 4` = 10, `2 * (3 + 4)` = 14 |
| References | **Every symbol is a numeric field `id`** from the table's schema (nested children included) |
| Id-or-literal | a bare integer that **matches a field id** is that field; an integer that matches nothing is a literal. So `6 / 4` divides field #6 by field #4, while `314 / 100` is 3.14 |
| No decimals | `.` is reserved for links, so `3.14` is a *path* (field 3 → field 4), never the decimal. Use division: `314 / 100` |
| Link hops | `3.4` reads field #4 of the row linked by field #3; field #3 must be `type: "table"`. Hops work inside functions: `sum(5 * 3.2)` = `quantity × product.price` |
| Functions | `sum`, `count`, `avg`, `min`, `max` iterate the elements of an **array-of-objects** column. The argument is a full expression evaluated once per element, then aggregated. All paths in the argument must belong to the *same* array |
| Missing operands | a missing/null operand is read as `0` rather than failing the write |
| Limits | expression ≤ **512** characters, AST depth ≤ **64** |
| Dependencies | computed fields are evaluated in dependency order, so one computed field may use another (cycles are rejected) |

### 8.3 Worked example — order total

```text
orders
  items (array)  →  quantity (id 5)   price (id 6)
  total = sum(5 * 6)

items: [{quantity: 2, price: 250}, {quantity: 1, price: 100}]
→ total = (2 × 250) + (1 × 100) = 600
```
`count(5)` = number of elements, `avg(5)` = average, `min(5)` / `max(5)` = lowest / highest.

### 8.4 Computed children (element-level)

A computed field on a **child of an array-of-objects** column is recalculated once per element:

```jsonc
{
  "key": "items", "type": "array",
  "children": [
    { "key": "product",  "type": "table", "table": "products" },   // id 3
    { "key": "quantity", "type": "number" },                        // id 4
    { "key": "lineTotal","type": "number", "computed": "4 * 3.2" }  // quantity × product.price
  ]
}
{ "key": "totalCents", "type": "number", "computed": "sum(5)" }     // id 6 → sum of lineTotal
```

Rules for computed children:
- the child field **must be `type: "number"`**;
- every reference must be a **sibling child of the same array** (plus link hops from them) — top-level
  columns and helper functions (`sum`, `count`, …) are rejected inside a child expression;
- arrays of arrays of objects are not supported as a computed root;
- they are read-only and stripped on write, exactly like top-level computed columns;
- in a dashboard counter, pick the **dotted** field (`items.lineTotal`) with the **Sum** operation.

### 8.5 Read-only rules

- The value is derived at write time and stored on the row → it is returned by every read, and can be
  filtered (`where`) and sorted like any other column.
- Sending a computed key in a `POST`/`{table}` or `PUT`/`{table}/{id}` body is rejected by the engine
  with `COMPUTED_FIELD_SETTABLE`.
- The REST API (and the CMS admin, mobile apps and offline replays) **strips computed keys before
  writing**, so echoing a whole row back is safe. Prefer stripping client-side too — never build a
  create/update body from a response that includes computed values.
- Use `options.columns` to project computed keys in/out like any column.

### 8.6 Conflicts & validation

- A computed field **cannot** be `required`, `unique` or carry a `regex` → `COMPUTED_FIELD_CONFLICT`.
  (The CMS clears those properties when you type an expression; when writing the schema by hand,
  omit them.)
- Invalid syntax, an unknown field id, a non-link hop, a container as a target, a cycle, a dangling
  link or an arithmetic failure are all rejected **when the schema is saved** (or when the offending
  row is written), never silently.

### 8.7 Error codes

| Code | Meaning / fix |
| --- | --- |
| `COMPUTED_FIELD_SYNTAX` | unparsable expression, empty string, or longer than 512 chars |
| `COMPUTED_FIELD_UNKNOWN_FIELD` | a referenced id does not exist in the table (or in the linked table) |
| `COMPUTED_FIELD_INVALID_LINK` | a `.` hop whose parent field is not a `table` reference |
| `COMPUTED_FIELD_INVALID_TARGET` | referencing a container (array/object), a top-level column from a child expression, a helper inside a child expression, or arrays-of-arrays |
| `COMPUTED_FIELD_CONFLICT` | `required` / `unique` / `regex` combined with `computed` |
| `COMPUTED_FIELD_CYCLE` | computed fields depend on each other in a loop |
| `COMPUTED_FIELD_SETTABLE` | a client tried to assign the computed key |
| `COMPUTED_FIELD_DANGLING_LINK` | a hop pointed at a relation row that no longer exists |
| `COMPUTED_FIELD_ARITHMETIC` | a non-numeric operand (e.g. dividing by a string field) |

### 8.8 Working with computed fields from the API

```ts
// 1) declare (admin) — merge into the full schema, then PUT the table
const schema = [
  { key: "status", type: "string" },                                   // id 1
  { key: "items", type: "array", children: [
      { key: "product",   type: "table", table: "products" },          // id 3
      { key: "quantity",  type: "number" },                            // id 4
      { key: "lineTotal", type: "number", computed: "4 * 3.2" },       // id 5
  ]},
  { key: "total", type: "number", computed: "sum(5)" },                 // id 6
];
// PUT {apiBase}inicontent/databases/{db}/orders  body: { schema }

// 2) write data — never include total / lineTotal
await $fetch(`${apiBase}${db}/orders`, {
  method: "POST",
  body: { items: [{ product: productId, quantity: 2 }] },
  // → items[0].lineTotal = 2 × product.price, then total = sum of the lineTotals
});

// 3) read / aggregate
// GET {db}/orders?options={perPage:-1,columns:[id,total]}
// GET {db}/orders/sum?columns=total
// GET {db}/orders/sum?columns=items.lineTotal&nested=true
```

Nuxt auto-imports the layer's `app/composables/computedField.ts` helpers into your app code:
`isComputedField(field)`, `computedExprOf(field)`, `computedKeysOf(schema)`,
`computedAffixesOf(field)` and `stripComputedKeys(schema, row)`.

---

## 9. Flows (data automation) — structure, edit, create

**Flows** are per-table automation scripts stored on the table object:

- `onRequest: FlowType[]` — run **before** the request is handled: validate/abort, mutate the
  incoming item (`@data`) or the query filters (`@where`), send emails.
- `onResponse: FlowType[]` — run on the outgoing data (e.g. hide a field).

### 9.1 `FlowType` — one flow = an array of rule tuples

Each **flow** is an array of `FlowType` rules executed in order. `[null, null, null]` is a no-op
placeholder. If a **condition** rule is false, the rest of that flow is skipped (the next flow starts).

| Rule | Shape | Effect |
| --- | --- | --- |
| Condition | `[path, operator, value]` | If the comparison fails → abort this flow (skip its remaining rules). |
| `set` | `["set", path, value]` | Write into the incoming item (`@data.…`) or the query filters (`@where.…`). |
| `unset` | `["unset", path]` or `["unset", [path, ...]]` | Remove a field from the item/filters; on `onResponse` it hides the field from the reply. |
| `error` | `["error", message]` | Abort the whole request with that error (e.g. `"accessDenied"` → `result: null` + `code: "accessDenied"`). |
| `email` | `["email", to, templateName]` | Send a transactional email (template from the `templates` table; variables = record fields + `user_*`). |

### 9.2 Value & path sources (the `@` getters)

| Prefix | Resolves to |
| --- | --- |
| `@user.<FieldId>` | a field of the current authenticated user (per the `users` schema) |
| `@data.<FieldId>` | a field of the incoming item(s) |
| `@where.<FieldId>` | a field of the query filters — may index groups: `@where.or.0`, `@where.or.5` |
| `@method` | the current HTTP method (GET/POST/PUT/DELETE) |
| `@date.now` / `@date.tomorrow` / `@date.yesterday` | dynamic timestamps (usable as a `set` value) |

Fields can be referenced by **numeric field id** (`@data.4`) or by **key name** (`@data.role`).
A literal value (a plain string/number without `@`) is used as-is.

### 9.3 Operators (same as the `where` operators in §6)

`=` `!=` `*` (contains) `!*` `[]` (is one of) `![]` `>` `>=` `<` `<=`

### 9.4 Example — the built-in `users` flows (real source, numeric form)

```jsonc
// users.onRequest
[
  // Non-POST requires a signed-in user (role = field 4):
  [["@method","!=","POST"], ["@user.4","=",null], ["error","accessDenied"]],
  // Creating/updating without a role → guest/user role 2; signed-in users keep
  // their role and stamp createdBy (field 5):
  [["@data.4","=",null], ["@method","[]",["POST","PUT"]], ["set","@data.4",2]],
  [["@user.0","!=",null], ["@method","[]",["POST","PUT"]],
   ["@user.4","![]",[1,"@data.4"]], ["set","@data.4","@user.4"],
   ["@user.0","!=","@data.5"], ["set","@data.5","@user.0"]],
  // Non-admins may only read/update their own record — rewrite `where`:
  [["@where.0","!=",null], ["@where.0","!=","@user.0"], ["@user.4","!=",1],
   ["set","@where.5","@user.0"]],
  [["@user.0","!=",null], ["@where.0","=",null], ["@user.4","!=",1],
   ["set","@where.or.5","@user.0"], ["set","@where.or.0","@user.0"]],
]
// users.onResponse — never expose the password:
[[["unset","@data.2"]]]
```

> Flows run for the session's user, **except** for the platform super-admin (`idOne`), whose requests
> bypass them. Don't rely on a flow to constrain a super-admin.

### 9.5 Saving / creating flows

```
PUT {apiBase}inicontent/databases/{db}/{tableSlug}
Body: { "onRequest": <FlowType[]>, "onResponse": <FlowType[]> }
```
- The arrays **replace** the table's flows wholesale — send the full list (merge first).
- The editor UI shape is `[{ id, value: [{ id, value: [rule, ...] }] }]`; serialize each rule to a
  plain tuple before sending (as in §9.4).
- The same endpoint also updates schema/config (§10.1); the admin UI lives at
  `/admin/tables/{table}/flows`.
- Email templates come from the `templates` table; SMTP is configured in database settings
  (`email` on the database, §4) and tested with `POST inicontent/databases/{db}/email/test`.

---

## 10. Creating & editing tables, schemas and flows (meta endpoints)

These endpoints manage **structure** (not data). All require `{db}_sid=<sid>`; table
create/update/delete and database-level endpoints are reserved for the database owner/admin.

### 10.1 Table structure endpoints

| Action | Method & path | Body | Notes |
| --- | --- | --- | --- |
| Create table | `POST {apiBase}inicontent/databases/{db}/{newTableSlug}` | `{ schema, config?, label?, icon?, allowedMethods? }` | slug comes from the URL; id auto-assigned; `allowedMethods` defaults to `"crud"`; `config.log: true` also creates a `{table}/logs` table |
| Update table | `PUT {apiBase}inicontent/databases/{db}/{tableSlug}` | full table object: `{ ...existing, schema?, onRequest?, onResponse?, config?, label?, icon?, allowedMethods?, columns?, displayAs?, show?, slug? }` | `schema`, `onRequest`, `onResponse` **replace** wholesale — keep/default the rest; `slug` renames (blocked on `users`, `assets`, `pages`, `blocks`; PUT itself blocked on `sessions`/`translations`); toggling `config.log` creates/deletes the `{table}/logs` table; `config.content` sets the SEO declaration (§4.2) |
| Delete table | `DELETE {apiBase}inicontent/databases/{db}/{tableSlug}` | — | blocked on `users`, `assets`, `pages`, `blocks`, `sessions`, `translations`, `backups` |
| Create database | `POST {apiBase}inicontent/databases/{newDbSlug}` | `{ username, password, email, roles?, tables?, primaryColor?, ... }` | scaffolds the system tables (§1) + admin user and returns a session cookie |
| Update database | `PUT {apiBase}inicontent/databases/{db}` | `{ email?, roles?, slug?, primaryColor?, ... }` | `tables` is ignored here — change tables via the endpoints above |
| List databases | `GET {apiBase}inicontent/databases` | — | databases visible to the session |
| Read database | `GET {apiBase}inicontent/databases/{db}` | — | §4 |
| Item-form schema | `POST/PUT {apiBase}{db}/{table}/schema` | an item draft | runs the table's `onRequest` flows against schema+data → `{ schema, data, error }`; used by the CMS item editor for dynamic forms |

> **There is no `GET {db}/{table}/schema`.** Only `POST` and `PUT` exist on that path — read a table's
> schema from `GET inicontent/databases/{db}` (§4) instead.
>
> **Built-in tables keep their built-in fields.** When you `PUT` a schema for `users`, `pages` or
> `blocks`, the new schema must still contain every built-in key —
> `users`: `username`, `email`, `password`, `role`, `createdBy` · `pages`: `slug`, `content`, `seo` ·
> `blocks`: `name`, `config`, `hideOn`. If one is missing the schema is **silently not applied**
> (the endpoint still answers `200` with the unchanged schema), so re-read the table after a schema PUT
> and confirm the fields are there.
>
> **Workflow for editing a table's structure:** `GET {apiBase}inicontent/databases/{db}` → take the
> current `tables[*].schema` (and `onRequest`/`onResponse`) → merge your changes → `PUT` back the
> full objects.

### 10.2 Example — create a table, then update its flows

```bash
# 1) Create the table (schema is required)
curl -s -X POST "https://api.inicontent.com/inicontent/databases/myapp/orders?myapp_sid=<sid>" \
  -H "Content-Type: application/json" \
  -d '{"schema":[
         {"key":"items","type":"array","children":[
            {"key":"quantity","type":"number","required":true},
            {"key":"unitPrice","type":"number","required":true}
         ]},
         {"key":"total","type":"number","computed":"sum(2 * 3)"},
         {"key":"customer","type":"table","table":"users"},
         {"key":"status","type":"string","subType":"select",
          "options":["pending","paid","shipped"]}
       ],
       "config":{"log":true},
       "icon":"shopping-cart","label":"Orders"}'

# 2) Update flows (send the full onRequest/onResponse lists — they replace)
curl -s -X PUT "https://api.inicontent.com/inicontent/databases/myapp/orders?myapp_sid=<sid>" \
  -H "Content-Type: application/json" \
  -d '{"onRequest":[
        [["@user.role","=",3],["error","accessDenied"]],
        [["@data.status","=",null],["set","@data.status","pending"]]
       ],
       "onResponse":[]}'
```
(Field ids follow declaration order across the whole schema, children included: `items` = 1,
`quantity` = 2, `unitPrice` = 3 — so `sum(2 * 3)` is the order total, summed over `items`.)

### 10.3 Database-level endpoints

| Action | Method & path | Body / notes |
| --- | --- | --- |
| Database export | `POST {apiBase}inicontent/databases/{db}/export` | queues a private archive of all schemas + records (**asset files are not included**); `anExportJobAlreadyRunning` if one is in flight |
| Export status | `GET {apiBase}inicontent/databases/{db}/export` | `{ state: queued\|running\|completed\|failed\|expired, progress, processedBytes, totalBytes, destination, consistency, createdAt, updatedAt, expiresAt, error? }`, or 404 when there is none |
| Export download | `GET {apiBase}inicontent/databases/{db}/export/download` | the archive file |
| Attach domain | `POST {apiBase}inicontent/databases/{db}/domains` | `{ domainName }` — requires domain management to be configured on the deployment, else `operationFailed` |
| Domain status | `GET {apiBase}inicontent/databases/{db}/domains/{domainName}` | association state |
| Detach domain | `DELETE {apiBase}inicontent/databases/{db}/domains/{domainName}` | — |
| Test email | `POST {apiBase}inicontent/databases/{db}/email/test` | `{ email, templateName? \| templateContent?, subject?, variables? }` — sends a real email |
| Preview email | `POST {apiBase}inicontent/databases/{db}/email/preview` | `{ templateName? \| templateContent?, subject?, variables? }` — renders without sending |

### 10.4 Dashboards data endpoints

`dashboards` is a normal table, so it uses the ordinary data endpoints — but its built-in flow allows
`GET` to everyone with a session and rejects writes to non-admins:

```
GET    {apiBase}{db}/dashboards            # list
GET    {apiBase}{db}/dashboards/{id}       # one
POST   {apiBase}{db}/dashboards            # { name, description?, icon?, widgets? }
PUT    {apiBase}{db}/dashboards/{id}       # same body
DELETE {apiBase}{db}/dashboards/{id}
```
The AI equivalents are the `inicontent_dashboard_*` tools listed in §11.1. Widget structure is in §12.2.

### 10.5 Backups & restore

Admin-only; requires storage to be configured (`noStorageConfigured`), and only one job at a time
(`backupJobAlreadyRunning`).

| Action | Method & path | Body / notes |
| --- | --- | --- |
| List | `GET {apiBase}{db}/backups` | supports `where` + `options`; each entry `{ name, extension, size, publicURL?, type: "full"\|"table", table?, automatic, state, error?, restoreState?, restoredAt? }` |
| Create | `POST {apiBase}{db}/backups` | `{ type: "full" \| "table", table?, name? }` → queues a job (`state`: `queued` → `running` → `completed`/`failed`) |
| Restore | `POST {apiBase}{db}/backups/{id}/restore` | `{ scope, confirm: true, table? }` — `scope` is one of `table`, `table-schema`, `table-data`, `database-schema`, `database-data`, `database-full`; `table` is required for `table*` scopes. Errors: `invalidBackupScope`, `confirmationRequired`, `tableNotSpecified` |
| Delete | `DELETE {apiBase}{db}/backups[/{id}]` | — |

### 10.6 Schedules

`GET/POST {apiBase}{db}/{table}/schedules` · `POST .../schedules/preview` ·
`PUT/DELETE .../schedules/{id}` · `POST .../schedules/{id}/run`

A schedule row: `{ name, preset: hourly|daily|weekly|monthly|custom, cronExpression, timezone: "UTC",
isActive, payload, excludeWeekdays?, nextRunAt?, lastRunAt?, lastError? }`. `payload` is a JSON object
(or Inison string) for the row to create and may use the template variables
`{{ now }}`, `{{ now + 2h }}`, `{{ now|iso }}`, `{{ today|date }}`, `{{ schedule.id }}`,
`{{ database.slug }}`, `{{ table.slug }}`, `{{ run.iso }}`. `.../schedules/preview` resolves those
variables without running anything.

### 10.7 SEO artifacts

```
GET {apiBase}{db}/seo/sitemap.xml
GET {apiBase}{db}/seo/robots.txt
GET {apiBase}{db}/seo/feed.xml
GET {apiBase}{db}/seo/schema.json
```
These return **raw** `application/xml` / `text/plain` documents (not the JSON envelope), derived from
each table's `config.content` declaration (§4.2), and records are read **through the table's
`onRequest` flow** — a draft hidden from anonymous visitors is never advertised.

### 10.8 Creating a database (first run)

This is the one operation that needs the **platform** session scope (§3.5), and the only one that
happens *before* a tenant database — and therefore a `{db}_sid` — exists.

```bash
# 1) Platform sign-in — the account that owns/creates databases
curl -s -X PUT "https://api.inicontent.com/inicontent/auth/signin?locale=en" \
  -H 'Content-Type: application/json' \
  -d '{"username":"…","password":"…"}'
# → capture result.sessionID as $PLATFORM_SID

# 2) Create the database. A body is required (an empty one is rejected), but every
#    field in it is optional.
curl -s -X POST "https://api.inicontent.com/inicontent/databases/myapp?locale=en&inicontent_sid=$PLATFORM_SID" \
  -H 'Content-Type: application/json' -d '{}'

# 3) Sign in to the new database with the admin user the create seeded
curl -s -X PUT "https://api.inicontent.com/myapp/auth/signin?locale=en" \
  -H 'Content-Type: application/json' -d '{"username":"…","password":"…"}'

# 4) Confirm it — discovers tables, schemas, roles
curl -s "https://api.inicontent.com/inicontent/databases/myapp?myapp_sid=<sid>"
```

**The admin user is inherited from the platform session, not sent in the body.** The create handler
posts `{ username, password, email }` from the *signed-in platform user* into the new database's
`users` table with `role: 1` (admin), then opens a session for it and sets the `{db}_sid` cookie.
So step 3 reuses the same credentials as step 1.

The optional body accepts:

| Field | Type | Notes |
| --- | --- | --- |
| `roles` | `string[]` | extra role **names**. `admin` / `user` / `guest` are seeded as ids `1`/`2`/`3`; extras start at `4` |
| `tables` | `{ id?, slug, schema, config? }[]` | tables to create alongside the system ones. Omit `id` (§7.4 rule 5); `slug`s that collide with a system table are dropped |

`slug` comes from the path, not the body. On success the response is `code: 201` with the new
database, its `tables` filtered to those with `allowedMethods`, and the system tables from §1 now
present — `users`, `sessions`, `assets`, `translations`, `pages`, `blocks`, `dashboards`,
`passkey_credentials`, `passkey_challenges`, `templates`, `backups`.

| Failure | Meaning |
| --- | --- |
| `emptyBody` | no body sent — send at least `{}` |
| `noActiveSubscription` | the account has no active paid plan. The platform **super-admin** (`idOne`) bypasses this check; everyone else needs a live subscription |
| `databaseExist` | a database with that slug already exists |

> `GET {apiBase}inicontent/databases?inicontent_sid=…` lists the account's databases, but it shifts
> off the platform's own meta row and answers `result: null`, `code: 404` when the account owns
> **none**. That `404` is a success-shaped envelope, not a missing route.

---

## 11. The MCP server (`@inicontent/mcp`) — how code agents drive Inicontent

The in-app AI assistant (the `{apiBase}{db}/ai` endpoints) and the in-app chatbot were **removed**.
AI is now provided by a standalone Model Context Protocol server, **`@inicontent/mcp`**, that code
agents — ChatGPT, Claude, Cursor, OpenCode, Windsurf, Cline, VS Code — attach to. The server gives
the agent **tools** that call the exact REST API documented in this file, plus **resources** that
carry its operating rules, so it never has to guess the conventions above.

```sh
npm install -g @inicontent/mcp
inicontent-mcp login            # stores the session id locally (password never persisted)
inicontent-mcp                  # stdio transport for local desktop agents
# or, for web/ChatGPT-style clients (Streamable HTTP on 127.0.0.1:3000):
inicontent-mcp http
```

Remote clients authenticate with `Authorization: Bearer <database>:<sessionID>` — the bearer is
verified against `auth/current` (§3.3) on **every** request. Mint one without storing anything:

```sh
inicontent-mcp login --username ada --password '…' --database myapp --print-token
# → myapp:6f9c…   (slug:sessionID, valid for the session's 30-day lifetime)
```

### 11.1 What the agent gets

- **~27 `inicontent_*` tools**, grouped as:
  - **Auth & discovery** — `inicontent_signin`, `inicontent_whoami`, `inicontent_list_databases`,
    `inicontent_describe_database`, `inicontent_describe_table`.
  - **Data** — `inicontent_list_items` (with `where`/`sort`/`columns`/`locale`, i.e. the `options`
    and `where` params of §5.1/§6), `get_item`, `create_items`, `update_items`, `delete_items`,
    `search_items`, `sum_column`.
  - **Schema & flows** — `inicontent_create_table`, `inicontent_update_table`, `inicontent_set_flows`
    (the meta endpoints of §10, merging rules of §7.4 baked into the tool), `delete_table`.
  - **Assets & dashboards** — `upload_asset` (the two-step flow of §5.7 handled internally),
    `import_asset_from_url`, `list_assets`, `list_dashboards`, `save_dashboard`.
  - **Projects (custom code)** — `create_project`, `list_projects`, `list_project_files`,
    `read_file`, `write_file`, `search_project` (see §11.4).
- **Three context resources** the agent reads on start:
  - `inicontent://context/hard-rules` — the non-negotiables of §16 ("hard rules").
  - `inicontent://context/query-language` — the inison `where`/`options` syntax of §6.
  - `inicontent://context/schema-rules` — the canonical schema rules of §7.4.
- **Server-side serialization:** the agent passes plain JSON objects for `where` and `options`;
  the server inison-stringifies and URL-encodes them (agents get this wrong constantly).

### 11.2 What "full API access" means

Every tool maps 1:1 to the REST API in this document and honours the same rules: the response
envelope of §5.1 (`result: null` = failure, whatever `code` says), `{db}_sid` on data requests,
`allowedMethods`/`show` enforcement, and the admin-only gates on dashboard writes, backups, export
and domains. A session that dies mid-conversation is silently re-signed-in once when credentials
are configured.

### 11.3 Designing tables & content

To design tables the agent either reads the existing schema with `inicontent_describe_database`
(then edits via `inicontent_update_table`, sending **full** merged `schema`/`onRequest`/
`onResponse` lists), or asks the user for a description and builds a new schema with
`inicontent_create_table` — the tool validates against §7.4 (no second `users`, no computed fields
combined with `required`/`unique`/`regex`, `unique`/`required` only on top-level fields, etc.).
Long-form or translated content is written with `inicontent_create_items`/`update_items` into the
real tables, exactly as §5.3/§5.4 describe.

### 11.4 Requests that need custom code

When the request needs a page, component or module rather than data, the agent runs
`inicontent_create_project`: it downloads `inicontent/starter`, rewrites it for the target
database (`.env` with `NUXT_PUBLIC_DATABASE`/`NUXT_PUBLIC_API_BASE`), and `git init`s the result
in the server's workspace (`INICONTENT_MCP_WORKSPACE`). Afterwards it edits files through
`inicontent_write_file`/`read_file` — custom table pages follow §15 exactly
(`app/pages/admin/tables/<tableSlug>/…`). File tools are jailed to the workspace root.

### 11.5 Security

The server never runs a shell and never executes untrusted input (`git init/add/commit` is the
only subprocess, with fixed arguments). Credentials are never stored: `login` persists only the
session id in `~/.config/inicontent-mcp/config.json` (mode `0600`). The remote transport verifies
the bearer against the session on each request, so a leaked token expires with the session, not
the process. Full per-client configuration snippets live in the package README.

---

## 12. Dashboards & widgets

### 12.1 The `dashboards` table

Schema (created automatically for new databases, and defensively re-created for older ones):
`{ name (required), description, icon, widgets (json) }`.
Built-in flow: reads are open to any session, writes require role `1` (admin) — the same guard the
CMS UI uses, so `POST`/`PUT`/`DELETE` fail with `code: "accessDenied"` for a normal user. Data
endpoints are in §10.4; the admin screens are `/admin/dashboards` and `/admin/dashboards/{id}`
(any signed-in user can open them; the create/edit/delete actions in the UI are shown only to the
super-admin).

### 12.2 Widget definition

```ts
type Widget = {
  id?: string;
  icon?: string;                        // tabler icon name
  type: "counter" | "line" | "bar" | "pie" | "table";
  title?: string;
  table?: string;                       // source table ID (not slug)
  field?: string | number;              // field ID (not key) the widget aggregates
  operation?: "count" | "sum" | "max" | "min";
  groupBy?: string | number;            // field ID
  dateField?: string | number;          // field ID, or the reserved keys createdAt / updatedAt
  dateRange?: "7d" | "30d" | "90d" | "1y" | "all";
  limit?: number;
  color?: string;
  size?: "small" | "medium" | "large";
  searchArray?: SearchType;             // filter (Inison criteria)
  columns?: (string | number)[];       // field IDs — table widget
  sortField?: string | number;          // field ID
  sortOrder?: "asc" | "desc";
};
```

> **References are stored as ids, not keys** — that is what keeps a widget working after a table rename
> or a field-key change. The AI works in slugs/keys and the apply endpoint resolves them to ids.

### 12.3 How widgets read data

| Widget | Mechanism | Cap |
| --- | --- | --- |
| `counter` + `count` | `GET {db}/{table}?options={perPage:1,columns:[id]}` → `options.total` | none (server-side count) |
| `counter` + `sum` | `GET {db}/{table}/sum?columns=<field>` (dotted field ⇒ `nested=true`, §5.6) | none (server-side aggregate) |
| `counter` + `max` / `min` | fetches up to 1000 rows and aggregates client-side | **1000 rows** |
| `line` / `bar` / `pie` | `GET {db}/{table}` with `columns`, `sort`, `where`; grouped client-side | **1000 rows** |
| `table` | `GET {db}/{table}` with `columns`, `sort`, `limit` | `limit` |

So: for exact totals prefer a **computed column** (`sum(...)`) or the `sum` operation; only `sum` and
`count` are exact on large tables.

---

## 13. Realtime (WebSocket)

Tables with `config.realtime: true` broadcast every change over a WebSocket.

```
PUT {apiBase}inicontent/databases/{db}/{table}      body: { …existing, config: { …, realtime: true } }
```
Reads on such a table then carry the header `X-Realtime-Enabled: true`.

### 13.1 Connecting

```
wss://api.inicontent.com/realtime        // host = the host of apiBase
```
The session is taken from the **upgrade request**: the `{db}_sid` query param or the `{db}_sid` cookie,
e.g. `wss://api.inicontent.com/realtime?myapp_sid=<session-id>`.

### 13.2 Subscribe / unsubscribe

```json
{ "type": "subscribe", "database": "myapp", "table": "articles" }
```
```json
{ "type": "subscribed", "database": "myapp", "table": "articles",
  "message": "Subscribed to real-time updates for myapp/articles" }
```
```json
{ "type": "unsubscribe" }
```

> The session is resolved **server-side from the upgrade request**; a `sessionId` field inside the
> message is ignored. A rejected subscription receives `{"type":"error","message":"…"}` and the socket is
> closed with code `4403` (deny-by-close).

### 13.3 Events

```json
{ "type": "data_change", "action": "create", "database": "myapp",
  "table": "articles", "data": { "id": "…", "title": "…" }, "timestamp": "2025-01-01T00:00:00.000Z" }
```
`action` is `create`, `update` or `delete`. Creates, updates, deletes, reverts, imports and exports all
broadcast when the table has realtime enabled. Row visibility is filtered **per subscriber** using the
read scope resolved at subscribe time, so a restricted user only receives rows their flows allow.

---

## 14. Routing / admin surface

Routes provided by the layer (all under the optional `{databaseSlug}` segment).

When `database` is configured in `.env` (recommended), routes live at `/admin/...`.
When not configured, each database is namespaced: `/{databaseSlug}/admin/...`.

| Route | Purpose |
| --- | --- |
| `/admin` | table list / dashboard for the configured DB |
| `/admin/tables` | table grid for the database |
| `/admin/tables/{table}` | data grid for a table (search, filter, sort, paginate) |
| `/admin/tables/{table}/{id}` | view an item |
| `/admin/tables/{table}/{id}/edit` | edit an item |
| `/admin/tables/{table}/new` | create an item |
| `/admin/tables/{table}/settings` | table settings (schema, config, allowed methods) |
| `/admin/tables/{table}/flows` | `onRequest` / `onResponse` editor |
| `/admin/tables/{table}/schedules` | scheduled actions |
| `/admin/tables/assets/**` | asset library (nested folders) + its own flows page |
| `/admin/tables/pages` · `/admin/tables/blocks` · `/admin/tables/templates` | the content-building system tables |
| `/admin/tables/backups` | database-level backups & restore (super-admin) |
| `/admin/api` | API documentation for your DB (also lists public read endpoints per table) |
| `/admin/api/tables` · `/admin/api/tables/{table}` | per-table CRUD docs (JSON-LD endpoint map) |
| `/admin/api/auth` | authentication endpoint docs |
| `/admin/settings` | database settings (SMTP, domains, email test/preview, database export) |
| `/admin/dashboards`, `/admin/dashboards/{id}` | dashboards (read for any session; create/edit/delete = super-admin) |
| `/admin/billing` | subscription, invoices, payment method, storage usage |
| `/auth` | login / signup |
| `/auth/reset` | password reset |
| `/api` | public read-only API overview (tables with `allowedMethods` containing `r` and `show !== false`) |

> In the sidebar, app tables come first, then the Dashboards entry, then the secondary system tables
> (`users`, `sessions`, `assets`, `translations`, `pages`, `blocks`, `templates`) — and **Backups last**,
> visible only to the super-admin. Backups is a *database-level* surface at `/admin/tables/backups`,
> not a per-table page.
>
> In older builds the table routes used bare paths like `/admin/{table}`; the current convention
> (used by the layer and by the route examples below) is `/admin/tables/{table}`.
>
> These are the layer's *generic* table routes, all dynamic (`[table]`, `[id]`). A statically
> named page in your app — `app/pages/admin/tables/<slug>/…` — outranks them and replaces the
> matching screen; see §15.
>
> The in-app `/admin/api/tables/{table}` page documents list params (`page`, `limit`, `columns`,
> `search`) that the API does **not** read, and claims a default page size of 25 instead of 15.
> Use it for the endpoint list, not for the query-param contract (§5.1).

---

## 15. Building custom interfaces for tables — override by file path

**No configuration is required.** Every CMS table route is *dynamic*
(`[[database]]/admin/tables/[table]/…`), so a page file at a **static** path in your app wins:
Nuxt registers it as its own route, and vue-router ranks a static segment above a dynamic one.
Creating `app/pages/admin/tables/urgences/index.vue` is all it takes to replace
`/admin/tables/urgences`.

> There is **no** `hooks["pages:extend"]` step, no route-`name` bookkeeping and no
> `nuxt.config.ts` edit involved. File-based routing handles all of it.

### Where the files go

Put them under `app/pages/` (the Nuxt 4 `srcDir`), not at the repo root, and **do not** put a
`[[database]]` segment in the path. The CMS discovers per-table overrides with
`import.meta.glob("/pages/admin/tables/**/index.vue")`, so a `[[database]]/…` path would not
match that glob and the CMS would keep treating the table as non-overridden.

### File → route

| File under `app/pages/` | Route it replaces | Purpose |
| --- | --- | --- |
| `admin/tables/{slug}/index.vue` | `/admin/tables/{slug}` | data grid for that table |
| `admin/tables/{slug}/new.vue` | `/admin/tables/{slug}/new` | create an item |
| `admin/tables/{slug}/[id]/index.vue` | `/admin/tables/{slug}/:id` | item view page |
| `admin/tables/{slug}/[id]/edit.vue` | `/admin/tables/{slug}/:id/edit` | edit an item |
| `admin/tables/{slug}/settings.vue` | `/admin/tables/{slug}/settings` | schema, config, allowed methods |
| `admin/tables/{slug}/flows.vue` | `/admin/tables/{slug}/flows` | `onRequest` / `onResponse` editor |
| `admin/tables/{slug}/schedules.vue` | `/admin/tables/{slug}/schedules` | scheduled actions |

Add only the screens you want to replace — every file you leave out falls back to the CMS page.
(Backups is **not** per-table: it is a database-level surface at `/admin/tables/backups` — §14.)

### Rules to follow

- **The folder name is the table slug, verbatim** — the same string the database uses, spaces
  and non-ASCII included (`منتجات`, `طلبات الشراء`).
- **The CMS honours the override in its own UI.** When `…/{slug}/[id]/index.vue` exists, the
  grid's *view* button navigates to your item page instead of opening the built-in drawer
  (layer ≥ 1.0.5).
- **Build links with `tableUrl()`, never a hand-written href.** The router registers a
  statically-named file under its **percent-encoded** spelling, so non-ASCII slugs must be encoded
  per segment when you navigate:
  ```ts
  const { tableUrl } = useTableUrl();
  // /admin/tables/%D9%85%D9%86%D8%AA%D8%AC%D8%A7%D8%AA/new
  const to = tableUrl("منتجات", "/new");
  ```
  `tableUrl(slug, suffix?, database?)` encodes the slug — and the database segment, defaulting to
  the current route's `:database?` — with `encodeURI` per segment, then appends `suffix` untouched.
- **Multi-database URLs:** the CMS pages live at `/{databaseSlug}/admin/…` when `database` is not
  set in `.env` (§14). Per-table overrides written as above sit at `/admin/tables/{slug}`; with
  `database` configured (recommended) that is the same URL the CMS uses, so the override applies.
  Mirror the `[[database]]` folder in `app/pages/[[database]]/admin/…` only for pages you replace
  wholesale — never for per-table screens.

### Example — ASCII slugs (hospital-style app)

```text
app/pages/admin/tables/urgences/index.vue         →  /admin/tables/urgences
app/pages/admin/tables/traumatoA/index.vue        →  /admin/tables/traumatoA
app/pages/admin/tables/traumatoA/[id]/index.vue   →  /admin/tables/traumatoA/:id
```

### Example — Arabic slugs (commerce-style app)

```text
app/pages/admin/tables/منتجات/index.vue → /admin/tables/منتجات        (grid)
app/pages/admin/tables/منتجات/new.vue → /admin/tables/منتجات/new
app/pages/admin/tables/منتجات/settings.vue → /admin/tables/منتجات/settings
app/pages/admin/tables/منتجات/flows.vue → /admin/tables/منتجات/flows
app/pages/admin/tables/منتجات/[id]/desc.vue → /admin/tables/منتجات/:id/desc   (extra screen of your own)
app/pages/admin/tables/مهام/index.vue → /admin/tables/مهام
app/pages/admin/tables/مهام/[id]/index.vue → /admin/tables/مهام/:id    (the grid's view button goes here)
app/pages/admin/tables/مهام/schedules.vue → /admin/tables/مهام/schedules
app/pages/admin/tables/طلبات الشراء/index.vue → /admin/tables/طلبات الشراء
```

### Overriding a non-table CMS page

Anything else the layer provides is replaced by creating a file at the **same path**:

```text
app/pages/[[database]]/admin/settings.vue   →  replaces the CMS database-settings page
app/pages/[[database]]/auth/index.vue       →  replaces the login / signup page
app/pages/[[database]]/admin/dashboards/index.vue
```

Nuxt matches layer and app pages by route path, so a same-path file wins and no `pages` array
manipulation is needed.

---

## 16. AI agent operating procedure (do this every time)

1. **Ask the user** for: database slug, username, password. (Never invent or guess them.)
2. **Authenticate** with `PUT {apiBase}{db}/auth/signin` → capture `result.sessionID`.
3. **Verify the session** with `GET {apiBase}{db}/auth/current`.
4. **Discover** the schema: `GET {apiBase}inicontent/databases/{db}` → read `tables[*].schema` (§7),
   `tables[*].onRequest/onResponse` flows (§9), `roles`, `allowedMethods`, `config` (§4.1) and
   `size`. Note every **computed** column (`field.computed`) — its value is engine-owned (§8).
5. **Plan** the app/pages against the real table slugs, field names and flows found in step 4.
6. **Design structure when needed**: create/edit tables, schemas and flows via the meta endpoints
   (§10), following the canonical schema rules (§7.4); never create a second `users` table. Put
   derived numbers in **computed fields** rather than computing them in the client (§8). When
   working through a code agent, do all of this with the MCP server's tools (§11).
7. **Implement** the app on the starter project (Nuxt layer pattern; custom table pages are just
   files under `app/pages/admin/tables/<tableSlug>/…` per §15 — they override the CMS routes).
8. **Aggregate server-side**: totals/counters go through `GET {db}/{table}/sum` (§5.6) — never by
   summing a paginated page of rows in the client.
9. **Verify** your work by reading data back through the same API with the session id — and judge every
   response by its **body** (`result` + `code`), not by the HTTP status (§5.1).

### Hard rules

- Never log, echo, or store plaintext passwords; use env vars (`INICONTENT_USERNAME`, `INICONTENT_PASSWORD`).
- Judge every API response by its body — `result === null` or a **string** `code` means failure even
  when the HTTP status is `200` (§5.1).
- Always attach `{db}_sid=<session>` to data requests; a missing/invalid session yields
  `authRequired`/`accessDenied` (or an empty `result`).
- Respect `allowedMethods` per table (`r/c/u/d`) and `show` flags.
- Set a `locale` (`en` by default) on API calls that return user-facing text.
- Send pagination/projection in the Inison-stringified **`options`** param (`{page, perPage, columns, sort}`)
  and filters in the Inison-stringified **`where`** param — endpoints are paginated (default 15 per page);
  there is no separate `page`/`perPage`/`limit`/`columns` query param.
- Never send a computed field's key in a create/update body, and never mix `computed` with
  `required`/`unique`/`regex` (§8).
- Writing dashboards, backups, domains, database export need the super-admin role (`idOne`); expect
  `accessDenied` otherwise (a real `403` on some routes, an error body elsewhere). Reading
  dashboards only needs a session.
- Custom table interfaces are **file-based**: put the page under `app/pages/admin/tables/<tableSlug>/`
  (no `[[database]]` segment, no `pages:extend` hook) and link to it with `tableUrl()` so non-ASCII
  slugs stay encoded (§15).
- When editing a table's schema or flows, send the **full** lists (merge first) — a partial `schema`
  replaces the whole column set, a partial `onRequest`/`onResponse` replaces all flows (§7.4, §9.5).
- Version: this context targets Nuxt 4 / Inicontent layer 1.1.0 on `inibase` 3.3+ (current generation).

---

## 17. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| HTTP 200 but nothing was returned | failures are reported in the body, not the status: `result: null` + a string `code` like `dbNotFound`, `accessDenied`, `notFound` — check `code`, not the HTTP status (§5.1) |
| `code: "dbNotFound"` on any data path | wrong/unknown database slug (the same body is returned for every route under it) |
| `code: "authRequired"` or empty `result` on `/auth/current` | wrong username/password, or the session param/cookie is missing |
| Empty/forbidden table reads | table `show` is false or `allowedMethods` lacks `r` |
| `{db}_sid` param ignored | session expired — re-run sign-in |
| Filters/pagination ignored | `options`/`where` must be **Inison-stringified + URL-encoded** (no plain JSON) — see §5.1/§6 |
| Only 15 rows, or `page=2` ignored | `perPage` defaults to **15**; plain `limit`/`page` top-level params are ignored (§5.1) |
| `/sum` returns `0` for an array column | pass the dotted path **and** `nested=true` (`columns=items.quantity`) — §5.6 |
| `paramsNotCorrect` on `/sum` | `columns` is missing or empty (it is the only required param) |
| `COMPUTED_FIELD_SETTABLE` on write | you sent a computed key; strip computed keys from the body (§8.5) |
| `COMPUTED_FIELD_CONFLICT` on schema save | the field also has `required`/`unique`/`regex` — remove them (§8.6) |
| `COMPUTED_FIELD_UNKNOWN_FIELD` / `SYNTAX` / `CYCLE` | wrong field id, malformed expression (`3.14` is a path, not a decimal), or fields depending on each other (§8.7) |
| `COMPUTED_FIELD_INVALID_TARGET` on a child field | a computed child must be `type: "number"`, reference only siblings of the same array, and use no helper functions (§8.4) |
| Computed value stale after changing the expression | it is backfilled on schema save; if the save failed, the old schema is still in place (check for a `COMPUTED_FIELD_*` error) |
| `missingLogId` / `noLogsFound` on `revert` | the table has no `config.log`, or the body/log id is wrong (§5.8) |
| WebSocket subscribes but no events arrive | `config.realtime` is off for that table, or the session in the upgrade request is missing/expired (§13) |
| WebSocket closes with `4403` | the session is not allowed to read that table (`allowedMethods`/flows) |
| `POST /assets/import` → `noStorageConfigured` | no S3/local storage configured for the deployment |
| Import/export → `unsupportedFormat` | only `.csv` and `.json` are supported; send the file name via `x-import-file-name` (§5.8) |
| MCP tool → `accessDenied` | remember the bearer/<db>_sid must map to an **admin session** for dashboard writes, backups, export, domains (§11) |
| `GET {db}/{table}/schema` → 404 | there is no GET on that path — read the schema from `GET inicontent/databases/{db}` (§10.1) |
| `/auth/signup` → 404 | signup is `POST {db}/users` (the in-app auth docs page is out of date) (§3.4) |
| A *successful* sign-in has a string `code` | `code: "loginSuccess"` — judge by `result`, not by `code` (§5.1) |
| `POST inicontent/databases/{slug}` → `emptyBody` | a body is required even though every field is optional — send at least `{}` (§10.8) |
| `POST inicontent/databases/{slug}` → `noActiveSubscription` | the account has no active paid plan; only the platform super-admin (`idOne`) bypasses this (§10.8) |
| `POST inicontent/databases/{slug}` → `databaseExist` | that slug is taken — pick another, or `DELETE` the old database first |
| Tenant call answers `accessDenied` on `inicontent/*` | you sent a `{db}_sid`; platform routes need `inicontent_sid` from `PUT inicontent/auth/signin` (§3.5) |
| `GET inicontent/databases` → `code: 404` | the account owns no databases — the route shifts off the platform meta row, so an empty list is a `404` body (§10.8) |
| New database's admin can't sign in | the admin user is seeded from the **platform** session's username/password/email — reuse the same credentials, the body cannot set them (§10.8) |
| Sent `isNew: true` on a table create and nothing happened | there is no such param; it is stored as junk on the table record. Omit `id` and let the server assign it (§7.4 rule 5) |
| Custom table page 404s / CMS screen still shows | the file must be at `app/pages/admin/tables/<tableSlug>/index.vue` — folder name exactly the table slug, **no** `[[database]]` segment, not at the repo root (§15) |
| Custom item page never opened by the CMS | the grid's *view* button only navigates to your page when `app/pages/admin/tables/<slug>/[id]/index.vue` exists; otherwise it falls back to the view drawer (§15) |
| Table update wiped some fields | the `schema` PUT replaces the whole field list — merge existing fields first (§7.4) |
| Schema PUT returned 200 but nothing changed | the table is `users`, `pages` or `blocks` and the new schema dropped a built-in key (`username`/`email`/`password`/`role`/`createdBy`, `slug`/`content`/`seo`, `name`/`config`/`hideOn`) — the update is silently skipped (§10.1) |
| Flow rule seems ignored | a false condition aborts the flow; `[null,null,null]` is a no-op; check field ids/keys against the schema (§9); super-admin sessions bypass flows entirely |
| Arabic/spaced slugs 404 | name the **folder** with the raw slug (no encoding), but encode the segment when you build links — use `tableUrl(slug, suffix)` from `useTableUrl()`; the router registers static pages under the percent-encoded spelling (§15) |
| Port 3434 already in use | `pnpm dev` binds 3434 by design (INIc binary); stop the other process |
| Session cookie missing in the browser | the SPA stores `{db}_sid` per database; check that cookie on API calls from `$fetch` |

---

## 18. Quick reference (env + endpoints cheatsheet)

```dotenv
# .env
database=myapp
# apiBase=https://api.inicontent.com/
# idOne=d7b3d61a582e53ee29b5a1d02a436d55
```

```text
Sign in      PUT  {apiBase}{db}/auth/signin                 {username,password}
Sign out     GET  {apiBase}{db}/auth/signout
Current      GET  {apiBase}{db}/auth/current                {db}_sid=<sid>
DB metadata  GET  {apiBase}inicontent/databases/{db}        {db}_sid=<sid>
List         GET  {apiBase}{db}/{table}?options={page,perPage,columns,sort}&where={...}&locale&{db}_sid
One          GET  {apiBase}{db}/{table}/{id}
Sum          GET  {apiBase}{db}/{table}/sum?columns=<col|nested.path>&nested=true&where={...}
Create       POST {apiBase}{db}/{table}                     → code 201
Update       PUT  {apiBase}{db}/{table}/{id}                (add ?return=false for `true`)
Delete       DELETE {apiBase}{db}/{table}/{id}              → code 204
Logs         GET  {apiBase}{db}/{table}/logs                (needs config.log)
Revert       POST {apiBase}{db}/{table}/{id}/revert         {logId}
Schedules    GET/POST {apiBase}{db}/{table}/schedules  ·  POST .../schedules/preview
             PUT/DELETE .../schedules/{id}  ·  POST .../schedules/{id}/run
Assets       POST {apiBase}{db}/assets  →  response.uploadURL  →  POST/PUT binary to uploadURL
Assets by URL POST {apiBase}{db}/assets/import               ["https://…"]
Asset folder POST {apiBase}{db}/assets/{folder}              (empty body → create folder; §5.7.4)
Asset read   GET  {apiBase}{db}/assets[/{folder}]            direct children only; options/where/locale
Asset rename POST {apiBase}{db}/assets/rename/{path}/{id}     {name} — moves the object, no re-upload (§5.7.5)
Asset delete DELETE {apiBase}{db}/assets/{id}                 file by id · folder by .../{folder}/{name}
Backups      GET/POST {apiBase}{db}/backups  ·  POST .../backups/{id}/restore {scope,confirm:true}
SEO          GET  {apiBase}{db}/seo/{sitemap.xml|robots.txt|feed.xml|schema.json}
Realtime     wss://{apiHost}/realtime  →  {"type":"subscribe","database","table"}
Flows        PUT  {apiBase}inicontent/databases/{db}/{table}   body {onRequest,onResponse}
New table    POST {apiBase}inicontent/databases/{db}/{table}   body {schema,config,icon,label}
Edit table   PUT  {apiBase}inicontent/databases/{db}/{table}   body {schema,onRequest,onResponse,...}
Delete table DELETE {apiBase}inicontent/databases/{db}/{table}
Item schema  POST/PUT {apiBase}{db}/{table}/schema            (no GET)
DB export    POST/GET {apiBase}inicontent/databases/{db}/export  ·  GET .../export/download
Domains      POST {apiBase}inicontent/databases/{db}/domains   {domainName}  ·  GET/DELETE .../domains/{name}
Email        POST {apiBase}inicontent/databases/{db}/email/{test|preview}

— platform scope (inicontent_sid, NOT {db}_sid — §3.5) —
Platform in  PUT  {apiBase}inicontent/auth/signin             {username,password} → code "loginSuccess"
Platform who GET  {apiBase}inicontent/auth/current            inicontent_sid=<sid>
Create DB    POST {apiBase}inicontent/databases/{slug}         body required ({} ok) {roles?,tables?} → code 201
DB list      GET  {apiBase}inicontent/databases               inicontent_sid=<sid> — 404 body when empty

Dashboards   GET/POST {apiBase}{db}/dashboards  ·  PUT/DELETE {apiBase}{db}/dashboards/{id}

MCP server   stdio: `inicontent-mcp`  ·  HTTP: `inicontent-mcp http` → http://127.0.0.1:3000/mcp
             bearer `Authorization: Bearer <db>:<sessionID>` (mint with `login --print-token`)
             tools & context resources listed in §11 (no `/ai` endpoints exist anymore)

Computed expression cheatsheet (ids, not keys — see §8)
  sum(count|avg|min|max)(expr)   iterate an array-of-objects column, per element
  + - * / %  and  ( )            arithmetic;  * / % bind tighter than + -
  3.4                             field 4 of the row linked by field 3 (must be type "table")
  314 / 100                       the number 3.14 — there are no decimal literals
  5 * 6                           field 5 × field 6 (any integer that matches a field id IS that field)
  Computed children: type "number", sibling references only, no helpers; aggregate with nested=true
```
