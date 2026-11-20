import { DuckDBInstance } from '@duckdb/node-api';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { aiFeatureNames, plainNameSql } from './plainNames';

const run = async (sql: string) => {
    const instance = await DuckDBInstance.create(':memory:');
    const db = await instance.connect();
    try {
        return (await db.runAndReadAll(sql)).getRowObjectsJS();
    } finally {
        db.closeSync();
        instance.closeSync();
    }
};

describe('plain names for recorded values', () => {
    it('uses the given names, reads other values in sentence case and names a missing value', async () => {
        const rows = await run(
            `SELECT ${plainNameSql('c', aiFeatureNames)} AS name FROM (VALUES (1, 'agent'), (2, 'agent-subtask'), (3, 'thread-title'), (4, 'saved_chart'), (5, NULL)) t(i, c) ORDER BY i`,
        );
        expect(rows.map(({ name }) => name)).toEqual([
            'Agents',
            'Agent tools',
            'Thread title',
            'Saved chart',
            'Unknown feature',
        ]);
    });

    it('names true and false, and leaves a missing value empty when no name is given for it', async () => {
        const rows = await run(
            `SELECT ${plainNameSql('c', { names: { true: 'Cache hit', false: 'Cache miss' } })} AS name FROM (VALUES (1, true), (2, false), (3, NULL)) t(i, c) ORDER BY i`,
        );
        expect(rows.map(({ name }) => name)).toEqual([
            'Cache hit',
            'Cache miss',
            null,
        ]);
    });

    it('adds the feature name to the AI usage explore beside the recorded value', () => {
        const { dimensions } = createAnalyticsExplores().find(
            ({ name }) => name === 'ai_usage',
        )!.tables.ai_usage;
        expect(dimensions.feature_name.compiledSql).toContain(
            "= 'agent-subtask' THEN 'Agent tools'",
        );
        expect(dimensions.feature.compiledSql).not.toContain('CASE');
    });
});
