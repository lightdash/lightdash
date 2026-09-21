import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AiAgentModel } from './AiAgentModel';

describe('verified artifact candidate scope', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiAgentModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: {} as never,
    });
    const tracker = getTracker();
    afterEach(() => tracker.reset());

    it.each([false, true])(
        'retains verified agent/project/org and embedding scope (semantic=%s)',
        async (semanticCandidates) => {
            tracker.on.select('ai_artifact_versions').responseOnce([]);
            await model.searchArtifactsBySimilarity({
                organizationUuid: 'org',
                projectUuid: 'project',
                agentUuid: 'agent',
                queryEmbedding: [1, 0],
                embeddingModelProvider: 'provider',
                embeddingModel: 'model',
                limit: semanticCandidates ? 30 : 3,
                semanticCandidates,
            });
            const statement = tracker.history.select[0];
            expect(statement.bindings).toEqual(
                expect.arrayContaining([
                    'org',
                    'project',
                    'agent',
                    'provider',
                    'model',
                ]),
            );
            expect(statement.sql).toContain(
                '"ai_thread"."organization_uuid" =',
            );
            expect(statement.sql).toContain('"ai_thread"."project_uuid" =');
            expect(statement.sql).toContain('"ai_thread"."agent_uuid" =');
            expect(statement.sql).toContain(
                '"verified_by_user_uuid" is not null',
            );
            expect(statement.sql).toContain('"chart_config" is not null');
            expect(statement.sql).toContain('"embedding_vector" is not null');
            expect(/\) > [$?]/.test(statement.sql)).toBe(!semanticCandidates);
            expect(statement.bindings.at(-1)).toBe(semanticCandidates ? 30 : 3);
        },
    );
});
