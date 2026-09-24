import type { APIRequestContext } from 'playwright/test';
import type { LightdashApi } from './api';
import { test } from './fixtures';
import { isFeatureFlagEnabled } from './flags';

// Tier 5 preconditions. Each check only reads, so a skipped test has created
// nothing.

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const requireDataApps = async (api: LightdashApi) =>
    test.skip(
        !(await isFeatureFlagEnabled(api, 'enable-data-apps')),
        'data apps are off: start the backend with APPS_RUNTIME_ENABLED=true',
    );

/**
 * The app runtime's preview router is mounted only when app-runtime S3 is
 * configured (APPS_S3_* or the base S3_* settings); it redirects this route.
 */
const isAppRuntimeMounted = async (request: APIRequestContext) =>
    (
        await request.fetch(`/api/apps/${NIL_UUID}/versions/1/t/probe`, {
            maxRedirects: 0,
        })
    ).status() === 302;

export const requireAppRuntime = async (api: LightdashApi) =>
    test.skip(
        !(await isAppRuntimeMounted(api.request)),
        'the app runtime is not mounted: configure app-runtime S3 (S3_* or APPS_S3_*)',
    );
