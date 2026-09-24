import { AGENT_SUGGESTION_TOOLS, assertUnreachable } from '@lightdash/common';
import type { Response } from 'playwright/test';
import { z } from 'zod';
import { agentsPath, projectUuid, type Agent } from '../lib/agents';
import { openNewThreadPage } from '../lib/agentUi';
import { replyOfResponse, resultsOf, type LightdashApi } from '../lib/api';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';
import {
    createThread,
    generateAnswer,
    latestAssistantMessage,
} from '../lib/threads';
import {
    explainFromLog,
    markUsageLog,
    type UsageLogMark,
} from '../lib/usageLog';

// Plan T1.5. Deterministic: the fallback set means the model call failed;
// identical chip sets for two differently instructed agents twice in a row
// means the instruction is not reaching the prompt.
// Preconditions: F1 and F2. With E2E_AI_BACKEND_LOG set, a fallback failure
// quotes the backend's own warning about why it fell back.

// Copied from SUGGESTION_FALLBACK_CHIPS (suggestionGenerator.ts). The service
// filters it by the tools the user may use, so any subset is the fallback.
const SUGGESTION_FALLBACK_CHIPS = [
    {
        kind: 'prompt',
        label: 'Show me what data is available',
        tool: 'findContent',
    },
    {
        kind: 'prompt',
        label: 'Summarise activity from the last 30 days',
        tool: 'generateVisualization',
    },
    {
        kind: 'prompt',
        label: 'Build a quick overview dashboard',
        tool: 'generateDashboard',
    },
];
const FALLBACK_LABELS = new Set(
    SUGGESTION_FALLBACK_CHIPS.map((chip) => chip.label),
);

const chipSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('prompt'),
        label: z.string().min(1),
        tool: z.enum(AGENT_SUGGESTION_TOOLS),
        defaults: z.object({
            explore: z.string().nullable(),
            dimensions: z.array(z.string()),
            metrics: z.array(z.string()),
            timeframe: z.string().nullable(),
        }),
    }),
    z.object({
        kind: z.literal('navigate'),
        label: z.string().min(1),
        url: z.string(),
    }),
]);
const suggestionsSchema = z.object({ chips: z.array(chipSchema) });
type Chip = z.output<typeof chipSchema>;

const suggestionsPath = (agent: Agent) =>
    `${agentsPath}/${agent.uuid}/suggestions`;

// Both fixture agents have SQL mode on, so the UI asks with enableSqlMode.
const getSuggestions = async (
    api: LightdashApi,
    agent: Agent,
    thread: { threadUuid: string; afterMessageUuid: string } | null,
) => {
    const search = new URLSearchParams({ enableSqlMode: 'true', ...thread });
    const { chips } = await api.get(
        `${suggestionsPath(agent)}?${search.toString()}`,
        suggestionsSchema,
    );
    return chips;
};

const isFallback = (chips: Chip[]) =>
    chips.every((chip) => FALLBACK_LABELS.has(chip.label));

const expectModelChips = async (
    chips: Chip[],
    agent: Agent,
    mark: UsageLogMark,
    what: string,
) => {
    expect(chips.length, `${what}: chip count`).toBeGreaterThan(0);
    if (isFallback(chips)) {
        throw new Error(
            `${what}: the fallback chip set came back, so the model call failed or every chip was dropped. ${await explainFromLog(
                mark,
                [
                    '[AiAgentService] Failed to generate agent suggestions',
                    '[AiAgentService] Dropped',
                ],
            )}`,
        );
    }
    const navigateCount = chips.filter(
        (chip) => chip.kind === 'navigate',
    ).length;
    reportObservation(
        `${what}: ${chips.length - navigateCount} prompt and ${navigateCount} navigate chip(s)`,
    );
    chips.forEach((chip) => {
        switch (chip.kind) {
            case 'prompt':
                return;
            case 'navigate':
                expect(chip.url, `${what}: navigate chip URL`).toMatch(
                    new RegExp(
                        `^/projects/${projectUuid}/ai-agents/${agent.uuid}/threads/[^/]+$`,
                    ),
                );
                return;
            default:
                assertUnreachable(chip, 'Unknown chip kind');
        }
    });
};

const labelSet = (chips: Chip[]) =>
    chips.map((chip) => chip.label).sort((a, b) => a.localeCompare(b));

test('T1.5 Suggestion chips, empty state and post-response', async ({
    api,
    page,
    f1Agent,
    f2Agent,
}) => {
    await test.step('empty state: model chips that differ per agent', async () => {
        const fetchPair = async () => {
            const mark = await markUsageLog();
            const f1Chips = await getSuggestions(api, f1Agent, null);
            await expectModelChips(f1Chips, f1Agent, mark, 'F1 empty state');
            const f2Chips = await getSuggestions(api, f2Agent, null);
            await expectModelChips(f2Chips, f2Agent, mark, 'F2 empty state');
            return { f1Chips, f2Chips };
        };
        const first = await fetchPair();
        if (
            labelSet(first.f1Chips).join('\n') ===
            labelSet(first.f2Chips).join('\n')
        ) {
            reportObservation(
                'F1 and F2 returned identical chip sets; asking both once more',
            );
            const second = await fetchPair();
            expect(
                labelSet(second.f1Chips),
                'identical chip sets for two differently instructed agents, twice',
            ).not.toEqual(labelSet(second.f2Chips));
        }
    });

    await test.step('post-response: at least one prompt chip', async () => {
        const thread = await createThread(
            api,
            f1Agent,
            WITNESS_PROMPTS.totalOrders,
        );
        await generateAnswer(api, f1Agent, thread.uuid);
        const assistant = await latestAssistantMessage(
            api,
            f1Agent,
            thread.uuid,
        );

        const mark = await markUsageLog();
        const chips = await getSuggestions(api, f1Agent, {
            threadUuid: thread.uuid,
            afterMessageUuid: assistant.uuid,
        });
        await expectModelChips(chips, f1Agent, mark, 'F1 post-response');
        expect(
            chips.filter((chip) => chip.kind === 'prompt').length,
            'post-response prompt chips',
        ).toBeGreaterThan(0);
    });

    await test.step('browser: the new-thread page renders the model chips', async () => {
        const isEmptyStateRequest = (response: Response) => {
            const url = new URL(response.url());
            return (
                response.request().method() === 'GET' &&
                url.pathname === suggestionsPath(f1Agent) &&
                !url.searchParams.has('threadUuid')
            );
        };
        const mark = await markUsageLog();
        const loaded = page.waitForResponse(isEmptyStateRequest);
        await openNewThreadPage(page, f1Agent);
        const { chips } = resultsOf(
            await replyOfResponse(await loaded),
            suggestionsSchema,
        );
        await expectModelChips(chips, f1Agent, mark, 'F1 new-thread page');

        const rendered = page.locator('[data-tour-anchor="ai-suggestion"]');
        await expect(rendered.first()).toBeVisible();
        const promptLabels = chips.flatMap((chip) =>
            chip.kind === 'prompt' ? [chip.label] : [],
        );
        (await rendered.allInnerTexts()).forEach((text) => {
            expect(
                promptLabels,
                'rendered chip comes from the response',
            ).toContain(text.trim());
        });
    });
});
