import { describe, expect, it } from 'vitest';
import { isSameDashboardRoute } from './dashboardRoutes';

const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
const PROJECT_SLUG = 'jaffle-shop';
const DASHBOARD_UUID = 'a9d63dcf-81de-4a1b-9dae-97cd94917d7a';
const DASHBOARD_SLUG = 'revenue';

const check = (pathname: string) =>
    isSameDashboardRoute({
        location: { pathname },
        projectUuid: PROJECT_UUID,
        projectSlug: PROJECT_SLUG,
        dashboardUuid: DASHBOARD_UUID,
        dashboardSlug: DASHBOARD_SLUG,
    });

describe('isSameDashboardRoute', () => {
    it('matches a slug URL', () => {
        expect(
            check(
                `/projects/${PROJECT_SLUG}/dashboards/${DASHBOARD_SLUG}/edit`,
            ),
        ).toBe(true);
    });

    it('matches a uuid URL', () => {
        expect(
            check(
                `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/edit`,
            ),
        ).toBe(true);
    });

    it('matches a uuid project with a slug dashboard', () => {
        expect(
            check(
                `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_SLUG}/edit`,
            ),
        ).toBe(true);
    });

    it('matches a slug project with a uuid dashboard', () => {
        expect(
            check(
                `/projects/${PROJECT_SLUG}/dashboards/${DASHBOARD_UUID}/edit`,
            ),
        ).toBe(true);
    });

    it('matches with a trailing tab segment', () => {
        expect(
            check(
                `/projects/${PROJECT_SLUG}/dashboards/${DASHBOARD_SLUG}/edit/tabs/abc`,
            ),
        ).toBe(true);
    });

    it('matches without a trailing mode segment', () => {
        expect(
            check(`/projects/${PROJECT_SLUG}/dashboards/${DASHBOARD_SLUG}`),
        ).toBe(true);
    });

    it('does not match another project with the same dashboard slug', () => {
        expect(
            check(`/projects/other-project/dashboards/${DASHBOARD_SLUG}/view`),
        ).toBe(false);
    });

    it('does not match a dashboard slug that merely starts with this one', () => {
        expect(
            check(
                `/projects/${PROJECT_SLUG}/dashboards/${DASHBOARD_SLUG}-2/edit`,
            ),
        ).toBe(false);
    });

    it('does not match a project slug that merely starts with this one', () => {
        expect(
            check(
                `/projects/${PROJECT_SLUG}-staging/dashboards/${DASHBOARD_SLUG}/edit`,
            ),
        ).toBe(false);
    });

    it('does not match a different dashboard in the same project', () => {
        expect(
            check(`/projects/${PROJECT_SLUG}/dashboards/other-dashboard/edit`),
        ).toBe(false);
    });

    it('does not match a non-dashboard route', () => {
        expect(check(`/projects/${PROJECT_SLUG}/tables`)).toBe(false);
    });

    it('does not match when the dashboard segment is absent', () => {
        expect(check(`/projects/${PROJECT_SLUG}/dashboards`)).toBe(false);
    });

    it('does not match a bare path', () => {
        expect(check('/')).toBe(false);
    });

    it('does not match a missing segment against undefined identifiers', () => {
        // Identifiers are undefined while the dashboard loads; a malformed
        // path must not match by both sides being absent.
        expect(
            isSameDashboardRoute({
                location: { pathname: '/' },
                projectUuid: undefined,
                dashboardUuid: undefined,
            }),
        ).toBe(false);
    });
});
