import {
    DASHBOARD_GRID_CLASS,
    SCREENSHOT_READY_INDICATOR_ID,
    SEED_PROJECT,
} from '@lightdash/common';
import { expect, test, type Page } from '@playwright/test';

const apiUrl = '/api/v1';
const readyIndicatorTimeout = 30_000;

const parseNamedResource = (value: unknown, index: number) => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('name' in value) ||
        typeof value.name !== 'string' ||
        !('uuid' in value) ||
        typeof value.uuid !== 'string'
    ) {
        throw new Error(`Invalid resource at results[${index}]`);
    }

    return { name: value.name, uuid: value.uuid };
};

const getResourceUuid = async (
    page: Page,
    resourceType: 'charts' | 'dashboards',
    name: string,
) => {
    const response = await page.request.get(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/${resourceType}`,
    );
    expect(response.ok(), `Failed to list ${resourceType}`).toBe(true);

    const body: unknown = await response.json();
    if (
        typeof body !== 'object' ||
        body === null ||
        !('results' in body) ||
        !Array.isArray(body.results)
    ) {
        throw new Error(`Invalid ${resourceType} response: missing results`);
    }

    const matches = body.results
        .map(parseNamedResource)
        .filter((resource) => resource.name === name);
    expect(
        matches,
        `Expected exactly one ${resourceType} result named "${name}"`,
    ).toHaveLength(1);

    const match = matches.at(0);
    if (match === undefined) {
        throw new Error(`Missing ${resourceType} result named "${name}"`);
    }

    return match.uuid;
};

const waitForReadyIndicator = async (page: Page) => {
    const indicator = page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`);
    await expect(indicator).toBeAttached({ timeout: readyIndicatorTimeout });
    return indicator;
};

test('I can view a minimal chart', async ({ page }) => {
    const chartUuid = await getResourceUuid(
        page,
        'charts',
        'How much revenue do we have per payment method?',
    );

    await page.goto(
        `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
    );
    await waitForReadyIndicator(page);

    const visualization = page.getByTestId('visualization');
    await expect(visualization).toBeVisible();
    await expect(visualization.locator('.echarts-for-react')).toBeAttached();
    await expect(
        visualization.getByText('Payment method', { exact: true }),
    ).toBeVisible();
    await expect(
        visualization.getByText('Total revenue', { exact: true }),
    ).toBeVisible();
});

test('I can view a minimal table', async ({ page }) => {
    const chartUuid = await getResourceUuid(
        page,
        'charts',
        'Which customers have not recently ordered an item?',
    );

    await page.goto(
        `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
    );
    await waitForReadyIndicator(page);

    const visualization = page.getByTestId('visualization');
    const table = visualization.getByRole('table');
    await expect(table).toHaveCount(1);
    await expect(
        table.getByText('Days between created and first order', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        table.getByText('Total revenue', { exact: true }),
    ).toBeVisible();
});

test('I can view a minimal big number', async ({ page }) => {
    const chartUuid = await getResourceUuid(
        page,
        'charts',
        `What's our total revenue to date?`,
    );

    await page.goto(
        `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
    );
    await waitForReadyIndicator(page);

    const visualization = page.getByTestId('visualization');
    await expect(
        visualization.getByText('Payments total revenue', { exact: true }),
    ).toBeVisible();
    await expect(visualization.getByTestId('big-number-value')).toContainText(
        '2,397',
    );
});

test('I can view a minimal dashboard', async ({ page }) => {
    await page.route('https://www.loom.com/**', (route) => route.abort());
    const dashboardUuid = await getResourceUuid(
        page,
        'dashboards',
        'Jaffle dashboard',
    );

    await page.goto(
        `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
    );
    await waitForReadyIndicator(page);

    const dashboard = page.locator(`.${DASHBOARD_GRID_CLASS}`);
    await expect(dashboard).toHaveCount(1);
    await expect(
        dashboard.getByText('Welcome to Lightdash!', { exact: true }),
    ).toBeVisible();
    await expect(
        dashboard.getByText(
            'Lightdash is an open source analytics for your dbt project.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(dashboard.getByTestId('big-number-value')).toContainText(
        '1,961.5',
    );
    await expect(
        dashboard.getByText(`What's the average spend per customer?`, {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        dashboard.getByText('Average order size', { exact: true }),
    ).toBeVisible();
    await expect(
        dashboard.getByText(
            'Which customers have not recently ordered an item?',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        dashboard.getByText('Days between created and first order', {
            exact: true,
        }),
    ).toBeVisible();
});

test('Screenshot ready indicator works with edge cases (orphan tiles, empty results, errors)', async ({
    page,
}) => {
    const edgeCasesDashboardUuid = '4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba';

    await page.goto(
        `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${edgeCasesDashboardUuid}`,
    );
    const indicator = await waitForReadyIndicator(page);

    await expect(indicator).toHaveCount(1);
    await expect(indicator).toHaveAttribute('data-tiles-total', '4');

    const tilesErrored = await indicator.getAttribute('data-tiles-errored');
    if (tilesErrored === null || !/^\d+$/.test(tilesErrored)) {
        throw new Error(
            `Expected numeric data-tiles-errored, received ${String(tilesErrored)}`,
        );
    }
    expect(Number(tilesErrored)).toBeGreaterThan(0);

    await expect(indicator).toHaveAttribute(
        'data-status',
        'completed-with-errors',
    );
});
