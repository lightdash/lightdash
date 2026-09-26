import type { Request } from 'playwright/test';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import {
    expectResultColumns,
    isPost,
    openExplorer,
    replyToUiRequest,
    runQuery,
    selectField,
} from '../lib/explorer';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';

// Plan T1.1. Deterministic: no request on hover means the trigger regressed;
// a request with a blank or unrelated modal means the hook swallowed an error.
// Preconditions: logged-in page; ambient AI enabled (T0.1).

const isMetadataRequest = isPost(
    `/api/v1/ai/${projectUuid}/chart/generate-metadata`,
);

// useGenerateChartMetadata aborts the request after this long.
const UI_ABORT_MS = 6_000;

// chartMetadataGenerator.ts: title 1..140, description up to 500 (no minimum).
const chartMetadataSchema = z.object({
    title: z.string().min(1).max(140),
    description: z.string().max(500),
});

test('T1.1 Chart metadata on Save hover', async ({ page }) => {
    const metadataRequests: Request[] = [];
    page.on('request', (request) => {
        if (isMetadataRequest(request)) metadataRequests.push(request);
    });

    await openExplorer(page, 'orders');
    await selectField(page, 'Status');
    await selectField(page, 'Unique order count');
    expect(await runQuery(page), 'query outcome').toEqual({ kind: 'rows' });
    await expectResultColumns(page, ['Status', 'Unique order count']);

    const saveButton = page.getByRole('button', { name: 'Save chart' });
    await expect(saveButton).toBeEnabled();
    expect(metadataRequests, 'no metadata request before the hover').toEqual(
        [],
    );

    const requestFired = page.waitForRequest(isMetadataRequest);
    const hoveredAt = Date.now();
    await saveButton.hover();
    const reply = await replyToUiRequest(
        await requestFired,
        hoveredAt,
        UI_ABORT_MS,
    );
    expect(reply.status, reply.text).toBe(200);
    const metadata = resultsOf(reply, chartMetadataSchema);
    if (metadata.description === '') {
        reportObservation(
            'the generated description is empty (the schema allows it)',
        );
    }

    // The same chart state again: the hook dedupes per state key.
    await page.mouse.move(0, 0);
    await saveButton.hover();
    await saveButton.click();

    const nameField = page.getByRole('textbox', { name: 'Chart name' });
    await expect(nameField).not.toHaveValue('');
    // The fallback name "<metrics> by <dimensions>" is never empty either, so
    // only equality with the response proves the modal used the model's output.
    await expect(nameField).toHaveValue(metadata.title);
    await expect(
        page.getByRole('textbox', { name: 'Chart description' }),
    ).toHaveValue(metadata.description);

    expect(
        metadataRequests,
        'metadata requests for one chart state',
    ).toHaveLength(1);
});
