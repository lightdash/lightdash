/**
 * The files walkthrough generation and validation read besides the frontend
 * files that carry data-tour-* markers. CI validates a pull request strictly
 * when it changes one of them. Add a path here when a script starts reading
 * a new file. No imports: CI runs this before the workspace is built.
 *
 * Usage: pnpm scope-tours:inputs
 */

/** Routers a step's route is checked against. */
export const ROUTE_SOURCES = [
    'packages/frontend/src/Routes.tsx',
    'packages/frontend/src/ee/CommercialRoutes.tsx',
    // Settings pages nest their own routers under `/generalSettings/*`
    'packages/frontend/src/pages/Settings.tsx',
    'packages/frontend/src/components/Settings/ProjectSettings.tsx',
];

export const WALKTHROUGH_INPUTS = [
    'scripts/scope-tours',
    'packages/frontend/src/features/learn/sandboxLessons.ts',
    'packages/common/src/authorization',
    'packages/backend/assets/learn',
    ...ROUTE_SOURCES,
];

if (require.main === module) {
    process.stdout.write(`${WALKTHROUGH_INPUTS.join('\n')}\n`);
}
