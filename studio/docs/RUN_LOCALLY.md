# Running the studio on your own machine

Two routes. The second is the one every verification in this repository actually uses, so it is
the one to reach for if anything goes wrong with the first.

Either way you end up at **http://localhost:3000** with the full catalogue, working sign-in, the
customer portal, the sales workspace and the 3D fabric lab.

## Sign in as

| Role | Email | Password |
|---|---|---|
| Buyer (customer portal) | `buyer@example.com` | `poddar123` |
| Sales | `sales@poddarcreation.studio` | `poddar123` |
| Admin (staff hub, analytics, diagnostics) | `admin@poddarcreation.studio` | `poddar123` |

These are seed accounts. They exist only in a seeded database and are not present in a
production deploy.

---

## Route 1 — Docker (one command)

Needs Docker Desktop. Brings up Postgres, applies migrations, seeds the catalogue and starts
the app.

```bash
cp .env.example .env.production      # then set AUTH_SECRET to anything non-empty
echo 'POSTGRES_PASSWORD=poddar'   >> .env.production
# point the app at the compose database rather than localhost
sed -i '' 's|DATABASE_URL=.*|DATABASE_URL="postgresql://poddar:poddar@db:5432/poddar"|' .env.production

docker compose up -d
docker compose logs -f app
```

Open http://localhost:3000. `docker compose down -v` removes everything including the data.

> The Dockerfile and compose file were written against this codebase but **could not be built or
> run in the environment that produced them** — there is no Docker daemon there. They follow the
> standard multi-stage Next standalone pattern and the migration/seed ordering is deliberate,
> but treat the first `docker compose up` as the first real test. Route 2 has been run hundreds
> of times.

## Route 2 — Node and Postgres directly (verified)

Needs Node 22 and a Postgres 16 you can reach.

```bash
cd studio
npm install                       # postinstall runs `prisma generate`

cp .env.example .env              # DATABASE_URL must point at your Postgres
npm run db:deploy                 # apply migrations
npm run db:seed                   # catalogue, shades, seed accounts

npm run dev                       # http://localhost:3000
```

For the production build instead of dev:

```bash
npm run build
npm run start
```

### If something is wrong

```bash
npm run startup:check
```

Validates every environment variable, checks the database is reachable, confirms migrations are
applied and round-trips a file through storage. It says which of those failed rather than
leaving you with a stack trace, and its exit code distinguishes "misconfigured, do not start"
from "dependencies still coming up, retry".

## What to look at

- **/** — the studio. Enter the showroom, open any fabric: the Lab's stage is a real 3D render.
  Try the lighting rail (the shade genuinely shifts), the wind rail, Stretch, Shine, the garment
  dial, and the microscope at 500×.
- **Compare** — put three qualities in and they hang side by side under one light.
- **/portal** — sign in as the buyer: saved collections, quote tracking, recently viewed.
- **/admin** — sign in as admin: sales workspace, quote desk, analytics.
- **/admin/diagnostics** — health checks and the **3D readiness** panel, which reports what your
  actual GPU is doing.
- **A phone** — or a narrow browser window under 768px: the navigation becomes a bottom pill and
  search becomes an expanding icon in the corner.
