import type { Explore } from '@lightdash/common';
import { AgentContext } from './AgentContext';

describe('AgentContext', () => {
    const mockExplores: Explore[] = [
        { name: 'users', label: 'Users' } as Explore,
        { name: 'orders', label: 'Orders' } as Explore,
    ];

    describe('constructor', () => {
        it('should create context instance', () => {
            const ctx = new AgentContext(mockExplores);

            expect(ctx.getAvailableExplores()).toEqual(mockExplores);
        });

        it('should work with empty explores array', () => {
            const ctx = new AgentContext([]);

            expect(ctx.getAvailableExplores()).toEqual([]);
        });
    });

    describe('getAvailableExplores', () => {
        it('should return available explores', () => {
            const ctx = new AgentContext(mockExplores);

            expect(ctx.getAvailableExplores()).toEqual(mockExplores);
        });

        it('should return empty array when no explores', () => {
            const ctx = new AgentContext([]);

            expect(ctx.getAvailableExplores()).toEqual([]);
        });
    });

    describe('Slack table results', () => {
        it('clones rows when registering results and reading snapshots', () => {
            const ctx = new AgentContext([]);
            const queryResults = {
                rows: [{ value: { amount: 42 } }],
                fields: {},
            };
            ctx.registerSlackTableResults('query', queryResults);
            queryResults.rows[0].value.amount = 99;
            const firstSnapshot = ctx.getSlackTableResults();
            const firstResults = firstSnapshot.get('query');
            expect(firstResults).toEqual({
                rows: [{ value: { amount: 42 } }],
                fields: {},
                truncated: false,
            });
            if (!firstResults) throw new Error('Missing registered results');
            firstResults.rows[0].value = { amount: 100 };
            expect(ctx.getSlackTableResults().get('query')).toEqual({
                rows: [{ value: { amount: 42 } }],
                fields: {},
                truncated: false,
            });
        });

        it('bounds preview rows and records truncation', () => {
            const ctx = new AgentContext([]);
            const rows = Array.from({ length: 205 }, (_, value) => ({ value }));
            ctx.registerSlackTableResults('query', { rows, fields: {} });
            const results = ctx.getSlackTableResults().get('query');
            expect(results?.rows).toEqual(rows.slice(0, 200));
            expect(results?.truncated).toBe(true);
        });

        it('keeps at most ten query previews', () => {
            const ctx = new AgentContext([]);
            for (let value = 0; value < 11; value += 1) {
                ctx.registerSlackTableResults(`query-${value}`, {
                    rows: [{ value }],
                    fields: {},
                });
            }
            const results = ctx.getSlackTableResults();
            expect(results.size).toBe(10);
            expect(results.get('query-0')?.rows).toEqual([{ value: 0 }]);
            expect(results.has('query-10')).toBe(false);
        });

        it('returns a snapshot that excludes later tool executions', () => {
            const ctx = new AgentContext([]);
            ctx.registerSlackTableResults('first', {
                rows: [{ value: 1 }],
                fields: {},
            });
            const snapshot = ctx.getSlackTableResults();
            ctx.registerSlackTableResults('second', {
                rows: [{ value: 2 }],
                fields: {},
            });
            expect([...snapshot.keys()]).toEqual(['first']);
            expect([...ctx.getSlackTableResults().keys()]).toEqual([
                'first',
                'second',
            ]);
        });

        it('does not share query results between turns', () => {
            const firstTurn = new AgentContext([]);
            firstTurn.registerSlackTableResults('query', {
                rows: [{ value: 42 }],
                fields: {},
            });
            expect(new AgentContext([]).getSlackTableResults().size).toBe(0);
        });
    });

    describe('getExplore', () => {
        it('should get explore by name', () => {
            const ctx = new AgentContext(mockExplores);

            expect(ctx.getExplore('users')).toEqual(mockExplores[0]);
        });

        it('should throw when explore not found', () => {
            const ctx = new AgentContext(mockExplores);

            expect(() => ctx.getExplore('nonexistent')).toThrow(
                "Explore 'nonexistent' not found",
            );
        });

        it('should throw when explores array is empty', () => {
            const ctx = new AgentContext([]);

            expect(() => ctx.getExplore('users')).toThrow(
                "Explore 'users' not found",
            );
        });
    });
});
