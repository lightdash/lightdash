import type { Pool } from 'pg';
import { z } from 'zod';
import {
    agentsPath,
    projectUuid,
    withAgentPreference,
    type Agent,
} from '../lib/agents';
import { composer } from '../lib/agentUi';
import { replyOfResponse, resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportWarning } from '../lib/report';
import { ROUTER_FALLBACK_REASONING, withRouterEnabled } from '../lib/router';

// Plan T4.1. V on the pick: which agent is reported, never asserted. A
// missing decision row, or a suggestion outside the candidates, is real.
// Preconditions: F4 pair; the org router enabled for the seed project and
// the user's default-agent preference cleared for the test (both restored);
// the new homepage, whose agent selector carries the agent-selector anchor.

const PROMPTS = {
    revenue: 'What is total revenue by payment method?',
    customers: 'Which customers signed up this year?',
};

const ROUTE_PATH = '/api/v1/org/aiRouter/route';

const routeResultSchema = z.object({
    decision: z.object({
        decisionUuid: z.string(),
        suggestedAgentUuid: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
        reasoning: z.string(),
        candidates: z.array(
            z.object({ agentUuid: z.string(), name: z.string() }),
        ),
    }),
    nextAction: z.enum(['create_thread', 'show_picker']),
});
type RouteResult = z.output<typeof routeResultSchema>;

