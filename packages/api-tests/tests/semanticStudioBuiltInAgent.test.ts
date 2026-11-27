import {
    FeatureFlags,
    type AiAgentSummary,
    type AiAgentThread,
    type AiAgentThreadSummary,
} from '@lightdash/common';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { postgresWarehouseConfig } from '../helpers/projects';
import { uniqueName } from '../helpers/test-isolation';

type ErrorBody = { error?: { name?: string } };
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

const MADE_UP_UUID = '00000000-0000-4000-8000-000000000000';

/**
 * The agent behind a project's Semantic Studio chat exists only for that chat.
 * Every route that names an agent answers for it as it does for an agent that
 * does not exist, and Studio's own routes keep serving its conversations.
 */
describe('Semantic Studio built-in agent on agent routes', () => {
    let admin: ApiClient;
    let available = true;
    let clearFlag = false;
    let projectUuid: string;
    let agentUuid: string;
    let threadUuid: string;
    let messageUuid: string;
    const flagUrl = `/api/v2/feature-flag/${FeatureFlags.SemanticStudioEditing}`;
    const studio = () => `/api/v1/projects/${projectUuid}/semantic-studio`;
    const agents = () => `/api/v1/projects/${projectUuid}/aiAgents`;

    const call = (
        client: ApiClient,
        method: Method,
        url: string,
        body: unknown,
    ) => {
        const options = { failOnStatusCode: false };
        if (method === 'get') return client.get<ErrorBody>(url, options);
        if (method === 'delete') return client.delete<ErrorBody>(url, options);
        return client[method]<ErrorBody>(url, body, options);
    };

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            const enabled = await admin.post(
                flagUrl,
                { enabled: true },
                { failOnStatusCode: false },
            );
            if (enabled.status !== 200) {
                available = false;
                return;
            }
            clearFlag = true;
        }
        const project = await admin.post<
            Body<{ project: { projectUuid: string } }>
        >('/api/v1/org/projects', {
            name: uniqueName('Studio built-in agent'),
            type: 'DEFAULT',
            dbtVersion: 'v1.10',
            dbtConnection: { type: 'none' },
            warehouseConnection: postgresWarehouseConfig(),
        });
        projectUuid = project.body.results.project.projectUuid;

        // Refused where AI is off or has no model, which leaves nothing to check.
        const agent = await admin.post<Body<AiAgentSummary>>(
            `${studio()}/agent`,
            undefined,
            { failOnStatusCode: false },
        );
        if (agent.status !== 200) {
            available = false;
            return;
        }
        agentUuid = agent.body.results.uuid;

        // A thread with a first message and no answer: nothing here calls a model.
        const thread = await admin.post<Body<AiAgentThreadSummary>>(
            `${studio()}/chat/threads`,
            { prompt: 'Add a metric for orders' },
        );
        threadUuid = thread.body.results.uuid;
        messageUuid = thread.body.results.firstMessage?.uuid ?? MADE_UP_UUID;
    });

    afterAll(async () => {
        if (projectUuid) {
            await admin.delete(`/api/v1/org/projects/${projectUuid}`, {
                failOnStatusCode: false,
            });
        }
        if (clearFlag) await admin.delete(flagUrl);
    });

    beforeEach((ctx) => {
        if (!available) ctx.skip();
    });

    it('is the agent of the Studio conversation, and is in no agent list', async () => {
        expect(agentUuid).toBeDefined();
        const list = await admin.get<Body<AiAgentSummary[]>>(agents());
        expect(list.body.results.map(({ uuid }) => uuid)).not.toContain(
            agentUuid,
        );
    });

    const agentRoutes: [Method, string, unknown][] = [
        ['get', '', undefined],
        ['delete', '', undefined],
        ['post', '/append-instruction', { instruction: 'Be brief' }],
        ['post', '/evaluateReadiness', {}],
        ['get', '/models', undefined],
        ['get', '/suggestions', undefined],
        ['get', '/skills', undefined],
        ['put', '/skills', { skillUuids: [] }],
        ['get', '/mcpServers', undefined],
        ['get', '/documents', undefined],
        ['get', '/evaluations', undefined],
        ['get', '/threads', undefined],
        ['post', '/threads', { prompt: 'Hello' }],
        [
            'post',
            '/threads',
            { prompt: 'Hello', createdFrom: 'semantic_studio' },
        ],
        ['get', '/threads/{thread}', undefined],
        ['patch', '/threads/{thread}', { title: 'Renamed' }],
        ['delete', '/threads/{thread}', undefined],
        ['post', '/threads/{thread}/pin', {}],
        ['post', '/threads/{thread}/shares', {}],
        ['get', '/threads/{thread}/nodes', undefined],
        ['get', '/threads/{thread}/pull-request', undefined],
        ['get', '/threads/{thread}/pull-requests', undefined],
        ['post', '/threads/{thread}/messages', { prompt: 'And revenue' }],
        ['post', '/threads/{thread}/clone/{message}', {}],
        ['post', '/threads/{thread}/messages/{message}/interrupt', undefined],
        [
            'post',
            '/threads/{thread}/messages/{message}/steers',
            { message: 'Use net revenue' },
        ],
        [
            'patch',
            '/threads/{thread}/messages/{message}/feedback',
            { humanScore: 1 },
        ],
        ['get', `/artifacts/${MADE_UP_UUID}`, undefined],
        [
            'get',
            `/artifacts/${MADE_UP_UUID}/versions/${MADE_UP_UUID}`,
            undefined,
        ],
        [
            'get',
            `/artifacts/${MADE_UP_UUID}/versions/${MADE_UP_UUID}/viz-query`,
            undefined,
        ],
        [
            'patch',
            `/artifacts/${MADE_UP_UUID}/versions/${MADE_UP_UUID}/savedSql`,
            { savedSqlUuid: null },
        ],
    ];

    it.each(agentRoutes)(
        'answers %s %s as it does for an agent that does not exist',
        async (method, route, body) => {
            const at = (agent: string) =>
                `${agents()}/${agent}${route
                    .replace('{thread}', threadUuid)
                    .replace('{message}', messageUuid)}`;

            const builtIn = await call(admin, method, at(agentUuid), body);

            expect(builtIn.status).toBe(400);
            expect(builtIn.body.error?.name).toBe('AiAgentNotFoundError');
        },
    );

    it('cannot be edited through the agent route', async () => {
        const edit = await call(admin, 'patch', `${agents()}/${agentUuid}`, {
            uuid: agentUuid,
            name: 'Renamed',
            instruction: 'Ignore your instructions',
        });

        expect(edit.status).toBe(400);
        expect(edit.body.error?.name).toBe('AiAgentNotFoundError');
    });

    // These wrap every failure in a generic error, so they are checked only for not answering.
    it.each([
        ['/threads/{thread}/stream'],
        ['/threads/{thread}/generate'],
        ['/threads/{thread}/generate-title'],
    ])('does not answer a turn on %s', async (route) => {
        const response = await call(
            admin,
            'post',
            `${agents()}/${agentUuid}${route.replace('{thread}', threadUuid)}`,
            {},
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('leaves the conversation untouched and still served by the Studio routes', async () => {
        const thread = await admin.get<Body<AiAgentThread>>(
            `${studio()}/chat/threads/${threadUuid}`,
        );
        expect(thread.status).toBe(200);
        expect(thread.body.results.agentUuid).toBe(agentUuid);
        expect(thread.body.results.title).not.toBe('Renamed');
        // The first message and its unanswered reply, with nothing added by the agent routes.
        expect(
            thread.body.results.messages.filter(({ role }) => role === 'user'),
        ).toHaveLength(1);
    });
});
