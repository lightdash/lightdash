import { SCREENSHOT_READY_INDICATOR_ID, SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

const apiUrl = '/api/v1';

test.describe('Minimal pages', () => {
    test('I can view a minimal chart', async ({ adminPage: page }) => {
        const response = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        const body = await response.json();
        const savedChart = body.results.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) =>
                s.name === 'How much revenue do we have per payment method?',
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
        );

        await expect(page.locator('.echarts-for-react')).toBeVisible();
        await expect(page.getByText('Payment method')).toBeVisible();
        await expect(page.getByText('Total revenue')).toBeVisible();
    });

    test('I can view a minimal table', async ({ adminPage: page }) => {
        const response = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        const body = await response.json();
        const savedChart = body.results.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) =>
                s.name === 'Which customers have not recently ordered an item?',
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
        );

        const table = page.locator('table');
        await expect(
            table.getByText('Days between created and first order'),
        ).toBeVisible();
        await expect(table.getByText('Total revenue')).toBeVisible();
    });

    test('I can view a minimal big number', async ({ adminPage: page }) => {
        const response = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        const body = await response.json();
        const savedChart = body.results.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) => s.name === `What's our total revenue to date?`,
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
        );

        await expect(page.getByText('Payments total revenue')).toBeVisible();
        await expect(page.getByTestId('big-number-value')).toContainText(
            '2,397',
        );
    });

    test('I can view a minimal dashboard', async ({ adminPage: page }) => {
        const response = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        );
        const body = await response.json();
        const dashboard = body.results.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) => s.name === `Jaffle dashboard`,
        );

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard.uuid}`,
        );

        await expect(page.getByText('Welcome to Lightdash!')).toBeVisible();
        await expect(
            page.getByText(
                'Lightdash is an open source analytics for your dbt project.',
            ),
        ).toBeVisible();

        await expect(page.getByTestId('big-number-value')).toContainText(
            '1,961.5',
        );

        await expect(
            page.getByText(`What's the average spend per customer?`),
        ).toBeVisible();
        await expect(page.getByText('Average order size')).toBeVisible();

        await expect(
            page.getByText(
                'Which customers have not recently ordered an item?',
            ),
        ).toBeVisible();
        await expect(
            page.getByText('Days between created and first order'),
        ).toBeVisible();
    });

    test('Screenshot ready indicator works with edge cases (orphan tiles, empty results, errors)', async ({
        adminPage: page,
    }) => {
        // Uses hardcoded dashboard from seed: 08_scheduled_delivery_edge_cases_dashboard.ts
        // Contains: 1 bar chart, 1 orphan tile, 1 empty results table, 1 table with invalid metric
        const edgeCasesDashboardUuid = '4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba';

        await page.goto(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${edgeCasesDashboardUuid}`,
        );

        // Wait for screenshot ready indicator to appear (max 30s for slow queries)
        const indicator = page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`);
        await expect(indicator).toBeVisible({ timeout: 30000 });

        // Verify the indicator has expected data attributes
        await expect(indicator).toHaveAttribute('data-tiles-total', '4');

        // Should have some errored tiles (orphan + invalid metric)
        const errored = await indicator.getAttribute('data-tiles-errored');
        expect(Number(errored)).toBeGreaterThan(0);

        // Verify status is completed-with-errors (due to orphan/error tiles)
        await expect(indicator).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
    });
});
