import {
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
    type ApiGetDashboardsResponse,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    type Page,
} from '../../support/test';

// Returns every layout violation in the page header; an empty list means it fits.
const getHeaderViolations = (page: Page) =>
    page.getByTestId('page-header').evaluate((header) => {
        const violations: string[] = [];
        const bounds = header.getBoundingClientRect();
        if (bounds.left < 0) violations.push('header left < 0');
        if (bounds.right > window.innerWidth)
            violations.push('header right > viewport');
        if (bounds.top < 0) violations.push('header top < 0');
        if (bounds.bottom > window.innerHeight)
            violations.push('header bottom > viewport');
        const controls = [...header.querySelectorAll('button')]
            .filter(
                (button) =>
                    button.checkVisibility({ visibilityProperty: true }) &&
                    button.offsetWidth > 0 &&
                    button.offsetHeight > 0,
            )
            .map((button) => button.getBoundingClientRect());
        if (controls.length === 0) violations.push('no visible controls');
        controls.forEach((control, index) => {
            if (control.left < bounds.left)
                violations.push(`control ${index} left`);
            if (control.right > bounds.right)
                violations.push(`control ${index} right`);
            if (control.top < bounds.top)
                violations.push(`control ${index} top`);
            if (control.bottom > bounds.bottom)
                violations.push(`control ${index} bottom`);
            if (control.height > 48) violations.push(`control ${index} height`);
            controls.slice(index + 1).forEach((other, offset) => {
                const overlapWidth =
                    Math.min(control.right, other.right) -
                    Math.max(control.left, other.left);
                const overlapHeight =
                    Math.min(control.bottom, other.bottom) -
                    Math.max(control.top, other.top);
                if (overlapWidth > 1 && overlapHeight > 1)
                    violations.push(
                        `header controls must not overlap: ${index} and ${index + offset + 1}`,
                    );
            });
        });
        return violations;
    });

const assertHeaderFits = async (page: Page) => {
    await expect.poll(() => getHeaderViolations(page)).toEqual([]);
};

const scrollToTop = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));

test.describe('Responsive content headers', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('keeps chart actions reachable and the viewer URL unchanged through resize', async ({
        page,
        api,
    }) => {
        const chartsResponse = await api.get(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        const charts =
            await json<ApiChartSummaryListResponse['results']>(chartsResponse);
        const chart = charts.find(
            ({ name }) => name === "What's our total revenue to date?",
        );
        expect(chart, 'seeded chart').toBeDefined();
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${chart?.uuid}`,
        );
        await expect(
            page.getByRole('button', { name: 'Chart actions' }),
        ).toBeVisible();
        const viewerPath = new URL(page.url()).pathname;
        for (const width of [1280, 744, 640, 639, 390, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            await scrollToTop(page);
            await assertHeaderFits(page);
            expect(new URL(page.url()).pathname).toBe(viewerPath);
            await page.getByRole('button', { name: 'Chart actions' }).click();
            await expect(
                page.getByRole('menuitem', { name: 'Version history' }),
            ).toBeVisible();
            if (width < 640) {
                await expect(
                    page.getByRole('menuitem', { name: 'Edit chart' }),
                ).toBeVisible();
            } else {
                await expect(
                    page.getByRole('button', { name: 'Edit chart' }),
                ).toBeVisible();
            }
            await page.keyboard.press('Escape');
        }
    });

    test('keeps the dashboard menu open and preserves an unsaved details draft through resize', async ({
        page,
        api,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const dashboardsResponse = await api.get(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        );
        const dashboards =
            await json<ApiGetDashboardsResponse['results']>(dashboardsResponse);
        const dashboard = dashboards.find(
            ({ name }) => name === 'Jaffle dashboard',
        );
        expect(dashboard, 'seeded dashboard').toBeDefined();
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard?.uuid}/view`,
        );
        await page.getByRole('button', { name: 'Dashboard actions' }).click();
        const viewerPath = new URL(page.url()).pathname;
        for (const width of [744, 640, 639, 390, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            await scrollToTop(page);
            await assertHeaderFits(page);
            expect(new URL(page.url()).pathname).toBe(viewerPath);
            await expect(
                page.getByRole('menu', { name: 'Dashboard actions' }),
            ).toBeVisible();
            await expect(
                page.getByRole('menuitem', { name: 'Edit details' }),
            ).toBeVisible();
            await expect(
                page.getByRole(width < 640 ? 'menuitem' : 'button', {
                    name: 'Edit dashboard',
                }),
            ).toBeVisible();
        }
        await page.getByRole('menuitem', { name: 'Edit details' }).click();
        const nameInput = page.getByRole('textbox', { name: /^Name/ });
        await nameInput.clear();
        await nameInput.fill('Unsaved responsive draft');
        // Marks the DOM node so a remount on resize drops the attribute.
        await nameInput.evaluate((input) =>
            input.setAttribute('data-e2e-original-input', 'true'),
        );
        for (const width of [744, 390, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            await expect(nameInput).toHaveValue('Unsaved responsive draft');
            await expect(
                nameInput,
                'same input survives resize',
            ).toHaveAttribute('data-e2e-original-input', 'true');
            const saveButton = page
                .getByRole('dialog', { name: 'Update Dashboard' })
                .getByRole('button', { name: 'Save' });
            await expect
                .poll(() =>
                    saveButton.evaluate((button) => {
                        const bounds = button.getBoundingClientRect();
                        return (
                            bounds.bottom <= window.innerHeight &&
                            bounds.top >= 0 &&
                            bounds.left >= 0 &&
                            bounds.right <= window.innerWidth
                        );
                    }),
                )
                .toBe(true);
        }
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(
            page.getByRole('dialog', { name: 'Update Dashboard' }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('heading', { name: 'Jaffle dashboard' }),
        ).toBeVisible();
    });
});
