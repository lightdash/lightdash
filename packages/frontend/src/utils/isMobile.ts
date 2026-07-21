// Load-time viewport check used to pick the mobile vs. desktop route tree in
// App.tsx. Kept as a single shared const so anything gating desktop-only
// surfaces (e.g. the homepage builder / new onboarding) makes the same decision
// as the mounted routes. Evaluated once at page load, matching the routing.
export const IS_MOBILE = window.innerWidth < 768;
