import {
    FeatureFlags,
    type AiAgentThreadSummary,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';
import { postgresWarehouseConfig } from '../helpers/projects';

const REPLY_TIMEOUT_MS = 840_000;

type ThreadMessages = {
    messages: { role: string; status?: string; message: string | null }[];
};

/**
 * A first eval of the Semantic Studio agent on a project with nothing modelled:
 * each case asks for one thing in a fresh thread and scores what lands in the
 * person's draft. Cases run in order and build on the draft so far.
 */
describe('Semantic Studio agent', () => {
    let admin: ApiClient;
    let projectUuid: string;
    let agentUuid: string;
    let clearFlag = false;
    const flagUrl = `/api/v2/feature-flag/${FeatureFlags.SemanticStudioEditing}`;
    const studio = () => `/api/v1/projects/${projectUuid}/semantic-studio`;

    const readDraft = async (): Promise<SemanticLayerDraft> =>
        (await admin.get<Body<SemanticLayerDraft>>(`${studio()}/draft`)).body
            .results;

    /** Asks in a new thread, waits for the reply, and returns it with the draft it left. */
    const ask = async (prompt: string) => {
        const agent = `/api/v1/projects/${projectUuid}/aiAgents/${agentUuid}`;
        const thread = await admin.post<Body<AiAgentThreadSummary>>(
            `${agent}/threads`,
            { prompt, createdFrom: 'semantic_studio' },
        );
        expect(thread.status).toBe(200);
        const threadUrl = `${agent}/threads/${thread.body.results.uuid}`;
        // A reply can outlast the client's wait for a response, so it is started and then watched.
        admin.post(`${threadUrl}/generate`, {}).catch(() => undefined);
        const settled = await pollUntil<Body<ThreadMessages>>(
            admin,
            threadUrl,
            {
                timeout: REPLY_TIMEOUT_MS,
                interval: 5_000,
                condition: ({ results }) => {
                    const last = results.messages.at(-1);
                    return last?.role === 'assistant' && last.status === 'idle';
                },
            },
        );
        return {
            response: settled.results.messages.at(-1)?.message ?? '',
            draft: await readDraft(),
        };
    };

    const changesOf = (draft: SemanticLayerDraft) =>
        draft.changes.flatMap(({ models }) =>
            models.flatMap(({ model, changes }) =>
                changes.map((change) => ({ model, ...change })),
            ),
        );

    const expectSound = (draft: SemanticLayerDraft) => {
        expect(draft.errors).toEqual([]);
        expect(
            draft.changes.flatMap(({ models }) =>
                models.flatMap(({ error }) => (error ? [error] : [])),
            ),
        ).toEqual([]);
    };

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
        const project = await admin.post<
            Body<{ project: { projectUuid: string } }>
        >('/api/v1/org/projects', {
            name: `Semantic Studio eval ${Date.now()}`,
            type: 'DEFAULT',
            dbtVersion: 'v1.10',
            dbtConnection: { type: 'none' },
            warehouseConnection: postgresWarehouseConfig(),
        });
        expect(project.status).toBe(200);
        projectUuid = project.body.results.project.projectUuid;
        const agent = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/aiAgents`,
            {
                projectUuid,
                name: 'Semantic Studio eval',
                description: null,
                instruction: null,
                imageUrl: null,
                integrations: [],
                tags: null,
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
        );
        expect(agent.status).toBe(201);
        agentUuid = agent.body.results.uuid;
    });

    afterAll(async () => {
        if (projectUuid) {
            await admin.delete(`/api/v1/org/projects/${projectUuid}`);
        }
        if (clearFlag) await admin.delete(flagUrl);
    });

    it('builds a first model that compiles and publishes', async () => {
        const { draft } = await ask(
            'Create a model on the orders table with its key and a count of orders.',
        );
        expectSound(draft);
        expect(draft.models).toHaveLength(1);
        expect(draft.models[0].contentBefore).toBeNull();
        expect(draft.models[0].explore).not.toBeNull();
        const applied = await admin.post<Body<SemanticLayerDraftApplyResult>>(
            `${studio()}/draft/apply`,
            {},
        );
        expect(applied.body.results.failures).toEqual([]);
        expect((await readDraft()).changes).toEqual([]);
    });

    it('adds a metric without touching anything else', async () => {
        const { draft } = await ask(
            'Add a metric for the number of distinct customers who placed an order.',
        );
        expectSound(draft);
        const changes = changesOf(draft);
        expect(changes.length).toBeGreaterThan(0);
        expect(changes.every(({ action }) => action === 'added')).toBe(true);
        // The metric can arrive inside a dimension added to carry it, so the model is read, not the path.
        expect(draft.models[0].contentAfter).toContain('count_distinct');
        expect(draft.models).toHaveLength(1);
        expect(draft.models[0].explore).not.toBeNull();
    });

    it('changes only the label when asked for a label', async () => {
        const before = changesOf(await readDraft()).length;
        const { draft } = await ask(
            'Change the label of the orders model to Sales orders.',
        );
        expectSound(draft);
        expect(changesOf(draft).slice(before)).toEqual([
            expect.objectContaining({ path: 'label' }),
        ]);
    });

    it('does not invent a column', async () => {
        const before = changesOf(await readDraft()).length;
        const { draft } = await ask(
            "Add a dimension for the customer's shoe size to the orders model.",
        );
        expectSound(draft);
        expect(changesOf(draft)).toHaveLength(before);
    });

    it('asks instead of guessing at a request with no target', async () => {
        const before = changesOf(await readDraft()).length;
        const { draft, response } = await ask('Make it better.');
        expect(changesOf(draft)).toHaveLength(before);
        expect(response).toContain('?');
    });

    it('does not edit a model that does not exist', async () => {
        const before = changesOf(await readDraft()).length;
        const { draft } = await ask(
            'Remove the metric total_widgets from the shipments model.',
        );
        expectSound(draft);
        expect(changesOf(draft)).toHaveLength(before);
    });

    it('adds a second model and joins it to the first', async () => {
        const { draft } = await ask(
            'Add a model on the customers table and join it to the orders model.',
        );
        expectSound(draft);
        expect(draft.models).toHaveLength(2);
        expect(draft.models.every(({ explore }) => explore !== null)).toBe(
            true,
        );
        expect(
            changesOf(draft).some(({ path }) => path.startsWith('joins.')),
        ).toBe(true);
    });

    it('publishes the whole draft', async () => {
        const applied = await admin.post<Body<SemanticLayerDraftApplyResult>>(
            `${studio()}/draft/apply`,
            {},
        );
        expect(applied.body.results.failures).toEqual([]);
    });
});
