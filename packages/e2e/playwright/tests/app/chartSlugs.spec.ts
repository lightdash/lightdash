import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../fixtures';

test.describe.skip('Chart Slugs', () => {
    // TODO: remove
    test.skip('Should access saved chart by slug instead of UUID', async ({
        adminPage: page,
    }) => {
        // Navigate to the chart list
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/saved`);

        // Find and click on a chart
        await page
            .locator('a')
            .filter({
                hasText:
                    'How much revenue do we have per payment method?',
            })
            .click();

        // Get the UUID from the URL
        const urlWithUuid = page.url();
        const uuidMatch = urlWithUuid.match(/\/saved\/([^/?]+)/);
        const chartUuid = uuidMatch ? uuidMatch[1] : '';
        expect(chartUuid).not.toBe('');

        // Now navigate to the chart using slug
        const slug = 'how-much-revenue-do-we-have-per-payment-method';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`,
        );

        // Verify the chart loads correctly
        await expect(
            page.getByText(
                'How much revenue do we have per payment method?',
            ),
        ).toBeVisible();

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Verify URL contains the slug
        await expect(page).toHaveURL(new RegExp(`/saved/${slug}`));

        // Verify chart renders
        await expect(page.locator('.echarts-for-react')).toHaveCount(1);
    });

    // TODO: remove
    test.skip('Should edit chart accessed by slug', async ({
        adminPage: page,
    }) => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`,
        );

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Click edit
        await page.getByText('Edit chart').click();

        // Wait for explorer to load
        await expect(page.getByText('Run query')).toBeVisible();

        // Verify we're in edit mode
        await expect(page).toHaveURL(/\/edit/);
    });

    // todo: move to api tests
    test.skip('Should access chart via API using slug', async ({
        adminPage: page,
    }) => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';

        // Test API endpoint with slug
        const response = await page.request.get(`/api/v1/saved/${slug}`);
        const body = await response.json();
        expect(response.status()).toBe(200);
        expect(body).toHaveProperty('status', 'ok');
        expect(body.results).toHaveProperty(
            'name',
            'How much revenue do we have per payment method?',
        );
        expect(body.results).toHaveProperty('slug', slug);
        expect(body.results).toHaveProperty('uuid');
        expect(body.results).toHaveProperty('metricQuery');
    });

    // todo: remove
    test.skip('Should handle invalid chart slug gracefully', async ({
        adminPage: page,
    }) => {
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/non-existent-chart-slug`,
        );

        // Should show an error message (either "Chart not found" or similar)
        await expect(
            page.getByText(/not found|does not exist/i),
        ).toBeVisible();
    });

    // todo: remove
    test.skip('Should run chart query using slug', async ({
        adminPage: page,
    }) => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`,
        );

        await expect(page.getByText('Loading chart')).toHaveCount(0);

        // Verify chart renders with data
        await expect(page.locator('.echarts-for-react')).toHaveCount(1);

        // Verify data in results table view
        await page.getByText('Results').click();

        // Should have payment method data
        await expect(page.getByText('credit_card')).toBeVisible();
        await expect(page.getByText('bank_transfer')).toBeVisible();
    });
});
