import { expect, type Page, type Request } from 'playwright/test';
import { projectUuid } from './agents';
import { replyOfResponse, type ApiReply } from './api';

export const openExplorer = async (page: Page, exploreName: string) => {
    await page.goto(`/projects/${projectUuid}/tables/${exploreName}`);
    await expect(
        page.getByPlaceholder('Search metrics + dimensions'),
    ).toBeVisible();
};

/**
 * Toggles a field by its tree label. Searching first keeps the node in the
 * virtualised tree; the node test id carries the exact label, unlike text
 * matching, which also hits the search highlight inside longer labels. Date
 * intervals sit under their date field, so "Order date month" is the node
 * "Month", found by searching for the full name.
 */
export const selectField = async (
    page: Page,
    label: string,
    searchText: string = label,
) => {
    const search = page.getByPlaceholder('Search metrics + dimensions');
    await search.fill(searchText);
    await page.getByTestId(`tree-single-node-${label}`).click();
    await search.clear();
};

export type QueryOutcome =
    | { kind: 'rows' }
    | { kind: 'error'; message: string };

/** Runs the query and waits for the first row or the warehouse error. */
export const runQuery = async (page: Page): Promise<QueryOutcome> => {
    // The empty results panel renders the same RefreshButton a second time.
    await page.getByRole('button', { name: 'Run query' }).first().click();
    const firstCell = page
        .getByTestId('results-table-container')
        .locator('td')
        .first();
    const errorTitle = page.getByRole('heading', {
        name: 'Error loading results',
    });
    await expect(firstCell.or(errorTitle).first()).toBeVisible();
    if (await errorTitle.isVisible()) {
        return {
            kind: 'error',
            message: await errorTitle.locator('xpath=..').innerText(),
        };
    }
    return { kind: 'rows' };
};

export const expectResultColumns = async (page: Page, labels: string[]) => {
    const header = page.getByTestId('results-table-container').locator('thead');
    for (const label of labels) {
        await expect(header).toContainText(label);
    }
};

/**
 * The reply to a request the UI sent. The UI aborts some AI requests on its
 * own timer, which leaves no response: that is reported with the elapsed time.
 */
export const replyToUiRequest = async (
    request: Request,
    startedAt: number,
    uiAbortMs: number,
): Promise<ApiReply> => {
    const response = await request.response();
    if (response === null) {
        throw new Error(
            `${request.method()} ${new URL(request.url()).pathname} failed in the browser (${request.failure()?.errorText ?? 'no response'}) after ${Date.now() - startedAt} ms; the UI aborts it at ${uiAbortMs} ms`,
        );
    }
    return replyOfResponse(response);
};

export const isPost = (path: string) => (request: Request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === path;
