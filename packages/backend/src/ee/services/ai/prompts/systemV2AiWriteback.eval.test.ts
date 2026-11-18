import {
    agentToolDefinitionsByName,
    ExploreType,
    type Explore,
} from '@lightdash/common';
import { generateText, tool, type Schema } from 'ai';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import type { PromptSection } from '../loadout';
import { getModel } from '../models';
import { getSystemPromptV2 } from './systemV2';

// Live model eval, opt in: AI_WRITEBACK_EVAL=1 plus a provider key. Every tool is a stub.
const describeEval =
    process.env.AI_WRITEBACK_EVAL === '1' ? describe : describe.skip;
const RUNS = Number(process.env.AI_WRITEBACK_EVAL_RUNS ?? 3);
const TIMEOUT = 300_000;

const explore = (name: string, label: string): Explore => ({
    name,
    label,
    tags: [],
    baseTable: name,
    joinedTables: [],
    tables: {},
    targetDatabase: 'postgres' as Explore['targetDatabase'],
    type: ExploreType.DEFAULT,
});

const DASHBOARD = JSON.stringify({
    slug: 'orders-overview',
    name: 'Orders overview',
    tiles: [
        { type: 'saved_chart', properties: { chartSlug: 'orders-count' } },
        { type: 'saved_chart', properties: { chartSlug: 'orders-target' } },
    ],
    filters: { dimensions: [], metrics: [] },
});

const FIELDS = [
    'orders/orders_order_date [dimension date]',
    'orders/orders_count [metric count]',
    'targets/targets_month [dimension date]',
    'targets/targets_orders_target [metric sum]',
].join('\n');

const runAsk = async (prompt: string) => {
    const { model, callOptions, providerOptions } = getModel(
        aiCopilotConfigSchema.parse(getAiConfig()),
    );
    const called: string[] = [];
    const stub = <TInput>(
        name: string,
        view: { description: string; inputSchema: Schema<TInput> },
        output: string,
    ) =>
        tool({
            description: view.description,
            inputSchema: view.inputSchema,
            execute: async () => {
                called.push(name);
                return output;
            },
        });
    const views = {
        grepFields: agentToolDefinitionsByName.grepFields.for('agent'),
        getMetadata: agentToolDefinitionsByName.getMetadata.for('agent'),
        findContent: agentToolDefinitionsByName.findContent.for('agent'),
        readContent: agentToolDefinitionsByName.readContent.for('agent'),
        editContent: agentToolDefinitionsByName.editContent.for('agent'),
        createContent: agentToolDefinitionsByName.createContent.for('agent'),
        listWorkstreams:
            agentToolDefinitionsByName.listWorkstreams.for('agent'),
        editDbtProject: agentToolDefinitionsByName.editDbtProject.for('agent'),
    };
    const { text } = await generateText({
        ...callOptions,
        providerOptions,
        model,
        stopWhen: ({ steps }) => steps.length >= 15,
        instructions: getSystemPromptV2({
            agentName: 'Agent',
            date: '2026-01-01',
            availableExplores: [
                explore('orders', 'Orders'),
                explore('targets', 'Targets'),
            ],
            promptSections: new Set<PromptSection>([
                'contentTools',
                'aiWriteback',
            ]),
            canRunQuery: true,
        }),
        prompt,
        tools: {
            grepFields: stub('grepFields', views.grepFields, FIELDS),
            getMetadata: stub(
                'getMetadata',
                views.getMetadata,
                'explore orders: dimensions order_date; metrics count. explore targets: dimensions month; metrics orders_target.',
            ),
            findContent: stub(
                'findContent',
                views.findContent,
                'dashboard orders-overview "Orders overview" (space canEdit true)',
            ),
            readContent: stub('readContent', views.readContent, DASHBOARD),
            editContent: stub(
                'editContent',
                views.editContent,
                'Saved dashboard orders-overview.',
            ),
            createContent: stub(
                'createContent',
                views.createContent,
                'Saved chart.',
            ),
            listWorkstreams: stub(
                'listWorkstreams',
                views.listWorkstreams,
                'This conversation has not opened any pull requests yet.',
            ),
            editDbtProject: stub(
                'editDbtProject',
                views.editDbtProject,
                'Started the change; the pull request opens in the background in a few minutes.',
            ),
        },
    });
    process.stdout.write(
        `\n[writeback eval] "${prompt}"\n  tools: ${called.join(', ')}\n  reply: ${text}\n`,
    );
    return { called, text };
};

describeEval(
    'Content requests are built now, not parked behind a pull request',
    () => {
        beforeAll(() => {
            // The unit setup stubs fetch; this suite talks to the provider.
            vi.unstubAllGlobals();
        });

        it(
            'adds an orders vs target tile with content tools in the first turn',
            async () => {
                const runs = await Promise.all(
                    Array.from({ length: RUNS }, () =>
                        runAsk(
                            'Add an orders vs target tile to the Orders overview dashboard.',
                        ),
                    ),
                );
                runs.forEach(({ called }) => {
                    expect(
                        called.filter(
                            (name) =>
                                name === 'editContent' ||
                                name === 'createContent',
                        ).length,
                    ).toBeGreaterThanOrEqual(1);
                    // The guard refuses agent_initiated calls; the content work must not depend on one.
                    expect(
                        called.filter((name) => name === 'editDbtProject')
                            .length,
                    ).toBeLessThanOrEqual(1);
                });
            },
            TIMEOUT,
        );
    },
);
