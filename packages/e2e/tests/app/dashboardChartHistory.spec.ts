import {
    FeatureFlags,
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    type Page,
} from '../../support/test';

type HistoryResponse = {
    results: { history: Array<{ versionUuid: string }> };
};

const getFreshnessInset = (page: Page) =>
    page.getByRole('alert', { name: 'Data freshness' }).evaluate((notice) => {
        if (!notice.parentElement) throw new Error('Notice has no sidebar');
        const noticeBounds = notice.getBoundingClientRect();
        const sidebarBounds = notice.parentElement.getBoundingClientRect();
        return {
            bottomGap: sidebarBounds.bottom - noticeBounds.bottom,
            topGap: noticeBounds.top - sidebarBounds.top,
        };
    });

test.describe('Dashboard chart version history', () => {
    test('keeps the freshness notice inset while a long version list scrolls', async ({
        api,
        page,
    }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.route(
            `**/api/v2/feature-flag/${FeatureFlags.InDashboardChartEditor}`,
            (route) =>
                route.fulfill({
                    json: { status: 'ok', results: { enabled: true } },
                }),
        );
        await page.route('**/api/v1/saved/*/history', async (route) => {
            const response = await route.fetch();
            const body = (await response.json()) as HistoryResponse;
            const currentVersion = body.results.history[0];
            body.results.history = Array.from({ length: 50 }, (_, index) => ({
                ...currentVersion,
                versionUuid:
                    index === 0
                        ? currentVersion.versionUuid
                        : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            }));
            await route.fulfill({ response, json: body });
        });

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        await page
            .locator('a')
            .filter({ hasText: 'Jaffle dashboard' })
            .first()
            .click();
        await expect(page).toHaveURL(/\/dashboards\/[^/]+/);
        const dashboardPath = new URL(page.url()).pathname;

        const chartsResponse = await api.get(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        const charts =
            await json<ApiChartSummaryListResponse['results']>(chartsResponse);
        const chart = charts.find(
            ({ name }) =>
                name === 'How much revenue do we have per payment method?',
        );
        expect(chart, 'seeded revenue chart').toBeDefined();
        await page.goto(`${dashboardPath}?editChart=${chart?.uuid}`);

        await page.getByRole('button', { name: 'Chart actions' }).click();
        await page.getByRole('menuitem', { name: 'Version history' }).click();

        const assertFreshnessInset = async () => {
            await expect
                .poll(async () => {
                    const { bottomGap, topGap } = await getFreshnessInset(page);
                    return bottomGap >= 15 && topGap >= 0;
                })
                .toBe(true);
        };

        await assertFreshnessInset();
        const versions = page.getByRole('group', { name: 'Chart versions' });
        await expect
            .poll(() =>
                versions.evaluate(
                    (list) => list.scrollHeight > list.clientHeight,
                ),
            )
            .toBe(true);
        await versions.evaluate((list) =>
            list.scrollTo({ top: list.scrollHeight }),
        );
        await assertFreshnessInset();
    });
});
