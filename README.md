# Tapeshwar Furniture Website

## Project layout

- `public/` contains public HTML pages and browser assets.
- `public/assets/images/` contains furniture, founder, aluminium, and woodwork photography.
- `public/assets/icons/` and `public/assets/logos/` contain the site's SVG and PNG marks.
- `server/` contains the Express application, API routes, authentication middleware, database module, and private admin views.
- `data/` contains the SQLite database created/used by the server.
- `tests/` contains the admin/enquiry integration workflow.
- `package.json` and `package-lock.json` remain at the project root. `node_modules/` is installed locally and ignored by Git.

## Run locally

Install dependencies with `npm install`, then start the site with `npm start` (or `npm run dev`).
The default address is `http://localhost:3000`. Set `PORT`, `SESSION_SECRET`, `ADMIN_EMAIL`, and
`ADMIN_PASSWORD` in `.env` for local configuration; do not commit `.env`.

The integration test in `tests/admin-workflow.test.js` expects the app to be running at
`http://localhost:3000` and uses the configured admin test account.

## Public pages and navigation

- `/` serves `public/index.html`.
- `/founder.html` serves the founder profile.
- `/furniture-products.html` serves the product catalogue.
- `/aluminium-work.html` serves the aluminium services page.

The home page's Services, Gallery, About, and Contact content currently exists as sections on
`/`; links to those sections intentionally remain anchors. The project does not currently contain
standalone `services.html`, `projects.html`, `about.html`, or `contact.html` pages. API endpoints
remain under `/api/`, and the admin UI remains protected at `/admin` and `/admin/dashboard`.
