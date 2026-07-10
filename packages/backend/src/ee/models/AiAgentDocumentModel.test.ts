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

    describe('findAllContextForAgent', () => {
        it('only exposes content configured for every prompt', async () => {
            const baseRow = {
                ai_agent_document_uuid: DOCUMENT,
                organization_uuid: ORG,
                project_uuid: PROJECT,
                name: 'Metrics',
                original_filename: 'metrics.md',
                mime_type: 'text/markdown',
                content_size_bytes: 10,
                summary: {
                    description: 'Metric definitions',
                    definedTerms: [],
                    relatedExploreNames: [],
                    useWhen: '',
                    relevance: 'high',
                    warning: null,
                },
                storage_key: 'storage-key',
                agent_access: [AGENT],
                created_by_user_uuid: null,
                updated_by_user_uuid: null,
                created_at: new Date('2026-07-10T00:00:00Z'),
                updated_at: new Date('2026-07-10T00:00:00Z'),
            };
            tracker.on
                .select(() => true)
                .response([
                    {
                        ...baseRow,
                        content: 'Always available',
                        always_include_in_context: true,
                    },
                    {
                        ...baseRow,
                        ai_agent_document_uuid:
                            '55555555-5555-4555-8555-555555555555',
                        content: 'Retrieved only',
                        always_include_in_context: false,
                    },
                ]);

            const documents = await model.findAllContextForAgent({
                organizationUuid: ORG,
                agentUuid: AGENT,
                projectUuid: PROJECT,
            });

            expect(documents.map(({ content }) => content)).toEqual([
                'Always available',
                null,
            ]);
        });
    });

    describe('updateAlwaysIncludeInContext', () => {
        it('updates only the selected document', async () => {
            tracker.on.update(() => true).response(1);

            await model.updateAlwaysIncludeInContext({
                documentUuid: DOCUMENT,
                alwaysIncludeInContext: true,
                updatedByUserUuid: AGENT,
            });

            const [query] = tracker.history.update;
            expect(normalize(query.sql)).toContain(
                'where "ai_agent_document_uuid" = ?',
            );
            expect(query.bindings).toContain(DOCUMENT);
            expect(query.bindings).toContain(true);
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
