import { assertUnreachable, DimensionType } from '@lightdash/common';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import {
    expectResultColumns,
    isPost,
    openExplorer,
    replyToUiRequest,
    runQuery,
} from '../lib/explorer';
import { expect, test } from '../lib/fixtures';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T1.2. V: generated SQL the warehouse rejects once may be variance;
// twice is real. A schema-invalid response is real on the first attempt.
// Preconditions: logged-in page; ambient AI enabled (T0.1).

const PROMPT = "the customer's first name in upper case";

const isGenerateRequest = isPost(
    `/api/v1/ai/${projectUuid}/custom-dimension/generate`,
);

// useGenerateCustomDimension aborts the request after this long.
const UI_ABORT_MS = 10_000;

// customDimensionGenerator.ts
const generatedSchema = z.object({
    sql: z.string().min(1),
    displayName: z.string().min(1).max(100),
    dimensionType: z.enum(DimensionType),
});

const withoutWhitespace = (text: string) => text.replace(/\s+/g, '');

test('T1.2 Custom dimension generation, then the SQL runs', async ({
    page,
}) => {
    await retryOnceOnVariance(async () => {
        await openExplorer(page, 'customers');
        // The base table's section comes first in the tree.
        await page
            .getByTestId('VirtualSectionHeader/AddCustomDimensionButton')
            .first()
            .click();
        const dialog = page.getByRole('dialog', {
            name: 'Create Custom Dimension',
        });
        await expect(dialog).toBeVisible();

        await dialog
            .locator('.ProseMirror[contenteditable="true"]')
            .fill(PROMPT);
        const requestFired = page.waitForRequest(isGenerateRequest);
        const clickedAt = Date.now();
        await dialog
            .getByRole('button', { name: 'Generate custom dimension' })
            .click();
        const reply = await replyToUiRequest(
            await requestFired,
            clickedAt,
            UI_ABORT_MS,
        );
        expect(reply.status, reply.text).toBe(200);
        const generated = resultsOf(reply, generatedSchema);

        const sqlEditor = dialog.locator('.ace_text-layer');
        await expect
            .poll(async () => withoutWhitespace(await sqlEditor.innerText()))
            .toBe(withoutWhitespace(generated.sql));
        await expect(
            dialog.getByRole('textbox', { name: 'Label' }),
        ).toHaveValue(generated.displayName);

        // Creating it also adds it to the query's dimensions.
        await dialog.getByRole('button', { name: 'Create' }).click();
        await expect(dialog).toBeHidden();

        const outcome = await runQuery(page);
        switch (outcome.kind) {
            case 'rows':
                await expectResultColumns(page, [generated.displayName]);
                return { kind: 'pass' };
            case 'error':
                return {
                    kind: 'variance',
                    assertion: 'the generated SQL failed in the warehouse',
                    ledger: { generated, warehouseError: outcome.message },
                };
            default:
                return assertUnreachable(outcome, 'Unknown query outcome');
        }
    });
});
