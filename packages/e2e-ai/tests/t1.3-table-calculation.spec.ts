import {
    assertUnreachable,
    CustomFormatType,
    TableCalculationType,
} from '@lightdash/common';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import {
    isPost,
    openExplorer,
    replyToUiRequest,
    runQuery,
    selectField,
} from '../lib/explorer';
import {
    baseField,
    getExplore,
    tableCalculationFieldContext,
} from '../lib/explores';
import { expect, test } from '../lib/fixtures';
import { runMetricQuery } from '../lib/query';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T1.3. V for the generated SQL executing; D for both schemas and for
// the debounce count. Preconditions: logged-in page; ambient AI enabled; the
// project's warehouse supports formulas (Postgres does), so the modal opens
// on the formula editor.

const PROMPT = 'running total of the order count';
const DIMENSION_ID = 'orders_order_date_month';
const METRIC_ID = 'orders_unique_order_count';

const SQL_PATH = `/api/v1/ai/${projectUuid}/table-calculation/generate`;
const FORMULA_PATH = `/api/v1/ai/${projectUuid}/formula-table-calculation/generate`;
const isFormulaRequest = isPost(FORMULA_PATH);

// FormulaForm.tsx waits this long after the last keystroke before previewing.
const PREVIEW_DEBOUNCE_MS = 800;
// Well inside the debounce window, so typing never pauses long enough.
const KEYSTROKE_DELAY_MS = 100;
// useGenerateFormulaTableCalculation aborts the request after this long.
const UI_ABORT_MS = 15_000;

// The endpoints return the generator output with its format sanitised, and
// omit the format when sanitising drops it (AiService).
const formatSchema = z.object({ type: z.enum(CustomFormatType) }).optional();
const sqlCalculationSchema = z.object({
    sql: z.string().min(1),
    displayName: z.string().min(1).max(100),
    type: z.enum(TableCalculationType),
    format: formatSchema,
});
const formulaCalculationSchema = z.object({
    formula: z.string().min(1),
    displayName: z.string().min(1).max(100),
    type: z.enum(TableCalculationType),
    format: formatSchema,
});

test('T1.3 Table calculation, SQL and formula', async ({ api, page }) => {
    const orders = await getExplore(api, 'orders');
    // The context the explorer sends with this query's fields selected.
    const context = {
        tableName: orders.label,
        fieldsContext: [
            baseField(orders, DIMENSION_ID),
            baseField(orders, METRIC_ID),
        ].map(tableCalculationFieldContext),
        existingTableCalculations: [],
    };

    await test.step('SQL variant: schema, then it runs in the query', async () => {
        await retryOnceOnVariance(async () => {
            const generated = await api.post(
                SQL_PATH,
                { prompt: PROMPT, ...context },
                sqlCalculationSchema,
            );
            const run = await runMetricQuery(api, {
                exploreName: 'orders',
                dimensions: [DIMENSION_ID],
                metrics: [METRIC_ID],
                sorts: [{ fieldId: DIMENSION_ID, descending: false }],
                tableCalculations: [
                    {
                        name: 'e2e_ai_generated',
                        displayName: generated.displayName,
                        sql: generated.sql,
                        type: generated.type,
                    },
                ],
            });
            switch (run.kind) {
                case 'rows':
                    expect(
                        run.rowCount,
                        'rows with the calculation',
                    ).toBeGreaterThan(0);
                    return { kind: 'pass' };
                case 'error':
                    return {
                        kind: 'variance',
                        assertion: 'the generated SQL failed in the warehouse',
                        ledger: { generated, run },
                    };
                default:
                    return assertUnreachable(run, 'Unknown query run');
            }
        });
    });

    await test.step('formula variant: schema, and the backend parser accepted it', async () => {
        const reply = await api.send('POST', FORMULA_PATH, {
            mode: 'prompt',
            prompt: PROMPT,
            ...context,
        });
        // The endpoint parses the formula with @lightdash/formula and fails
        // when it does not parse, so a 200 is the parser's acceptance.
        expect(reply.status, reply.text).toBe(200);
        resultsOf(reply, formulaCalculationSchema);
    });

    await test.step('a typed prompt previews once per debounce window', async () => {
        const previewRequestTimes: number[] = [];
        page.on('request', (request) => {
            if (isFormulaRequest(request)) previewRequestTimes.push(Date.now());
        });

        await openExplorer(page, 'orders');
        await selectField(page, 'Month', 'Order date month');
        await selectField(page, 'Unique order count');
        expect(await runQuery(page), 'query outcome').toEqual({ kind: 'rows' });

        await page.getByRole('button', { name: 'Table calculation' }).click();
        const dialog = page.getByRole('dialog', {
            name: 'Create Table Calculation',
        });
        await expect(
            dialog.getByText('Formula', { exact: true }),
        ).toBeVisible();

        const editor = dialog.locator('.ProseMirror[contenteditable="true"]');
        await editor.click();
        const previewFired = page.waitForRequest(isFormulaRequest);
        await editor.pressSequentially(PROMPT, { delay: KEYSTROKE_DELAY_MS });
        const typingEndedAt = Date.now();

        const reply = await replyToUiRequest(
            await previewFired,
            typingEndedAt,
            UI_ABORT_MS,
        );
        expect(
            previewRequestTimes.filter((at) => at < typingEndedAt),
            'previews while typing faster than the debounce',
        ).toEqual([]);
        expect(reply.status, reply.text).toBe(200);
        resultsOf(reply, formulaCalculationSchema);

        // Two more debounce windows without typing: no second preview.
        await page.waitForTimeout(2 * PREVIEW_DEBOUNCE_MS);
        expect(
            previewRequestTimes,
            'previews for one typed prompt',
        ).toHaveLength(1);
    });
});
