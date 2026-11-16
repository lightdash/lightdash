import {
    ApiConnectorType,
    FeatureFlags,
    SEED_PROJECT,
    type AiAgent,
    type CreateExternalConnection,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    buildApiSourceExplores,
    describeApiSourceTarget,
} from '../../../../../services/QuerySourceService/api/apiSourceExplores';
import {
    getServices,
    getTestContext,
    type IntegrationTestContext,
} from '../../../../../vitest.setup.integration';
import { type ExternalConnectionModel } from '../../../../models/ExternalConnectionModel';
import { promptAndGetToolCalls } from './utils/testHelpers';

const hasApiKey = !!(
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
);
const describeOrSkip = hasApiKey ? describe : describe.skip;
const TIMEOUT = 120_000;

type SeededSource = {
    prefix: string;
    name: string;
    siteUrl: string;
    aiHint: string | null;
};

/** Six sources of one integration, each findable by exactly one kind of detail. */
const SOURCES: SeededSource[] = [
    {
        prefix: 'sc_one',
        name: 'Search Console 1',
        siteUrl: 'https://uk.example.com/',
        aiHint: null,
    },
    {
        prefix: 'sc_two',
        name: 'Search Console 2',
        siteUrl: 'https://shop-two.example.com/',
        aiHint: 'Used by the German storefront team',
    },
    {
        prefix: 'sc_three',
        name: 'French storefront',
        siteUrl: 'https://shop-three.example.com/',
        aiHint: null,
    },
    {
        prefix: 'sc_four',
        name: 'Search Console 4',
        siteUrl: 'https://shop-four.example.com/',
        aiHint: null,
    },
    {
        prefix: 'sc_five',
        name: 'Search Console 5',
        siteUrl: 'https://shop-five.example.com/',
        aiHint: null,
    },
    {
        prefix: 'sc_six',
        name: 'Search Console 6',
        siteUrl: 'https://shop-six.example.com/',
        aiHint: null,
    },
];

/** Pushes the project past 15 explores, so the agent has to search for them. */
const EXTRA_SOURCES: SeededSource[] = Array.from(
    { length: 10 },
    (_, index) => ({
        prefix: `sc_extra_${index}`,
        name: `Search Console extra ${index}`,
        siteUrl: `https://extra-${index}.example.net/`,
        aiHint: null,
    }),
);

const CASES = [
    {
        name: 'the target named only by the URL',
        prompt: 'How many clicks did uk.example.com get last week?',
        expectedPrefix: 'sc_one',
    },
    {
        name: 'the target named only by the hint',
        prompt: 'How many clicks did the German storefront get last week?',
        expectedPrefix: 'sc_two',
    },
    {
        name: 'the target named only by the display name',
        prompt: 'How many clicks did the French storefront get last week?',
        expectedPrefix: 'sc_three',
    },
];

const firstQueriedExplore = (
    toolCalls: { tool_args: unknown }[],
): string | undefined =>
    toolCalls
        .map(
            ({ tool_args: args }) =>
                JSON.stringify(args).match(
                    /"(sc_[a-z0-9_]+_performance)"/,
                )?.[1],
        )
        .find((name) => name !== undefined);

describeOrSkip('live data source selection', () => {
    let context: IntegrationTestContext;
    let agent: AiAgent;
    let connectionModel: ExternalConnectionModel;
    const seededUuids: string[] = [];

    const seed = async (source: SeededSource) => {
        const apiSource = {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: source.siteUrl,
        } as const;
        const origin = 'https://searchconsole.googleapis.com';
        const config: CreateExternalConnection = {
            name: source.name,
            type: 'bearer_token',
            origin,
            secret: 'fake',
            apiSource,
            allowedPathPrefixes: [],
            allowedMethods: [],
            allowedContentTypes: [],
            instructions: null,
        };
        const { externalConnectionUuid } = await connectionModel.create(
            SEED_PROJECT.project_uuid,
            context.testUser.organizationUuid!,
            context.testUser.userUuid,
            config,
        );
        seededUuids.push(externalConnectionUuid);
        await connectionModel.claimLiveSourceName(
            SEED_PROJECT.project_uuid,
            externalConnectionUuid,
            [source.prefix],
        );
        if (source.aiHint) {
            await connectionModel.update(
                externalConnectionUuid,
                context.testUser.userUuid,
                { aiHint: source.aiHint },
            );
        }
        await context.app
            .getModels()
            .getProjectModel()
            .replaceApiSourceExplores(
                SEED_PROJECT.project_uuid,
                externalConnectionUuid,
                buildApiSourceExplores({
                    connectionUuid: externalConnectionUuid,
                    sourceName: source.prefix,
                    name: source.name,
                    apiSource,
                    scannedFields: [],
                    edits: {},
                    aiHint: [
                        describeApiSourceTarget(apiSource, origin, null),
                        ...(source.aiHint ? [source.aiHint] : []),
                    ],
                }),
            );
    };

    beforeAll(async () => {
        context = getTestContext();
        connectionModel = context.app
            .getModels()
            .getExternalConnectionModel<ExternalConnectionModel>();
        await context
            .db('feature_flags')
            .insert({
                flag_id: FeatureFlags.ApiQuerySources,
                default_enabled: true,
            })
            .onConflict('flag_id')
            .merge();
        agent = await getServices(context.app).aiAgentService.createAgent(
            context.testUser,
            {
                name: 'Live data source selection agent',
                description: null,
                projectUuid: SEED_PROJECT.project_uuid,
                tags: null,
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                mcpServerUuids: [],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
        );
        await Promise.all(SOURCES.map(seed));
    }, TIMEOUT);

    afterAll(async () => {
        const projectModel = context.app.getModels().getProjectModel();
        await Promise.all(
            seededUuids.map(async (uuid) => {
                await projectModel.deleteApiSourceExplores(
                    SEED_PROJECT.project_uuid,
                    uuid,
                );
                await connectionModel.softDelete(uuid);
            }),
        );
    });

    const runCases = () => {
        it.each(CASES)(
            'picks $name',
            async ({ prompt, expectedPrefix }) => {
                const { toolCalls } = await promptAndGetToolCalls(
                    context,
                    agent,
                    prompt,
                );
                expect(firstQueriedExplore(toolCalls)).toBe(
                    `${expectedPrefix}_performance`,
                );
            },
            TIMEOUT,
        );

        it(
            'asks when nothing tells the sources apart',
            async () => {
                const { toolCalls, response } = await promptAndGetToolCalls(
                    context,
                    agent,
                    'How many clicks did our site get last week?',
                );
                expect(firstQueriedExplore(toolCalls)).toBeUndefined();
                expect(response).toContain('?');
            },
            TIMEOUT,
        );
    };

    describe('with explores listed in the prompt', () => {
        runCases();
    });

    describe('with more than 15 explores, found by search', () => {
        beforeAll(async () => {
            await Promise.all(EXTRA_SOURCES.map(seed));
        }, TIMEOUT);

        runCases();
    });
});
