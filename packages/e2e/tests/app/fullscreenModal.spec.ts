import {
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
    type Page,
} from '../../support/test';

const CHART_NAME = "What's our total revenue to date?";

const openUnderlyingDataModal = async (
    page: Page,
    api: TrackedApi,
    viewportHeight: number,
) => {
    await page.setViewportSize({ width: 1280, height: viewportHeight });
    const chartsResponse = await api.get(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
    );
    expect(chartsResponse.status()).toBe(200);
    const charts =
        await json<ApiChartSummaryListResponse['results']>(chartsResponse);
    const chart = charts.find(({ name }) => name === CHART_NAME);
    expect(chart, `seeded chart "${CHART_NAME}"`).toBeDefined();

    await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/saved/${chart?.uuid}`,
    );

    await page.getByText('Results').first().click();
    await expect(page.getByText('Loading chart', { exact: true })).toHaveCount(
        0,
    );
    await page.getByTestId('big-number-value').click();
    await page.getByRole('menuitem', { name: 'View underlying data' }).click();
};

test.describe('Fullscreen modal', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    for (const viewportHeight of [720, 1234]) {
        test(`keeps underlying data below the navbar at ${viewportHeight}px`, async ({
            page,
            api,
        }) => {
            await openUnderlyingDataModal(page, api, viewportHeight);

            const modal = page.locator('section[role="dialog"]');
            await expect(modal).toBeVisible();
            await expect
                .poll(() =>
                    modal.evaluate((modalElement) => {
                        const rect = modalElement.getBoundingClientRect();
                        const navbar = document.querySelector('#navbar-header');
                        if (!navbar) throw new Error('Navbar not found');
                        return {
                            topGap:
                                rect.top -
                                navbar.getBoundingClientRect().bottom,
                            bottomGap: window.innerHeight - rect.bottom,
                            left: rect.left,
                            rightGap: window.innerWidth - rect.right,
                        };
                    }),
                )
                .toEqual({ topGap: 24, bottomGap: 24, left: 24, rightGap: 24 });

            await page.getByRole('button', { name: 'Close' }).click();
            await expect(modal).toHaveCount(0);
        });
    }
});
