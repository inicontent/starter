# Inicontent — AI Build Context

> Purpose: give an AI agent everything it needs to build apps on top of **Inicontent CMS**
> using the **[inicontent/starter](https://github.com/inicontent/starter)** project, including
> authenticated access to the user's database through the Inicontent REST API.

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
| Database engine | `inibase` (file-based, ACID, relational) |
| HTTPS public API | `https://api.inicontent.com/` |
| Query serialization | `inison` (compact string format used for `options` param) |

Key concepts:

- **Database** — every Inicontent project manages 1+ named databases, each identified by a **slug**
  (e.g. `myapp`). A DB is a set of **tables**.
- **Table** — collections of records (rows/items), each defined by a **schema** (list of fields).
- **Field / Schema** — the column/type definition of a table (string, number, email, password, table ref, arrays, objects, dates…).
- **Item / Row** — a single record in a table. Every item has an `id` and often `createdBy`, timestamps, etc.
- **Roles** — each user has a `role` id. The **super-admin role id** is `idOne`
  (default `d7b3d61a582e53ee29b5a1d02a436d55`); it gates dashboard/role-management features.
- **allowedMethods** — per-table permission string; letters `r` (read), `c` (create), `u` (update), `d` (delete).
  Respect it: a table with `allowedMethods: "r"` is read-only.
- **System tables** — almost every DB ships with `users`, `assets`, `translations`, `sessions`, `pages`, `blocks`, `templates`.
- **Flows** — per-table automation stored on the table as `onRequest`/`onResponse` rule arrays
  (validate/mutate incoming data or query filters, abort with an error, send emails) — see §8.
- **Locale** — the API accepts a `locale` param; supported values: `ar`, `en`, `fr`, `es`.

---

## 2. The starter project (`github.com/inicontent/starter`)

The starter is a minimal Nuxt app whose only job is to mount the Inicontent layer.

Its `nuxt.config.ts`:
```ts
export default defineNuxtConfig({
  compatibilityDate: 'latest',
  extends: [
    useLocalInicontent
      ? resolve(dirname(fileURLToPath(import.meta.url)), "../inicontent")
      : ["github:inicontent/inicontent", { install: true }],
  ],
})
```
- If a sibling folder `../inicontent` exists (a local clone of the CMS), it is used — good for local development.
- Otherwise it pulls the published `inicontent/inicontent` layer from GitHub.

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

- **Remove `app.vue`** so the layer's own `app.vue` is used (the starter has no `app.vue`).
- Add your own files under `pages/`: they **override** the CMS routes of the same name.
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

For every subsequent API call pass the session as a query parameter:
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
→ `{ "result": { "id": "...", "username": "...", ... } }` (or empty/401 when invalid).
Use this as a cheap "is my session alive?" check.

### 3.4 Other auth endpoints

| Action | Method & path | Body / notes |
| --- | --- | --- |
| Sign up | `POST {apiBase}{db}/users` | Create an item in the `users` table (include a role id, e.g. `b4694ff1f8c483824582c1e2dc75f0f9`). Only when the `users` table `allowedMethods` includes `c`. |
| Request password reset | `POST {apiBase}{db}/auth/reset` | `{ "email": "..." }` → emails a reset link. |
| Confirm password reset | `POST {apiBase}{db}/auth/reset` | `{ "token": "...", "password": "..." }` |
| Passkey sign-in begin | `PUT {apiBase}{db}/auth/passkey/authenticate/begin` | `{ "identifier": "..." }` |
| Passkey sign-in complete | `PUT {apiBase}{db}/auth/passkey/authenticate/complete` | challenge + `challengeRef` + credential |
| Passkey register begin/complete | `PUT {apiBase}{db}/auth/passkey/register/begin` & `/complete` | source: `"auth"` |

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
- `roles` — `[{ name, id }]`
- `tables` — array of `Table` objects:
  ```ts
  {
    slug: string;
    label?: string;
    icon?: string;
    allowedMethods?: string;     // "r" | "c" | "u" | "d" | combinations
    schema?: Schema;             // the field list (see §7)
    columns?: string[];
    displayAs?: "table" | "kanban" | "cards";
    groupBy?: string;
    show?: boolean;
    config?: { log?, realtime?, ... };
    defaultSearchableColumns?: number[];
    defaultTableColumns?: number[];
  }
  ```

> Note the metadata endpoint lives under the `inicontent` system slug, while data endpoints use the DB slug.
> - Metadata: `.../inicontent/databases/{db}`
> - Table data: `.../{db}/{tableSlug}`

---

## 5. REST API reference (table data)

Base pattern for all table operations:

```
https://api.inicontent.com/{databaseSlug}/{tableSlug}
```

All requests include the session param `{databaseSlug}_sid=<session-id>`.

### 5.1 List items

```
GET {apiBase}{db}/{table}?options={page:1,perPage:25,columns:[title],sort:{age:-1}}&where={and:{status:published}}&locale=en&{db}_sid=<sid>
```

Query params:

| Param | Description |
| --- | --- |
| `options` | **Inison-stringified** `{ page, perPage, columns, sort }` — ALL pagination/projection/sorting live here: `page` (1-based), `perPage` (page size; 25 is a safe default), `columns` (array of keys; prefix `!` to exclude), `sort` (a field name, an array, or an object like `{age:-1}`) |
| `where` | **Inison-stringified** Inibase criteria object, e.g. `{and:{status:published,tag:*news}}` (operators & grouping in §6) |
| `locale` | translation locale: `ar`, `en`, `fr`, `es` |
| `{db}_sid` | session id |

> `options` and `where` are serialized with `Inison.stringify(...)` and sent **URL-encoded** in the query string
> (use `encodeURIComponent`). Inison is a light JSON-like syntax **without quotes**:
> `{page:1,perPage:25,columns:[title,!password],sort:{age:-1}}` or `{and:{status:published}}`.
> There is **no separate `page`/`perPage`/`columns`/`sort` query param** — they all live inside `options`.

Response:
```json
{
  "result": [ /* Item[] */ ],
  "options": { "page": 1, "perPage": 25, "total": 42 },
  "message": "...",
  "code": 200
}
```

### 5.2 Get one item

```
GET {apiBase}{db}/{table}/{id}
```

### 5.3 Create item(s)

```
POST {apiBase}{db}/{table}
Body: { ... }            // single item
Body: [ { ... }, ... ]   // bulk array, also documented for assets
```

### 5.4 Update item

```
PUT {apiBase}{db}/{table}/{id}
Body: { "field": "new value", ... }
```

### 5.5 Delete item(s)

```
DELETE {apiBase}{db}/{table}/{id}        // single
DELETE {apiBase}{db}/{table}             // with body = array of ids for bulk
```

### 5.6 Assets (uploads are a two-step flow)

Assets live in the `assets` table; other tables reference them with `type: "table", table: "assets"`.

**Step 1 — Describe the file(s):**
```
POST {apiBase}{db}/assets                    // single file
POST {apiBase}{db}/assets/{folder}           // into a folder
Body: [ { "name": "logo.png", "size": 204800, "type": "image/png", "extension": "png" } ]
```
Each object requires `name`, `size`, `type` (MIME) and `extension`. Arrays are supported for multiple files at once.

**Response:** the API returns the same fields **plus** `id`, `createdAt`, `publicURL`, and — crucially — **`uploadURL`**.

**Step 2 — Upload the binary to the returned `uploadURL`:**
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

### 5.7 Table sub-resources

- Logs: `GET {apiBase}{db}/{table}/logs`
- Scheduled actions: `GET/POST {apiBase}{db}/{table}/schedules`, `.../schedules/preview`, `PUT/DELETE .../schedules/{id}`, `POST .../schedules/{id}/run`
- Import / Export (admin-only, long-running jobs): `{apiBase}inicontent/databases/{db}/{table}/import`, `.../export`, `.../export/download`

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

---

## 7. Table structure — schema & field types (read it, edit it, create it)

A table's structure is its **schema** — a `Schema` (that is `Field[]`). Read it from the DB
metadata (§4, `tables[*].schema`). You create/edit it with the **meta endpoints** (§9), or let the
platform AI design it (§9.3) using the rules below (§7.4).

### 7.1 The `Field` object

```ts
type Field = {
  key: string;                                  // field name (DB's primary language)
  type: "string" | "number" | "boolean" | "date" | "email" | "url"
      | "table" | "object" | "array" | "password" | "html" | "ip" | "json" | "id";
  subType?: "text" | "textarea" | "radio" | "checkbox" | "tags" | "color"
          | "select" | "role" | "icon" | "multiple" | "range" | "locale" | ...;
  required?: boolean;
  unique?: boolean | string;                    // string = grouped-uniqueness key, e.g. "nameCategoryGroup"
  options?: (string | number)[];                // choices for select/radio/checkbox/multiple...
  defaultValue?: unknown;
  table?: string;                               // target slug — REQUIRED on type "table" (and table-list arrays)
  children?: Children;                          // REQUIRED on type "array" / "object"
  date?: "datetime" | "daterange" | "month" | "year" | "week" | "quarter" | ...;
  min?: number;
  max?: number;
};
```

> Fields also carry a numeric `id` (assigned when the field is created) — flows reference fields
> by `id` or by `key` (§8).

### 7.2 `children` rules (array / object)

- `array` and `object` **must** have `children`; **no other type may**.
- `children` may be one of:
  - a list of type names: `["string", "number"]`
  - a single type name: `"email"`, `"string"`
  - an array of nested Field objects: `[{ key: "firstName", type: "string" }, ...]`
  - a relation list: `{ type: "array", children: "table", table: "users" }`
- `type: "table"` is a **single** relation — do NOT set `children`, only `table`.
- Any `children` that mention `table`/`id` require a matching `table` target.

### 7.3 Field types at a glance

| Type | Notes |
| --- | --- |
| `string` | plain text |
| `number` | numeric |
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

> When **creating** items, send plain values: strings for `select`/`radio`, arrays for
> `tags`/`checkbox`/`array-*`, IDs for `table` refs, objects/arrays for `object`/`array`.

### 7.4 Canonical schema rules (the same rules the platform AI uses — apply them when you design tables)

These come from the AI prompt embedded in the API (`{apiBase}{db}/ai/tables`, §9.3):

1. **Editing** an existing table → send the **full** schema (existing fields + new/modified ones).
   A partial `schema` **replaces** the whole field list on update — always merge first.
2. **`users` is a built-in system table.** Never propose a new users-equivalent table in any
   language (`users`, `utilisateurs`, `مستعملين`, `users_ar`, `customer_users`…). Reuse the
   `users` slug; if extra user fields are needed, **edit** the existing `users` table (keep its
   fields, add only what's missing). Use `label` for localized display text.
3. Audit fields `createdBy` / `updatedBy` → `{ type: "table", table: "users" }`.
4. New tables: `isNew: true`; edits: `isNew: false`.
5. Icons are **Tabler icon names** normalized to kebab-case (`building-store`) — tabler.io/icons.
6. Use the DB's **primary language** for table slugs, field keys, role names and labels.

### 7.5 Example — the default `users` table (real source)

```jsonc
[
  { "key": "username", "type": "string", "required": true },   // field id 1
  { "key": "password", "type": "password", "required": true }, // field id 2
  { "key": "email",    "type": "email",   "required": true },  // field id 3
  { "key": "role",     "type": "id", "subType": "role", "required": true }, // id 4
  { "key": "createdBy","type": "table", "table": "users" },    // id 5
]
```
(Default roles: 1 = admin, 2 = user, 3 = guest. The built-in flows use field ids: `@user.4`
= role, `@data.2` = password, `@data.5` = createdBy.)

---

## 8. Flows (data automation) — structure, edit, create

**Flows** are per-table automation scripts stored on the table object:

- `onRequest: FlowType[]` — run **before** the request is handled: validate/abort, mutate the
  incoming item (`@data`) or the query filters (`@where`), send emails.
- `onResponse: FlowType[]` — run on the outgoing data (e.g. hide a field).

### 8.1 `FlowType` — one flow = an array of rule tuples

Each **flow** is an array of `FlowType` rules executed in order. `[null, null, null]` is a no-op
placeholder. If a **condition** rule is false, the rest of that flow is skipped (the next flow starts).

| Rule | Shape | Effect |
| --- | --- | --- |
| Condition | `[path, operator, value]` | If the comparison fails → abort this flow (skip its remaining rules). |
| `set` | `["set", path, value]` | Write into the incoming item (`@data.…`) or the query filters (`@where.…`). |
| `unset` | `["unset", path]` or `["unset", [path, ...]]` | Remove a field from the item/filters; on `onResponse` it hides the field from the reply. |
| `error` | `["error", message]` | Abort the whole request with that error (e.g. `"accessDenied"` → 403). |
| `email` | `["email", to, templateName]` | Send a transactional email (template from the `templates` table; variables = record fields + `user_*`). |

### 8.2 Value & path sources (the `@` getters)

| Prefix | Resolves to |
| --- | --- |
| `@user.<FieldId>` | a field of the current authenticated user (per the `users` schema) |
| `@data.<FieldId>` | a field of the incoming item(s) |
| `@where.<FieldId>` | a field of the query filters — may index groups: `@where.or.0`, `@where.or.5` |
| `@method` | the current HTTP method (GET/POST/PUT/DELETE) |
| `@date.now` / `@date.tomorrow` / `@date.yesterday` | dynamic timestamps (usable as a `set` value) |

Fields can be referenced by **numeric field id** (`@data.4`) or by **key name** (`@data.role`).
A literal value (a plain string/number without `@`) is used as-is.

### 8.3 Operators (same as the `where` operators in §6)

`=` `!=` `*` (contains) `!*` `[]` (is one of) `![]` `>` `>=` `<` `<=`

### 8.4 Example — the built-in `users` flows (real source, numeric form)

```jsonc
// users.onRequest
[
  // Non-POST requires a signed-in user (role = field 4):
  [["@method","!=","POST"], ["@user.4","=",null], ["error","accessDenied"]],
  // Creating/updating: guests get role 2; others keep their role and stamp createdBy (field 5):
  [["@user.4","=",null], ["@method","[]",["POST","PUT"]], ["set","@data.4",2]],
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


### 8.5 Saving / creating flows

```
PUT {apiBase}inicontent/databases/{db}/{tableSlug}
Body: { "onRequest": <FlowType[]>, "onResponse": <FlowType[]> }
```
- The arrays **replace** the table's flows wholesale — send the full list (merge first).
- The editor UI shape is `[{ id, value: [{ id, value: [rule, ...] }] }]`; serialize each rule to a
  plain tuple before sending (as in §8.4).
- The same endpoint also updates schema/config (§9.1); the admin UI lives at
  `/admin/tables/{table}/flows`.
- Email templates come from the `templates` table; SMTP is configured in database settings.

---

## 9. Creating & editing tables, schemas and flows (meta endpoints)

These endpoints manage **structure** (not data). All require `{db}_sid=<sid>`; table
create/update/delete and database-level endpoints are reserved for the database owner/admin.

### 9.1 Table structure endpoints

| Action | Method & path | Body | Notes |
| --- | --- | --- | --- |
| Create table | `POST {apiBase}inicontent/databases/{db}/{newTableSlug}` | `{ schema, config?, label?, icon?, allowedMethods? }` | slug comes from the URL; id auto-assigned; `allowedMethods` defaults to `"crud"`; `config.log: true` also creates a `{table}/logs` table |
| Update table | `PUT {apiBase}inicontent/databases/{db}/{tableSlug}` | full table object: `{ ...existing, schema?, onRequest?, onResponse?, config?, label?, icon?, allowedMethods?, columns?, displayAs?, show?, slug? }` | `schema`, `onRequest`, `onResponse` **replace** wholesale — keep/default the rest; `slug` renames (blocked on `users`, `assets`, `pages`, `blocks`; PUT itself blocked on `sessions`/`translations`); toggling `config.log` creates/deletes the `{table}/logs` table |
| Delete table | `DELETE {apiBase}inicontent/databases/{db}/{tableSlug}` | — | blocked on `users`, `assets`, `pages`, `blocks`, `sessions`, `translations` |
| Create database | `POST {apiBase}inicontent/databases/{newDbSlug}` | `{ username, password, email, roles?, tables?, primaryColor?, ... }` | scaffolds the system tables + admin user and returns a session cookie |
| Update database | `PUT {apiBase}inicontent/databases/{db}` | `{ email?, roles?, slug?, primaryColor?, ... }` | `tables` is ignored here — change tables via the endpoints above |
| Item-form schema | `POST/PUT {apiBase}{db}/{table}/schema` | an item draft | runs the table's `onRequest` flows against schema+data → `{ schema, data, error }`; used by the CMS item editor for dynamic forms |

> **Workflow for editing a table's structure:** `GET {apiBase}inicontent/databases/{db}` → take the
> current `tables[*].schema` (and `onRequest`/`onResponse`) → merge your changes → `PUT` back the
> full objects.

### 9.2 Example — create a table, then update its flows

```bash
# 1) Create the table (schema is required)
curl -s -X POST "https://api.inicontent.com/inicontent/databases/myapp/orders?myapp_sid=<sid>" \
  -H "Content-Type: application/json" \
  -d '{"schema":[
         {"key":"number","type":"string","required":true},
         {"key":"total","type":"number"},
         {"key":"customer","type":"table","table":"users"},
         {"key":"status","type":"string","subType":"select",
          "options":["pending","paid","shipped"]}
       ],
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

### 9.3 AI assistance endpoints (the platform's built-in AI)

The CMS ships an AI assistant ("AI Assistant") with endpoints under `{apiBase}{db}/ai` (also
aliased at `{apiBase}inicontent/ai`). They require a session and are rate-limited. The **table**
endpoint embeds the canonical schema rules quoted in §7.4.

| Endpoint | Body | Response |
| --- | --- | --- |
| `POST {apiBase}{db}/ai` — router | `{ message }` | `{ action: "redirect", target: "tables" \| "pages" \| "data" \| "translate" \| "databases" }` or `{ action: "greeting" \| "rejected", message }` |
| `POST {apiBase}{db}/ai/tables` | `{ message, responseID?, existingTables? }` | `{ responseID, response }` — `response.action`: `clarification_needed` (`questions[]`), `tables_approval_pending` (`tables[]: { slug, icon, isNew, schema, demo[] }`), `roles_defined` (`roles[]: { role, permissions: [{ table, allowedMethods }] }`), `greeting`, `rejected`, `completed` |
| `PUT {apiBase}{db}/ai/tables` | `{ tables: [{ slug, schema?, icon?, label? }] }` | `{ results: [{ slug, action: "created" \| "updated", success, error? }], tables[] }` — applies approved schemas; system tables (users, sessions, assets, translations, pages, blocks, dashboards) are protected |
| `POST/PUT {apiBase}{db}/ai/data` | `{ message, responseID?, existingTables? }` | `data_approval_pending` with `items: [{ table, records[] }]` |
| `POST {apiBase}{db}/ai/pages` | `{ message, ... }` | generates page content/schemas (may fetch stock images) |
| `POST/PUT {apiBase}{db}/ai/translate` | translation request | translation flow |
| `POST {apiBase}{db}/ai/databases` | database request | database-scoped flow |

> Use these to design a database with the same conventions as the CMS's own assistant. After
> approval, apply the tables with `PUT .../ai/tables` (admin) — or replicate the returned table
> objects through §9.1 yourself.

---

## 10. Routing / admin surface

Routes provided by the layer (all under the optional `{databaseSlug}` segment).

When `database` is configured in `.env` (recommended), routes live at `/admin/...`.
When not configured, each database is namespaced: `/{databaseSlug}/admin/...`.

| Route | Purpose |
| --- | --- |
| `/admin` | table list / dashboard for the configured DB |
| `/admin/tables/{table}` | data grid for a table (search, filter, sort, paginate) |
| `/admin/tables/{table}/{id}` | view an item |
| `/admin/tables/{table}/{id}/edit` | edit an item |
| `/admin/api` | API documentation for your DB (also lists public read endpoints per table) |
| `/admin/api/tables/{table}` | per-table CRUD docs (JSON-LD endpoint map) |
| `/admin/settings` | database settings (SMTP, email test, etc.) |
| `/admin/dashboards`, `/admin/dashboards/{id}` | dashboards (super-admin) |
| `/auth` | login / signup |
| `/auth/reset` | password reset |
| `/api` | public read-only API overview (tables with `allowedMethods` containing `r` and `show !== false`) |

> In older builds the table routes used bare paths like `/admin/{table}`; the current convention
> (used by the layer and by the route examples below) is `/admin/tables/{table}`.

---

## 11. Building custom interfaces for tables — register each route in `nuxt.config.ts`

**Particularity:** when you build **custom interfaces** for tables (custom pages that override or
extend the CMS's per-table screens), those routes are **not auto-discovered from the `pages/` folder
alone**. You must **register every new route explicitly** inside `hooks["pages:extend"]` by pushing
route objects into Nuxt's `pages` array.

```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const useLocalInicontent = existsSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../inicontent"),
);

export default defineNuxtConfig({
  compatibilityDate: "latest",
  extends: [
    useLocalInicontent
      ? resolve(dirname(fileURLToPath(import.meta.url)), "../inicontent")
      : ["github:inicontent/inicontent", { install: true }],
  ],
  hooks: {
    "pages:extend"(pages) {
      pages.push(
        ...[
          {
            name: "urgences",                                    // unique route name
            path: "/admin/tables/urgences",                      // URL path
            file: "~/pages/admin/tables/urgences/index.vue",     // component file
          },
          {
            name: "traumatoA",
            path: "/admin/tables/traumatoA",
            file: "~/pages/admin/tables/traumatoA/index.vue",
          },
        ],
      );
    },
  },
});
```

### Route object fields

| Field | Value |
| --- | --- |
| `name` | Unique vue-router name. Use the table slug; for sub-routes append a suffix (`-settings`, `-new`, `-flows`, `-schedules`, `-id`). |
| `path` | URL path: `/admin/tables/{tableSlug}` for the table home; sub-routes: `/settings`, `/new`, `/flows`, `/schedules`, `/:id` (detail), `/:id/desc`, `/:id/edit`… |
| `file` | `~/pages/admin/tables/{tableSlug}/index.vue`. Dynamic segments map to folders: `:id` → `[id]`, so `path: "/admin/tables/مهام/:id"` → `file: "~/pages/admin/tables/مهام/[id]/index.vue"`. |

### Rules to follow

- **Every route must be explicitly pushed** — file-based scanning does **not** pick up per-table override pages.
- **Non-ASCII table slugs work verbatim** (Arabic examples below: `منتجات`, `عملاء`, `مخزون`, `مهام`, `طلبات`, …). Use the slug exactly as it appears in the database, including spaces (`طلبات الشراء`).
- **Build the standard sub-route set per table** and register the ones your app uses:
  `index`, `new`, `[{id}]` (detail), `[{id}]/desc`, `settings`, `flows`, `schedules`.
- **Unique `name` per route** — duplicate names silently drop routes. Note the detail page naming
  convention below: the plain table name is used for the index, and detail uses a `-id` suffix;
  a nested resource detail can use a `desc-` prefix.
- The same hook can **replace** a layer page instead of adding one, by overwriting an existing entry:
  ```ts
  pages[pages.findIndex(({ name }) => name === "database-admin")].file = resolve(currentDir, "app/pages/[[database]]/admin/index.vue");
  ```

### Example — ASCII slugs (hospital-style app)

```ts
{
  name: "urgences",
  path: "/admin/tables/urgences",
  file: "~/pages/admin/tables/urgences/index.vue",
},
{
  name: "traumatoA",
  path: "/admin/tables/traumatoA",
  file: "~/pages/admin/tables/traumatoA/index.vue",
},
```

### Example — Arabic slugs (commerce-style app)

```ts
{
  name: "منتجات",                                         // /admin/tables/منتجات
  path: "/admin/tables/منتجات",
  file: "~/pages/admin/tables/منتجات/index.vue",
},
{
  name: "desc-منتجات",                                    // nested detail: /admin/tables/منتجات/:id/desc
  path: "/admin/tables/منتجات/:id/desc",
  file: "~/pages/admin/tables/منتجات/[id]/desc.vue",
},
{
  name: "منتجات-settings",
  path: "/admin/tables/منتجات/settings",
  file: "~/pages/admin/tables/منتجات/settings.vue",
},
{
  name: "منتجات-new",
  path: "/admin/tables/منتجات/new",
  file: "~/pages/admin/tables/منتجات/new.vue",
},
{
  name: "منتجات-flows",
  path: "/admin/tables/منتجات/flows",
  file: "~/pages/admin/tables/منتجات/flows.vue",
},
{
  name: "مهام",
  path: "/admin/tables/مهام",
  file: "~/pages/admin/tables/مهام/index.vue",
},
{
  name: "مهام-id",                                        // detail: /admin/tables/مهام/:id
  path: "/admin/tables/مهام/:id",
  file: "~/pages/admin/tables/مهام/[id]/index.vue",
},
{
  name: "مهام-schedules",
  path: "/admin/tables/مهام/schedules",
  file: "~/pages/admin/tables/مهام/schedules.vue",
},
{
  name: "طلبات الشراء",                                   // slugs may contain spaces
  path: "/admin/tables/طلبات الشراء",
  file: "~/pages/admin/tables/طلبات الشراء/index.vue",
},
```

---

## 12. AI agent operating procedure (do this every time)

1. **Ask the user** for: database slug, username, password. (Never invent or guess them.)
2. **Authenticate** with `PUT {apiBase}{db}/auth/signin` → capture `result.sessionID`.
3. **Verify** the session with `GET {apiBase}{db}/auth/current`.
4. **Discover** the schema: `GET {apiBase}inicontent/databases/{db}` → read `tables[*].schema` (§7),
   `tables[*].onRequest/onResponse` flows (§8), `roles`, `allowedMethods`.
5. **Plan** the app/pages against the real table slugs, field names and flows found in step 4.
6. **Design structure when needed**: create/edit tables, schemas and flows via the meta endpoints
   (§9), following the canonical schema rules (§7.4); never create a second `users` table. Optionally
   use the platform AI to draft schemas (§9.3).
7. **Implement** the app on the starter project (Nuxt layer pattern; register custom table pages in
   `hooks["pages:extend"]` per §11; pages override CMS routes).
8. **Verify** your work by reading data back through the same API with the session id.

### Hard rules

- Never log, echo, or store plaintext passwords; use env vars (`INICONTENT_USERNAME`, `INICONTENT_PASSWORD`).
- Always attach `{db}_sid=<session>` to data requests; a missing/invalid session yields 401/empty results.
- Respect `allowedMethods` per table (`r/c/u/d`) and `show` flags.
- Set a `locale` (`en` by default) on API calls that return user-facing text.
- Send pagination/projection in the Inison-stringified **`options`** param (`{page, perPage, columns, sort}`)
  and filters in the Inison-stringified **`where`** param — endpoints are paginated; there is no separate
  `page`/`perPage` query param.
- Custom table interfaces must be registered in `nuxt.config.ts` via `pages:extend` (§11).
- When editing a table's schema or flows, send the **full** lists (merge first) — a partial `schema`
  replaces the whole column set, a partial `onRequest`/`onResponse` replaces all flows (§7.4, §8.5).
- Version: this context targets Nuxt 4 / Inicontent layer from `github:inicontent/inicontent` (current generation).

---

## 13. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `401` / empty `result` on `/auth/current` | wrong username/password, or session not passed |
| `404` on `inicontent/databases/{db}` | wrong database slug |
| Empty/forbidden table reads | table `show` is false or `allowedMethods` lacks `r` |
| `{db}_sid` param ignored | session expired — re-run sign-in |
| Filters/pagination ignored | `options`/`where` must be **Inison-stringified + URL-encoded** (no plain JSON) — see §5.1/§6 |
| Asset upload fails / no `uploadURL` | two-step flow: first `POST /assets` describes the file, then POST the binary to the returned `uploadURL`; custom endpoints must pass `publicURL` up-front (§5.6) |
| Custom table page 404s | route not registered in `hooks["pages:extend"]` (§11) or `name` duplicated |
| Table update wiped some fields | the `schema` PUT replaces the whole field list — merge existing fields first (§7.4) |
| Flow rule seems ignored | a false condition aborts the flow; `[null,null,null]` is a no-op; check field ids/keys against the schema (§8) |
| `PUT {db}/ai/tables` → 403 | applying AI tables requires the DB owner/admin role (`idOne`) |
| Arabic/spaced slugs 404 | push entries verbatim — do not URL-encode the `path`/`name`; encode only when navigating via links |
| Local dev runs, prod build pulls layer twice | ensure exactly one `extends` entry resolves (local `../inicontent` folder overrides GitHub source) |
| Port 3434 already in use | `pnpm dev` binds 3434 by design (INIc binary); stop the other process |
| RSS of session cookie missing in browser | the SPA stores `{db}_sid` per database; check that cookie on API calls from `$fetch` |

---

## 14. Quick reference (env + endpoints cheatsheet)

```dotenv
# .env
database=myapp
# apiBase=https://api.inicontent.com/
# idOne=d7b3d61a582e53ee29b5a1d02a436d55
```

```text
Sign in      PUT  {apiBase}{db}/auth/signin                 {username,password}
Current      GET  {apiBase}{db}/auth/current                {db}_sid=<sid>
DB metadata  GET  {apiBase}inicontent/databases/{db}        {db}_sid=<sid>
List         GET  {apiBase}{db}/{table}?options={page,perPage,columns,sort}&where={...}&locale&{db}_sid
One          GET  {apiBase}{db}/{table}/{id}
Create       POST {apiBase}{db}/{table}
Update       PUT  {apiBase}{db}/{table}/{id}
Delete       DELETE {apiBase}{db}/{table}/{id}
Assets       POST {apiBase}{db}/assets  →  response.uploadURL  →  POST/PUT binary to uploadURL
Flows        PUT  {apiBase}inicontent/databases/{db}/{table}   body {onRequest,onResponse}
New table    POST {apiBase}inicontent/databases/{db}/{table}   body {schema,icon,label}
Edit table   PUT  {apiBase}inicontent/databases/{db}/{table}   body {schema,onRequest,onResponse,...}
Delete table DELETE {apiBase}inicontent/databases/{db}/{table}
AI draft     POST {apiBase}{db}/ai/tables                      → tables_approval_pending
AI apply     PUT  {apiBase}{db}/ai/tables                      (admin only)

Custom table routes (register each explicitly)
  index      { path: "/admin/tables/{table}",            file: "~/pages/admin/tables/{table}/index.vue" }
  new        { path: "/admin/tables/{table}/new",        file: "~/pages/admin/tables/{table}/new.vue" }
  detail     { path: "/admin/tables/{table}/:id",        file: "~/pages/admin/tables/{table}/[id]/index.vue" }
  desc       { path: "/admin/tables/{table}/:id/desc",   file: "~/pages/admin/tables/{table}/[id]/desc.vue" }
  settings   { path: "/admin/tables/{table}/settings",   file: "~/pages/admin/tables/{table}/settings.vue" }
  flows      { path: "/admin/tables/{table}/flows",      file: "~/pages/admin/tables/{table}/flows.vue" }
  schedules  { path: "/admin/tables/{table}/schedules",  file: "~/pages/admin/tables/{table}/schedules.vue" }
```