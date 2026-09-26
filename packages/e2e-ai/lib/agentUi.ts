import { expect, type Page, type Response } from 'playwright/test';
import { projectUuid, type Agent } from './agents';
import { replyOfResponse, resultsOf } from './api';
import { uiStreamPartTypes } from './stream';
import { threadsPath, threadSummarySchema } from './threads';

export const composer = (page: Page) =>
    page.locator('.ProseMirror[contenteditable="true"]');

export const openNewThreadPage = async (page: Page, agent: Agent) => {
    await page.goto(`/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`);
    await expect(composer(page)).toBeVisible();
};

export const sendPrompt = async (page: Page, prompt: string) => {
    await composer(page).fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
};

/**
 * Matches a POST to one of the agent's thread endpoints. `suffix` is the path
 * after the thread id ('' for thread creation itself).
 */
export const isThreadPost =
    (agent: Agent, suffix: '' | '/stream' | '/generate-title') =>
    (response: Response) => {
        if (response.request().method() !== 'POST') return false;
        const { pathname } = new URL(response.url());
        const base = threadsPath(agent);
        if (suffix === '') return pathname === base;
        return (
            pathname.startsWith(`${base}/`) &&
            pathname.endsWith(suffix) &&
            pathname.split('/').length === base.split('/').length + 2
        );
    };

/** Present while a reply streams: typing dots, then the live parts. */
export const workingIndicator = (page: Page) =>
    page.locator('[data-tour-anchor="ai-working"]');

// useToaster stamps each toast with its variant.
export const errorToasts = (page: Page) =>
    page.locator('[role="alert"][data-variant="error"]');

// The assistant bubble carries the create:AiAgentThread walkthrough marker.
export const assistantBubbles = (page: Page) =>
    page.locator(
        '[data-tour-scope="create:AiAgentThread"][data-tour-step="1"]',
    );

/** Thread titles in the sidebar, as the data-tour-value anchors carry them. */
export const sidebarThreadTitles = (page: Page) =>
    page
        .locator('[data-tour-anchor="agent-thread"]')
        .evaluateAll((items) =>
            items.map((item) => item.getAttribute('data-tour-value')),
        );

/**
 * Sends the first prompt of a new thread in the browser and waits as plan
 * T2.2 describes: the working indicator shows, the stream response ends, the
 * indicator goes and the send button is back. Returns the stream's part kinds.
 */
export const askInNewThread = async (
    page: Page,
    agent: Agent,
    prompt: string,
) => {
    const threadCreated = page.waitForResponse(isThreadPost(agent, ''));
    const streamed = page.waitForResponse(isThreadPost(agent, '/stream'));

    await openNewThreadPage(page, agent);
    await composer(page).fill(prompt);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(workingIndicator(page).first()).toBeVisible();

    const thread = resultsOf(
        await replyOfResponse(await threadCreated),
        threadSummarySchema,
    );
    const stream = await streamed;
    // Resolves once the server closes the stream.
    const body = await stream.text();

    await expect(workingIndicator(page)).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Send message' }),
    ).toBeVisible();
    return {
        thread,
        streamStatus: stream.status(),
        partTypes: uiStreamPartTypes(body),
    };
};
