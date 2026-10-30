import {
    isProjectAllowedForMcp,
    isSameMcpProjectAccess,
} from './mcpProjectAccess';

describe('organization MCP project access', () => {
    it('preserves access to every project in all mode', () => {
        expect(isProjectAllowedForMcp({ mode: 'all' }, 'project-b')).toBe(true);
    });

    it('only allows listed projects in selected mode', () => {
        const policy = {
            mode: 'selected' as const,
            projectUuids: ['project-a'],
        };
        expect(isProjectAllowedForMcp(policy, 'project-a')).toBe(true);
        expect(isProjectAllowedForMcp(policy, 'project-b')).toBe(false);
    });

    it('denies every project when selected is empty', () => {
        expect(
            isProjectAllowedForMcp(
                { mode: 'selected', projectUuids: [] },
                'project-a',
            ),
        ).toBe(false);
    });
});

describe('MCP project policy equality', () => {
    it('compares all mode and distinguishes selected mode including an empty list', () => {
        expect(isSameMcpProjectAccess({ mode: 'all' }, { mode: 'all' })).toBe(
            true,
        );
        expect(
            isSameMcpProjectAccess(
                { mode: 'all' },
                { mode: 'selected', projectUuids: [] },
            ),
        ).toBe(false);
        expect(
            isSameMcpProjectAccess(
                { mode: 'selected', projectUuids: [] },
                { mode: 'all' },
            ),
        ).toBe(false);
    });

    it('compares selected project sets independently of order and duplicates', () => {
        expect(
            isSameMcpProjectAccess(
                { mode: 'selected', projectUuids: ['b', 'a', 'a'] },
                { mode: 'selected', projectUuids: ['a', 'b'] },
            ),
        ).toBe(true);
        expect(
            isSameMcpProjectAccess(
                { mode: 'selected', projectUuids: ['a'] },
                { mode: 'selected', projectUuids: ['b'] },
            ),
        ).toBe(false);
        expect(
            isSameMcpProjectAccess(
                { mode: 'selected', projectUuids: ['a'] },
                { mode: 'selected', projectUuids: ['a', 'b'] },
            ),
        ).toBe(false);
        expect(
            isSameMcpProjectAccess(
                { mode: 'selected', projectUuids: [] },
                { mode: 'selected', projectUuids: [] },
            ),
        ).toBe(true);
    });
});
