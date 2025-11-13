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

    describe('from', () => {
        it('should accept AgentContext instance', () => {
            const original = new AgentContext(mockExplores);
            const ctx = AgentContext.from(original);

            expect(ctx).toBe(original);
            expect(ctx.getAvailableExplores()).toEqual(mockExplores);
        });

        it('should throw error for non-AgentContext instance', () => {
            expect(() => AgentContext.from({})).toThrow(
                'Invalid agent context: expected AgentContext instance',
            );
        });

        it('should throw error for null context', () => {
            expect(() => AgentContext.from(null)).toThrow(
                'Invalid agent context',
            );
        });

        it('should throw error for undefined context', () => {
            expect(() => AgentContext.from(undefined)).toThrow(
                'Invalid agent context',
            );
        });

        it('should throw error for plain object', () => {
            expect(() =>
                AgentContext.from({ availableExplores: mockExplores }),
            ).toThrow('Invalid agent context');
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
