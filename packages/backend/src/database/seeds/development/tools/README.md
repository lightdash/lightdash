# Use the development fixtures

From this directory in a checkout with `@lightdash/common` built, run `node --import tsx named-session.ts https://lightdash--pr-N.lightdash.rainbowmachine.dev developer`. Replace `N` with the PR number. The other names are `admin`, `editor`, `viewer`, `second-admin` and `join-member`.

Each invocation verifies the login with `GET /api/v1/user` and returns paths to a curl cookie jar and browser storage state in a new private temporary directory. Remove that directory when finished. Use `admin` to read the Rainbow private dashboard. Use `second-admin` to read the second shop dashboard and its warehouse connections. The `join-member` account starts outside the organization and has a verified address on its allowed domain.

`filter-off.json` is the request body for the normal `POST /api/v1/embed/3675b69e-8324-4110-bdca-059031aa8da3/get-embed-url` endpoint. Send it with `Content-Type: application/json` and the admin jar on the same preview. The returned embed URL is private. Its dashboard has saved filters, with interactive filters disabled for this embed.
