/**
 * Playwright reproduction script for the filter autoFocus bug.
 *
 * Bug: When changing a filter value, focus jumps to the last filter input
 * because every filter input hardcodes autoFocus={true}. On re-render,
 * the last autoFocus={true} in DOM order wins.
 *
 * Prerequisites:
 *   - Local dev server running at http://localhost:3000
 *   - Database seeded with dev data (./scripts/reset-db.sh)
 *
 * Run:
 *   npx playwright test packages/frontend/src/components/common/Filters/__tests__/filter-autofocus-repro.spec.ts
 */
/* eslint-disable testing-library/prefer-screen-queries */
import { expect, test } from 'playwright/test';

const BASE_URL = 'http://localhost:3000';
const CHART_EDIT_URL = `${BASE_URL}/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/02f7317b-7c6f-407f-911c-4e8bc14745e6/edit`;

test.use({ headless: false, launchOptions: { slowMo: 500 } });

test.describe('Filter autoFocus bug reproduction', () => {
    test.setTimeout(90000);

    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE_URL}/login`);

        await page.fill('input[name="email"]', 'demo@lightdash.com');
        await page.click('button[type="submit"]');
        await page.waitForSelector('input[name="password"]', {
            timeout: 10000,
        });
        await page.fill('input[name="password"]', 'demo_password!');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/home', { timeout: 15000 });
    });

    test('changing the first filter value should not move focus to the last filter', async ({
        page,
    }) => {
        await page.goto(CHART_EDIT_URL);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Expand the Filters card
        await page.getByTestId('Filters-card-expand').click();
        await page.waitForTimeout(500);

        // Change the boolean filter ("Is completed | is | True") to False
        const booleanSelect = page
            .getByTestId('FilterRuleForm/filter-rule')
            .first()
            .locator('.mantine-Select-input')
            .last();
        await booleanSelect.click();
        await page.locator('[role="option"]', { hasText: 'False' }).click();

        // Wait for re-render
        await page.waitForTimeout(500);

        // Check where focus ended up
        const focusInfo = await page.evaluate(() => {
            const focused = document.activeElement;
            const allRules = document.querySelectorAll(
                '[data-testid="FilterRuleForm/filter-rule"]',
            );

            if (!focused || focused === document.body) {
                return {
                    focusFound: false,
                    ruleIndex: -1,
                    totalRules: allRules.length,
                    activeTag: 'BODY',
                };
            }

            let ruleEl: Element | null = focused;
            while (ruleEl) {
                if (
                    ruleEl.getAttribute('data-testid') ===
                    'FilterRuleForm/filter-rule'
                ) {
                    break;
                }
                ruleEl = ruleEl.parentElement;
            }

            return {
                focusFound: !!ruleEl,
                ruleIndex: ruleEl ? Array.from(allRules).indexOf(ruleEl) : -1,
                totalRules: allRules.length,
                activeTag: focused.tagName,
            };
        });

        console.log('Focus info:', JSON.stringify(focusInfo, null, 2));

        // Focus should stay on rule 0 (the one we edited), not jump to the last rule
        expect(
            focusInfo.focusFound,
            'Focus should be within a filter rule',
        ).toBe(true);
        expect(
            focusInfo.ruleIndex,
            `Focus should stay on rule 0 (the one we edited), but jumped to rule ${focusInfo.ruleIndex}`,
        ).toBe(0);
    });
});
