# Repeatable onboarding testing

From the worktree root, with its app running:

```sh
pnpm dev:onboarding
```

Resets the dedicated `onboarding@lightdash.com` account and its organization,
then opens organization setup in a separate Chrome profile. Close that window
before running the command again. Jaffle Shop and other organizations stay intact.

The fixture starts with verified email, incomplete user setup, and no projects.
It exercises organization setup, warehouse connection, tools, and the homepage
setup guide against the real API.
Signup and email verification remain available as Storybook states.

Options:

```sh
pnpm dev:onboarding --resume   # open the existing journey without resetting
pnpm dev:onboarding --no-open  # reset without opening Chrome
```

For another browser, sign in at the worktree's `/login` with
`onboarding@lightdash.com` / `onboarding_password!`. Then open `/organization-setup`.
These are disposable local fixture credentials. The company domain lets a
configured Brandfetch integration detect a real brand during setup.

Configuration comes from `.env.development.local`, with `.env.development` and
`.env` as defaults. Both app and database must be on loopback; production mode
is rejected. Reset only targets the fixture's fixed user and organization UUIDs.

The normal first-project rules still apply: `new-onboarding` must be enabled.
The command does not override rollout flags or fabricate a completed setup step.
Browser state lives under `.humanlayer/onboarding-browser/` (ignored by Git).
