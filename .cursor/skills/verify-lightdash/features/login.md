# Log in

Log in lets a seeded user reach the project home from a logged-out browser using email then password, and lets them log out again from the user menu.

## Sub-features

- `login-precheck` submits a work email and reveals the password field.
- `login-signin` authenticates with the seed password and lands on home.
- `login-already` redirects `/login` to home when a session already exists.
- `login-logout` signs out from the avatar menu and returns to `/login`.

## How to get to it (user POV)

- Open `${FRONTEND_URL}/login` while logged out.
- After a session exists, open `${FRONTEND_URL}/login` again (redirect).
- Open the user avatar in the top-right navbar and choose `Logout`.

## Driving it with agent-browser

Preconditions:

- Doctor is `READY:`.
- `AGENT_BROWSER_SESSION` is set. This session must not already be logged in for `login-precheck` / `login-signin`. If `Browse` is visible, run `login-logout` first.
- Evidence dir exists for this `VERIFY_RUN_ID`.

- **Open login.** `$AB open "${FRONTEND_URL}/login"` then `$AB snapshot -i`. Page shows `#lightdash-login-page` (or heading `Log in` / `Sign in`) and button `Continue`.
- **Precheck email.** `$AB find label "Work email" fill "demo@lightdash.com"` (or `Email address`). `$AB find role button click --name "Continue"`. `$AB wait --text "Password"`. `$AB snapshot -i`. Button `Sign in` is present.
- **Sign in.** `$AB find label "Password" fill "demo_password!"`. `$AB find role button click --name "Sign in"`. `$AB wait --text "David"` (or `Browse`). `$AB get url` is under `/projects/` (usually `/projects/3675b69e-8324-4110-bdca-059031aa8da3/home`).
- **Already authenticated.** `$AB open "${FRONTEND_URL}/login"`. `$AB wait --load networkidle`. `$AB get url` is not stuck on `/login` with the form.
- **Logout.** `$AB snapshot -i`. Click the user avatar (`DA` or avatar control). `$AB find role menuitem click --name "Logout"`. `$AB wait --url "**/login"`.
- **Proof.** `$AB snapshot -i > "${EVIDENCE_DIR}/login-home.aria.md"` and `$AB screenshot "${EVIDENCE_DIR}/login-home.png"` after sign-in. After logout, `login-form.aria.md` / `login-form.png`. `proof.md` names `login-signin` and the URL.

## Gotchas

- Login is two submits. Password is not mounted until after `Continue`.
- Layout A uses `Work email` + `Log in`; layout B uses `Email address` + `Sign in`. Both share `data-cy="signin-button"`.
- A reused `AGENT_BROWSER_SESSION` often starts already logged in. That proves `login-already`, not `login-signin`. Start a new session name for a logged-out proof.
- Demo mode auto-logs in; local seed is not demo mode. If the spinner never yields a form, doctor the API `mode` field.
- API `POST /api/v1/login` 200 is doctor-only. It is not UI proof.
- The split login layout’s left brand panel can intercept `find text` clicks. Prefer `snapshot -i` then `$AB click @eN` on the form refs, or `$AB find role button click --name "Continue"`.
- A toast `We are currently unable to reach the Lightdash server` means the Vite app cannot talk to the API (wrong proxy/port). Dismiss it only after doctoring `$API_URL`; do not treat a failed login as a UI bug.
