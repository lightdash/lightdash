import {
    AI_THREAD_CONTEXT_MAX_LENGTH,
    CreateEmbedJwt,
    JWT_HEADER_NAME,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type AiAgentThread,
    type AiAgentThreadSummary,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const EMBED_API_PREFIX = `/api/v1/embed/${projectUuid}`;
const AGENTS_API_PREFIX = `/api/v1/projects/${projectUuid}/aiAgents`;

describe('Embedded AI agent threads bound to a dashboard', () => {
    let admin: ApiClient;
    let available = true;
    const tracker = new TestResourceTracker();
    let agentUuid: string;
    let tenantAToken: string;
    let tenantBToken: string;
    let tenantADashboardUuid: string;
    let tenantBDashboardUuid: string;

    const threadsUrl = () => `${AGENTS_API_PREFIX}/${agentUuid}/threads`;
    const asTenant = (token: string) => ({
        headers: { [JWT_HEADER_NAME]: token },
        failOnStatusCode: false,
    });

    const createSpace = async (name: string) => {
        const resp = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/spaces`,
            { name: uniqueName(name), isPrivate: false },
        );
        tracker.trackSpace(resp.body.results.uuid);
        return resp.body.results.uuid;
    };
    const createDashboard = async (name: string, spaceUuid: string) => {
        const resp = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName(name), spaceUuid, tiles: [], tabs: [] },
        );
        tracker.trackDashboard(resp.body.results.uuid);
        return resp.body.results.uuid;
    };
    const createTenantToken = async (spaceUuid: string, externalId: string) => {
        const jwt: CreateEmbedJwt = {
            content: { type: 'aiAgent', agentUuid, projectUuid },
            writeActions: { userUuid: SEED_ORG_1_ADMIN.user_uuid, spaceUuid },
            user: { externalId },
            expiresIn: '1h',
        };
        const resp = await admin.post<Body<{ url: string }>>(
            `${EMBED_API_PREFIX}/get-embed-url`,
            jwt,
        );
        return resp.body.results.url.split('#')[1];
    };

    beforeAll(async () => {
        admin = await login();
        const configResp = await admin.get(`${EMBED_API_PREFIX}/config`, {
            failOnStatusCode: false,
        });
        if (configResp.status === 403) {
            available = false;
            return;
        }
        const agentResp = await admin.post<Body<{ uuid: string }>>(
            AGENTS_API_PREFIX,
            {
                projectUuid,
                name: uniqueName('thread binding agent'),
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
        if (agentResp.status !== 201) {
            available = false;
            return;
        }
        agentUuid = agentResp.body.results.uuid;

        const tenantASpaceUuid = await createSpace('tenant A space');
        const tenantBSpaceUuid = await createSpace('tenant B space');
        tenantADashboardUuid = await createDashboard(
            'tenant A dashboard',
            tenantASpaceUuid,
        );
        tenantBDashboardUuid = await createDashboard(
            'tenant B dashboard',
            tenantBSpaceUuid,
        );
        tenantAToken = await createTenantToken(tenantASpaceUuid, 'tenant-a');
        tenantBToken = await createTenantToken(tenantBSpaceUuid, 'tenant-b');
    });

    afterAll(async () => {
        if (!admin) return;
        if (agentUuid) {
            await admin.delete(`${AGENTS_API_PREFIX}/${agentUuid}`, {
                failOnStatusCode: false,
            });
        }
        await tracker.cleanup(admin);
    });

    beforeEach((ctx) => {
        if (!available) ctx.skip();
    });

    it("creates a bound thread in the tenant's embed space and keeps other tenants out", async () => {
        const threadContext = 'Summary of the sandbox conversation';
        const prompt = 'What changed since last week?';
        const created = await new ApiClient().post<Body<AiAgentThreadSummary>>(
            threadsUrl(),
            {
                prompt,
                binding: {
                    type: 'dashboard',
                    dashboardUuid: tenantBDashboardUuid,
                },
                threadContext,
            },
            asTenant(tenantBToken),
        );
        expect(created.status).toBe(200);
        expect(created.body.results).toMatchObject({
            binding: {
                type: 'dashboard',
                dashboardUuid: tenantBDashboardUuid,
            },
            threadContext,
            firstMessage: { message: prompt },
        });
        const threadUuid = created.body.results.uuid;

        const openedByB = await new ApiClient().get<Body<AiAgentThread>>(
            `${threadsUrl()}/${threadUuid}`,
            asTenant(tenantBToken),
        );
        expect(openedByB.status).toBe(200);
        expect(openedByB.body.results).toMatchObject({
            uuid: threadUuid,
            binding: {
                type: 'dashboard',
                dashboardUuid: tenantBDashboardUuid,
            },
            threadContext,
        });
        expect(openedByB.body.results.messages[0]).toMatchObject({
            role: 'user',
            message: prompt,
        });

        const listedByB = await new ApiClient().get<
            Body<AiAgentThreadSummary[]>
        >(threadsUrl(), asTenant(tenantBToken));
        expect(listedByB.status).toBe(200);
        expect(listedByB.body.results.map((t) => t.uuid)).toContain(threadUuid);

        const openedByA = await new ApiClient().get(
            `${threadsUrl()}/${threadUuid}`,
            asTenant(tenantAToken),
        );
        expect(openedByA.status).toBe(403);
    });

    it('rejects a dashboard outside the embed space', async () => {
        const resp = await new ApiClient().post(
            threadsUrl(),
            {
                prompt: 'hi',
                binding: {
                    type: 'dashboard',
                    dashboardUuid: tenantADashboardUuid,
                },
            },
            asTenant(tenantBToken),
        );
        expect(resp.status).toBe(403);
    });

    it('rejects an unknown dashboard', async () => {
        const resp = await admin.post(
            threadsUrl(),
            {
                prompt: 'hi',
                binding: { type: 'dashboard', dashboardUuid: randomUUID() },
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(404);
    });

    it('rejects a thread context over the length cap', async () => {
        const resp = await new ApiClient().post(
            threadsUrl(),
            {
                prompt: 'hi',
                threadContext: 'x'.repeat(AI_THREAD_CONTEXT_MAX_LENGTH + 1),
            },
            asTenant(tenantBToken),
        );
        expect(resp.status).toBe(400);
    });

    it('requires a prompt with a binding', async () => {
        const resp = await new ApiClient().post(
            threadsUrl(),
            {
                binding: {
                    type: 'dashboard',
                    dashboardUuid: tenantBDashboardUuid,
                },
            },
            asTenant(tenantBToken),
        );
        expect(resp.status).toBe(400);
    });

    it('leaves threads created without the new fields unbound', async () => {
        const resp = await new ApiClient().post<Body<AiAgentThreadSummary>>(
            threadsUrl(),
            { prompt: 'How many orders are there?' },
            asTenant(tenantBToken),
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toMatchObject({
            binding: null,
            threadContext: null,
            firstMessage: { message: 'How many orders are there?' },
        });
    });
});
