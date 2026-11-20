import { describe, expect, it } from 'vitest';
import { listTurnIssues } from './proposalIssues';

const attempt = (status: 'ready' | 'failed', error: string | null) => ({
    models: [{ model: 'orders', status, changes: [], refusals: [], error }],
});

describe('listTurnIssues', () => {
    it('drops a failure the agent fixed later in the same turn', () => {
        expect(
            listTurnIssues([
                attempt('failed', 'The warehouse rejected this model'),
                attempt('ready', null),
            ]),
        ).toEqual([]);
    });

    it('keeps a failure nothing fixed, and one that came after a success', () => {
        const failed = attempt('failed', 'The warehouse rejected this model');
        const issue = {
            kind: 'failed',
            model: 'orders',
            detail: 'The warehouse rejected this model',
        };
        expect(listTurnIssues([failed])).toEqual([issue]);
        expect(listTurnIssues([attempt('ready', null), failed])).toEqual([
            issue,
        ]);
    });
});
