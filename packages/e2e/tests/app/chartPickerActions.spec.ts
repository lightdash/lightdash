import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    loginAs,
    scrollTreeToItem,
    SEED_USERS,
    test,
    type Locator,
} from '../../support/test';

// Cypress `click('top')`: top-centre of the element.
const clickTop = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('Element has no bounds');
    await locator.click({ position: { x: box.width / 2, y: 1 } });
};

test.describe('Chart picker actions', () => {
    test('keeps the selected chart title above its visible configuration action', async ({
        page,
        api,
    }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        await expect(page.getByTestId('page-spinner')).toHaveCount(0);
        await (await scrollTreeToItem(page, 'Unique order count')).click();
        await (await scrollTreeToItem(page, 'Order Customer')).click();
        await (await scrollTreeToItem(page, 'First name')).click();
        await expect(page.locator('table').first()).toContainText(
            'Unique order count',
        );
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await page.getByTestId('Chart-card-expand').click();
        await page
            .getByRole('button', { name: 'Configure', exact: true })
            .click();
        const changeChartType = page.getByRole('button', {
            name: 'Change chart type',
            exact: true,
        });
        await changeChartType.click();

        const pieButton = page
            .locator('button')
            .filter({ hasText: /^Pie chart$/ })
            .first();
        await expect(pieButton).toBeEnabled({ timeout: 30_000 });
        await pieButton.click();
        await expect(
            page.getByRole('button', { name: 'Pie chart', pressed: true }),
        ).toBeAttached();
        await expect(
            page.getByText('Choose chart type', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Configure Bar chart',
                exact: true,
            }),
        ).toHaveCount(0);
        const configurePie = page.getByRole('button', {
            name: 'Configure Pie chart',
            exact: true,
        });
        await expect(configurePie).toBeVisible();
        await configurePie.focus();
        await expect(configurePie).toBeVisible();
        await expect
            .poll(() =>
                configurePie.evaluate((button) => {
                    const title = button.parentElement!.querySelector('p')!;
                    const icon = title.parentElement!.previousElementSibling!;
                    return {
                        titleOpacity: getComputedStyle(title).opacity,
                        buttonBelowTitle:
                            button.getBoundingClientRect().top >=
                            title.getBoundingClientRect().bottom,
                        iconOpacity: getComputedStyle(icon).opacity,
                    };
                }),
            )
            .toEqual({
                titleOpacity: '1',
                buttonBelowTitle: true,
                iconOpacity: '1',
            });
        await clickTop(
            page.getByRole('button', { name: 'Pie chart', pressed: true }),
        );
        await expect(changeChartType).toBeFocused();
        await expect(
            page.getByText('Choose chart type', { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('Pie chart', { exact: true }),
        ).toBeVisible();

        await changeChartType.click();
        await expect(
            page.getByRole('button', { name: 'Line chart', pressed: false }),
        ).toBeAttached();
        const lineButton = page
            .locator('button')
            .filter({ hasText: /^Line chart$/ })
            .first();
        await expect(lineButton).toBeEnabled({ timeout: 30_000 });
        await clickTop(lineButton);
        await clickTop(
            page.getByRole('button', { name: 'Line chart', pressed: true }),
        );
        await expect(changeChartType).toBeFocused();
        await expect(
            page.getByText('Choose chart type', { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('Line chart', { exact: true }),
        ).toBeVisible();
    });
});
