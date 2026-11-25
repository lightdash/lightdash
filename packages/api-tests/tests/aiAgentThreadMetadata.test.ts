import {
    AI_THREAD_METADATA_MAX_KEYS,
    SEED_PROJECT,
    type AiAgentAdminConversationsSummary,
    type AiAgentThread,
    type AiAgentThreadSummary,
    type KnexPaginatedData,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const AGENTS_API_PREFIX = `/api/v1/projects/${projectUuid}/aiAgents`;
const ADMIN_THREADS_URL = '/api/v1/aiAgents/admin/threads';

describe('AI agent thread metadata', () => {
    let admin: ApiClient;
    let available = true;
    let agentUuid: string;

    const threadsUrl = () => `${AGENTS_API_PREFIX}/${agentUuid}/threads`;
    const listAdminThreads = async (query: Record<string, string>) => {
        const resp = await admin.get<
            Body<KnexPaginatedData<AiAgentAdminConversationsSummary>>
        >(`${ADMIN_THREADS_URL}?${new URLSearchParams(query).toString()}`);
        return resp.body.results.data.threads;
    };

    beforeAll(async () => {
        admin = await login();
        const agentResp = await admin.post<Body<{ uuid: string }>>(
            AGENTS_API_PREFIX,
            {
                projectUuid,
                name: uniqueName('thread metadata agent'),
                description: null,
                instruction: null,
                imageUrl: null,
                integrations: [],
                tags: null,
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                enableDataAccess: false,
                enableSelfImprovement: false,
                version: 3,
            },
            { failOnStatusCode: false },
        );
        if (agentResp.status === 403) {
            available = false;
            return;
        }
        expect(agentResp.status).toBe(201);
        agentUuid = agentResp.body.results.uuid;
    });

    afterAll(async () => {
        if (admin && agentUuid) {
            await admin.delete(`${AGENTS_API_PREFIX}/${agentUuid}`, {
                failOnStatusCode: false,
            });
        }
    });

    beforeEach((ctx) => {
        if (!available) ctx.skip();
    });

    it('stores metadata at creation, returns it and filters admin threads by it', async () => {
        const endUser = uniqueName('end-user');
        const metadata = { user: endUser, environment: 'stage' };
        const created = await admin.post<Body<AiAgentThreadSummary>>(
            threadsUrl(),
            { prompt: 'How many orders last week?', metadata },
        );
        expect(created.body.results.metadata).toEqual(metadata);
        const threadUuid = created.body.results.uuid;

        const opened = await admin.get<Body<AiAgentThread>>(
            `${threadsUrl()}/${threadUuid}`,
        );
        expect(opened.body.results.metadata).toEqual(metadata);

        const matching = await listAdminThreads({
            metadataKey: 'user',
            metadataValue: endUser,
        });
        expect(matching.map((t) => [t.uuid, t.metadata])).toEqual([
            [threadUuid, metadata],
        ]);
        expect(
            await listAdminThreads({
                metadataKey: 'user',
                metadataValue: `${endUser}-other`,
            }),
        ).toEqual([]);
        expect(
            (await listAdminThreads({ metadataKey: 'environment' })).map(
                (t) => t.uuid,
            ),
        ).toContain(threadUuid);
    });

    it('rejects metadata over the key limit', async () => {
        const metadata = Object.fromEntries(
            Array.from({ length: AI_THREAD_METADATA_MAX_KEYS + 1 }, (_, i) => [
                `key${i}`,
                'v',
            ]),
        );
        const resp = await admin.post(
            threadsUrl(),
            { prompt: 'hi', metadata },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
    });
});
