# Roadmap board preview

Open `/dev/roadmap` on the Vite development server. The development-only preview uses an asynchronous mock API; it makes no Linear or central roadmap requests.

The main board mixes eligible project cards and loose followed tickets in their status columns. Project cards have a labeled header, an icon before the title, and a full-width overall-progress footer. Tickets use a compact layout with their type and ID above the title. Projects without followed tickets remain visible with no zero-following label. Clicking a project switches to a full ticket board, showing only tickets the current user follows. Back to roadmap restores the main board and its search. Tickets open the existing request-details modal. There is no project sidebar or separate Other requests section.

Project progress is supplied independently of the followed-ticket subset. The sample dashboard-filter project is 68% complete, has four followed tickets, and includes an unfollowed fixture that is excluded from the API response. Icon, stage, and progress metadata are synthetic preview inputs, not a live provider integration.

Use the scenario selector to review populated, empty, pending, error/retry, access-denied, removed-project, missing-title, pagination, and expiry behavior. Removed or blank-title projects' followed tickets become loose cards. Load more projects/tickets fetches bounded pages on demand. Expiry uses 12 seconds for review rather than the intended 10-minute production window. Storybook exposes the same scenarios under Roadmap / Project board.

For local comparison with the existing settings UI, `VITE_ROADMAP_MOCK_API=true` in `packages/frontend/.env.development.local` enables development-only fixtures in the legacy roadmap hook. Set `LIGHTDASH_ENABLE_FEATURE_FLAGS=organization-roadmap` (preserving other enabled flags) to expose the Roadmap settings entry. The Vite mock flag does not bypass production authorization or change production data.

## Integration handoff

The v2 contract and adapter remain groundwork; the preview is not connected to a production v2 backend. The live contract must supply project icon, overall progress and stage, plus authenticated user-following membership and counts. The mock uses the draft `ownRequestCount` field for followed-ticket counts; finalize that distinction before integration. Real follow management and design-partner writes are not implemented.

Preserve v1 compatibility and request visibility rules. Keep shared project data separate from private associations. Central support must precede the consuming instance deployment. No rollout is activated by this preview.
