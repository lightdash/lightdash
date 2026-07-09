import { knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { AiAgentDocumentModel } from './AiAgentDocumentModel';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const AGENT = '33333333-3333-4333-8333-333333333333';
const DOCUMENT = '44444444-4444-4444-8444-444444444444';

/** Collapse whitespace so the assertions read against a single line of SQL. */
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase();

describe('AiAgentDocumentModel agent scope', () => {
    let tracker: Tracker;
    const database = knex({ client: MockClient });
    const model = new AiAgentDocumentModel({ database });

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    const capture = async (
        run: () => Promise<unknown>,
    ): Promise<{ sql: string; bindings: unknown[] }> => {
        tracker.on.select(() => true).response([]);
        await run();
        const [query] = tracker.history.select;
        return { sql: normalize(query.sql), bindings: query.bindings };
    };

    describe('findAllForAgent', () => {
        it('only treats a document as org level when it has no project AND no grants', async () => {
            const { sql } = await capture(() =>
                model.findAllForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: PROJECT,
                }),
            );

            // Org level branch: both conditions, never project_uuid is null alone
            expect(sql).toContain(
                '(("ai_agent_document"."project_uuid" is null and not exists',
            );
        });

        it('requires an explicit grant for a project document', async () => {
            const { sql } = await capture(() =>
                model.findAllForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: PROJECT,
                }),
            );

            expect(sql).toContain(
                'exists ( select 1 from "ai_agent_document_access"',
            );
            expect(sql).toContain('access.ai_agent_uuid = ?');
        });

        it('scopes the organization filter outside the OR group so it cannot be bypassed', async () => {
            const { sql, bindings } = await capture(() =>
                model.findAllForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: PROJECT,
                }),
            );

            // The org predicate must be ANDed with a parenthesised scope group.
            // If the OR ever escapes its parentheses, every document in every
            // organization matches. This is the regression this file exists for.
            expect(sql).toMatch(/"organization_uuid" = \? and \(\(/);
            expect(bindings).toContain(ORG);
            expect(bindings).toContain(AGENT);
            expect(bindings).toContain(PROJECT);
        });

        it('never matches a project document when the agent has no project', async () => {
            const { sql, bindings } = await capture(() =>
                model.findAllForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: null,
                }),
            );

            expect(bindings).not.toContain(PROJECT);
            // Granted branch still allows a granted document with no project
            expect(sql).toContain('"ai_agent_document"."project_uuid" is null');
        });
    });

    describe('shared predicate', () => {
        it('findAccessibleForAgent scopes by document, organization and agent', async () => {
            const { sql, bindings } = await capture(() =>
                model.findAccessibleForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: PROJECT,
                    documentUuid: DOCUMENT,
                }),
            );

            expect(sql).toMatch(/"organization_uuid" = \? and \(\(/);
            expect(bindings).toContain(DOCUMENT);
            expect(bindings).toContain(AGENT);
        });

        it('getContentForAgent applies the same project scope as listing', async () => {
            const { sql, bindings } = await capture(() =>
                model.getContentForAgent({
                    organizationUuid: ORG,
                    agentUuid: AGENT,
                    projectUuid: PROJECT,
                    documentUuid: DOCUMENT,
                }),
            );

            // Without the project scope an agent could read a document it cannot list
            expect(bindings).toContain(PROJECT);
            expect(sql).toMatch(/"organization_uuid" = \? and \(\(/);
        });
    });
});