const readDecision = async (db: Pool, decisionUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT suggested_agent_uuid, chosen_agent_uuid, thread_uuid,
                    candidate_agent_uuids, confidence, reasoning, committed_at
             FROM ai_router_decision WHERE ai_router_decision_uuid = $1`,
            [decisionUuid],
            z.object({
                suggested_agent_uuid: z.string(),
                chosen_agent_uuid: z.string().nullable(),
                thread_uuid: z.string().nullable(),
                candidate_agent_uuids: z.array(z.string()),
                confidence: z.string(),
                reasoning: z.string(),
                committed_at: z.date().nullable(),
            }),
        ),
        `ai_router_decision ${decisionUuid}`,
    );

const checkDecision = async (
    db: Pool,
    route: RouteResult,
    pair: { revenue: Agent; customers: Agent },
    label: string,
) => {
    const row = await readDecision(db, route.decision.decisionUuid);
    expect(row.candidate_agent_uuids, `${label}: candidates`).toEqual(
        expect.arrayContaining([pair.revenue.uuid, pair.customers.uuid]),
    );
    expect(
        row.candidate_agent_uuids,
        `${label}: suggestion is a candidate`,
    ).toContain(row.suggested_agent_uuid);
    expect(row.suggested_agent_uuid).toBe(route.decision.suggestedAgentUuid);
    const suggested = route.decision.candidates.find(
        (candidate) => candidate.agentUuid === row.suggested_agent_uuid,
    );
    reportObservation(
        `${label}: ${route.nextAction}, suggested ${suggested?.name ?? row.suggested_agent_uuid} (${route.decision.confidence})`,
    );
    // Ordinary variance (agentUuid is a free string, not an enum of the
    // candidates), so never red; loud because all-fallback runs need a look.
    const fellBack = row.reasoning.includes(ROUTER_FALLBACK_REASONING);
    if (fellBack) {
        reportWarning(
            `${label}: the selector named an agent that is not a candidate, so the router fell back to the first candidate`,
        );
    }
    return fellBack;
};

test('T4.1 Agent selector through the web router', async ({
    page,
    api,
    db,
    f4Agents,
}) => {
    const fallbacks: boolean[] = [];
    await withRouterEnabled(api, db, () =>
        withAgentPreference(api, null, async () => {
            await test.step('API: route both prompts', async () => {
                for (const [label, prompt] of Object.entries(PROMPTS)) {
                    const route = await api.post(
                        ROUTE_PATH,
                        { prompt, projectUuid },
                        routeResultSchema,
                    );
                    fallbacks.push(
                        await checkDecision(db, route, f4Agents, label),
                    );
                }
            });

            await test.step('browser: Auto from the home search box to a thread', async () => {
                const routed = page.waitForResponse(
                    (response) =>
                        response.request().method() === 'POST' &&
                        new URL(response.url()).pathname === ROUTE_PATH,
                    { timeout: 0 },
                );
                const streamed = page.waitForResponse(
                    (response) =>
                        response.request().method() === 'POST' &&
                        /\/aiAgents\/[^/]+\/threads\/[^/]+\/stream$/.test(
                            new URL(response.url()).pathname,
                        ),
                    { timeout: 0 },
                );
                await page.goto(`/projects/${projectUuid}/home`);
                // The homepage composer reveals its controls once clicked.
                // Picking Auto there opens the router page, where the prompt
                // is sent.
                await composer(page).click();
                await page
                    .locator('[data-tour-anchor="agent-selector"]')
                    .click();
                // The option's name also carries its "AI" avatar and caption.
                await page.getByRole('option', { name: /\bAuto\b/ }).click();
                await page.waitForURL(/\/ai-agents\?routing=auto/);
                // The view transition keeps the homepage editor around briefly.
                await expect(
                    page.getByRole('heading', { level: 2, name: /^Ask / }),
                ).toBeVisible();
                await composer(page).fill(PROMPTS.revenue);
                await page
                    .getByRole('button', { name: 'Send message' })
                    .click();

                const route = resultsOf(
                    await replyOfResponse(await routed),
                    routeResultSchema,
                );
                fallbacks.push(
                    await checkDecision(db, route, f4Agents, 'browser'),
                );
                if (route.nextAction === 'show_picker') {
                    const suggested = route.decision.candidates.find(
                        (candidate) =>
                            candidate.agentUuid ===
                            route.decision.suggestedAgentUuid,
                    );
                    if (suggested === undefined)
                        throw new Error('Suggestion not listed');
                    await page
                        .getByRole('button', {
                            name: `Send to ${suggested.name}`,
                        })
                        .click();
                }

                const threadUrl = new RegExp(
                    `/projects/${projectUuid}/ai-agents/([^/]+)/threads/([^/?#]+)$`,
                );
                await page.waitForURL(threadUrl, { timeout: 0 });
                const [, agentUuid, threadUuid] =
                    threadUrl.exec(page.url()) ?? [];
                if (agentUuid === undefined || threadUuid === undefined) {
                    throw new Error(`Not a thread page: ${page.url()}`);
                }
                // The router may pick an agent that is not a fixture, whose
                // threads the fixture teardown would not remove.
                const threadPath = `${agentsPath}/${agentUuid}/threads/${threadUuid}`;
                const undo = recordUndo({
                    kind: 'http',
                    method: 'DELETE',
                    path: threadPath,
                });
                try {
                    await (await streamed).finished();
                    // The UI commits the decision without awaiting it.
                    await expect
                        .poll(
                            async () =>
                                (
                                    await readDecision(
                                        db,
                                        route.decision.decisionUuid,
                                    )
                                ).committed_at,
                            { message: 'decision committed_at' },
                        )
                        .not.toBeNull();
                    const decision = await readDecision(
                        db,
                        route.decision.decisionUuid,
                    );
                    const thread = single(
                        await queryRows(
                            db,
                            'SELECT agent_uuid FROM ai_thread WHERE ai_thread_uuid = $1',
                            [threadUuid],
                            z.object({ agent_uuid: z.string().nullable() }),
                        ),
                        `ai_thread ${threadUuid}`,
                    );
                    expect(decision.thread_uuid, 'decision thread').toBe(
                        threadUuid,
                    );
                    expect(
                        decision.chosen_agent_uuid,
                        'decision chosen agent',
                    ).toBe(thread.agent_uuid);
                    expect(thread.agent_uuid).toBe(agentUuid);
                } finally {
                    await api.delete(threadPath);
                    markUndone(undo);
                }
            });
        }),
    );
    if (fallbacks.length > 0 && fallbacks.every(Boolean)) {
        reportWarning(
            `every routing decision in this run (${fallbacks.length}) fell back to the first candidate`,
        );
    }
});
