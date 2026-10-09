import { describe, expect, it } from 'vitest';
import {
    getDashboardModePath,
    getDashboardTabPath,
    getDashboardUrlIdentifier,
} from './tabUrl';

const DASHBOARD_UUID = '2f3c1c1e-6f0b-4a3e-9a51-0f6b0d6f6d11';
const DASHBOARD_SLUG = 'payments';

const tabPath = (routeDashboardUuidOrSlug: string | undefined) =>
    getDashboardTabPath({
        projectUrlIdentifier: 'jaffle-shop',
        dashboardUrlIdentifier: getDashboardUrlIdentifier({
            routeDashboardUuidOrSlug,
            dashboardSlug: DASHBOARD_SLUG,
        }),
        isEditMode: true,
        tabUuid: 'tab-2',
    });

describe('dashboard tab URLs', () => {
    it('keeps the uuid when the dashboard was opened by uuid', () => {
        expect(tabPath(DASHBOARD_UUID)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_UUID}/edit/tabs/tab-2`,
        );
    });

    it('keeps the slug when the dashboard was opened by slug', () => {
        expect(tabPath(DASHBOARD_SLUG)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/edit/tabs/tab-2`,
        );
    });

    it('falls back to the slug when the route has no dashboard param', () => {
        expect(tabPath(undefined)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/edit/tabs/tab-2`,
        );
    });

    it('builds the view mode path', () => {
        expect(
            getDashboardTabPath({
                projectUrlIdentifier: 'jaffle-shop',
                dashboardUrlIdentifier: DASHBOARD_UUID,
                isEditMode: false,
                tabUuid: 'tab-2',
            }),
        ).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_UUID}/view/tabs/tab-2`,
        );
    });
});

const modePath = (
    routeDashboardUuidOrSlug: string | undefined,
    isEditMode: boolean,
) =>
    getDashboardModePath({
        projectUrlIdentifier: 'jaffle-shop',
        dashboardUrlIdentifier: getDashboardUrlIdentifier({
            routeDashboardUuidOrSlug,
            dashboardSlug: DASHBOARD_SLUG,
        }),
        isEditMode,
    });

describe('dashboard mode URLs', () => {
    it('keeps the uuid when entering edit mode from a uuid URL', () => {
        expect(modePath(DASHBOARD_UUID, true)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_UUID}/edit`,
        );
    });

    it('keeps the uuid when returning to view mode from a uuid URL', () => {
        expect(modePath(DASHBOARD_UUID, false)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_UUID}/view`,
        );
    });

    it('keeps the slug when the dashboard was opened by slug', () => {
        expect(modePath(DASHBOARD_SLUG, true)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/edit`,
        );
        expect(modePath(DASHBOARD_SLUG, false)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/view`,
        );
    });

    it('falls back to the slug when the route has no dashboard param', () => {
        expect(modePath(undefined, false)).toBe(
            `/projects/jaffle-shop/dashboards/${DASHBOARD_SLUG}/view`,
        );
    });
});
