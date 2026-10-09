import { describe, expect, it } from 'vitest';
import { getDashboardTabPath, getDashboardUrlIdentifier } from './tabUrl';

const DASHBOARD_UUID = '2f3c1c1e-6f0b-4a3e-9a51-0f6b0d6f6d11';
const DASHBOARD_SLUG = 'payments';

const tabPath = (
    routeDashboardUuidOrSlug: string | undefined,
    isEditMode: boolean,
) =>
    getDashboardTabPath({
        projectUrlIdentifier: 'jaffle-shop',
        dashboardUrlIdentifier: getDashboardUrlIdentifier({
            routeDashboardUuidOrSlug,
            dashboardSlug: DASHBOARD_SLUG,
            isEditMode,
        }),
        isEditMode,
        tabUuid: 'tab-2',
    });

describe('dashboard tab URLs', () => {
    describe('in edit mode', () => {
        it('keeps the uuid when the dashboard was opened by uuid', () => {
            expect(tabPath(DASHBOARD_UUID, true)).toBe(
                `/projects/jaffle-shop/dashboards/${DASHBOARD_UUID}/edit/tabs/tab-2`,
            );
        });

        it('keeps the slug when the dashboard was opened by slug', () => {
            expect(tabPath(DASHBOARD_SLUG, true)).toBe(
                `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/edit/tabs/tab-2`,
            );
        });

        it('falls back to the slug when the route has no dashboard param', () => {
            expect(tabPath(undefined, true)).toBe(
                `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/edit/tabs/tab-2`,
            );
        });
    });

    describe('in view mode', () => {
        it('uses the slug when the dashboard was opened by uuid', () => {
            expect(tabPath(DASHBOARD_UUID, false)).toBe(
                `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/view/tabs/tab-2`,
            );
        });

        it('uses the slug when the dashboard was opened by slug', () => {
            expect(tabPath(DASHBOARD_SLUG, false)).toBe(
                `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/view/tabs/tab-2`,
            );
        });
    });
});
