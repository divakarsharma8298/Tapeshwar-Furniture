# Tapeshwar Furniture Website

## Project layout

- The four public HTML pages (`index.html`, `founder.html`, `furniture-products.html`, and `aluminium-work.html`) are at the project root for Live Server and GitHub Pages.
- `assets/images/` contains furniture, founder, aluminium, and woodwork photography.
- `assets/icons/` and `assets/logos/` contain the site's SVG and PNG marks.
- `server/` contains the Express application, API routes, authentication middleware, database module, and private admin views.
- `data/` contains the SQLite database created/used by the server.
- `tests/` contains the admin/enquiry integration workflow.
- `package.json` and `package-lock.json` remain at the project root. `node_modules/` is installed locally and ignored by Git.

## Run locally (Windows PowerShell)

From the project root, run:

```powershell
npm install
Copy-Item .env.example .env
$secret = node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
(Get-Content .env) -replace '^SESSION_SECRET=.*$', "SESSION_SECRET=$secret" | Set-Content .env
Remove-Variable secret
notepad .env
```

In Notepad, set a valid `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters.
Keep `.env` private and uncommitted. The session secret is generated locally; never paste it into
source code or share it. The server refuses to start if required settings are missing or invalid.

Validate your environment before starting the app:

```powershell
npm run validate
```

Then start the server:

```powershell
npm start
```

On its first start, the server initializes the SQLite schema and creates the initial admin account
from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. On later starts, if that email already exists,
its password hash is synchronized to the configured password; changing the email creates another
admin account and does not remove the old one. Passwords are stored as bcrypt hashes. Login attempts
are rate-limited, and authenticated sessions use a SQLite-backed store.

Open the admin login at <http://localhost:3000/admin/login>. Leave the server running in this
terminal. In a second terminal at the project root, run the integration suite:

```powershell
npm test
```

The tests use the configured admin credentials and the running server at `http://localhost:3000`.

Product records, website intro content, and enquiries are stored in `data/tapeshwar-furniture.db`.
Admin session cookies are HTTP-only and use `SameSite=Lax` (and `Secure` in production).
The database, sessions, and uploads persist on the server's filesystem; production hosts must provide
persistent storage (or the site will lose this data when an ephemeral instance is replaced).
The original catalogue's eight demo listings are carried into SQLite on first startup and remain
marked as demos. They remain visible in the catalogue, but are excluded from the dashboard's product
total until an admin converts them into real listings. Product and founder portrait uploads accept
JPEG, PNG, WebP or GIF files up to 5 MB and are stored under `assets/uploads/`. The founder's
displayed name remains Tapeshwar Thakur.

Set `NODE_ENV=production` when deploying behind HTTPS. The integration test in
`tests/admin-workflow.test.js` expects the app to be running at `http://localhost:3000` and uses the
configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Deploy to Render

This project is ready for a simple Node.js deployment on Render.

1. Create a new `Web Service` on Render and connect this repository.
2. Set the runtime environment variables in Render:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<strong 32+ character secret>`
   - `ADMIN_EMAIL=<admin email>`
   - `ADMIN_PASSWORD=<strong admin password>`
   - `DATA_DIR=/var/data`
   - `UPLOADS_DIR=/var/data/uploads`
   - `DATABASE_PATH=/var/data/tapeshwar-furniture.db`
   - `SESSION_DB_PATH=/var/data/sessions.sqlite`
3. Ensure the Render service has a persistent disk mounted at `/var/data` so the SQLite database and uploaded files survive deploys and restarts.
4. Use the default build command: `npm install`
5. Use the default start command: `npm start`

The included `render.yaml` file configures the same settings for a Render deployment.

## Public pages and navigation

- `/` serves the root `index.html`.
- `/founder.html` serves the founder profile.
- `/furniture-products.html` serves the product catalogue.
- `/aluminium-work.html` serves the aluminium services page.

Page and asset links use relative paths so the site also works when GitHub Pages publishes it
under the repository path `/Tapeshwar-Furniture/`. To enable GitHub Pages, select the `main`
branch and `/ (root)` as the publishing source in the repository's **Settings → Pages**.

The Express server enables the admin dashboard, persistent product changes, product-image uploads,
website intro/founder profile content, founder portrait uploads, and enquiry form submissions.
Product categories are managed alongside their products. When the public catalogue is hosted as
static files (for example on GitHub Pages), it keeps the original demo catalogue; it can display
admin-managed products and content only when served with the Express API. Other homepage and founder
story sections remain hand-edited static content.

The home page's Services, Gallery, About, and Contact content currently exists as sections on
`/`; links to those sections intentionally remain anchors. The project does not currently contain
standalone `services.html`, `projects.html`, `about.html`, or `contact.html` pages. API endpoints
remain under `/api/`, and the admin UI remains protected at `/admin` and `/admin/dashboard`.
