import { describe, expect, it } from 'vitest';
import { getAiAgentThreadReadOnly } from './aiAgentThreadReadOnly';

describe('getAiAgentThreadReadOnly', () => {
    it.each([
        {
            name: 'legacy thread',
            input: {
                storageVersion: 1 as const,
                createdFrom: 'web_app' as const,
                ownerUserUuid: 'viewer',
                viewerUserUuid: 'viewer',
            },
            expected: { readOnly: true, readOnlyReason: 'legacy' },
        },
        {
            name: 'Slack thread',
            input: {
                storageVersion: 3 as const,
                createdFrom: 'slack' as const,
                ownerUserUuid: 'viewer',
                viewerUserUuid: 'viewer',
            },
            expected: { readOnly: true, readOnlyReason: 'slack' },
        },
        {
            name: "another user's thread",
            input: {
                storageVersion: 3 as const,
                createdFrom: 'web_app' as const,
                ownerUserUuid: 'owner',
                viewerUserUuid: 'viewer',
            },
            expected: { readOnly: true, readOnlyReason: 'not_owner' },
        },
        {
            name: "viewer's v3 web thread",
            input: {
                storageVersion: 3 as const,
                createdFrom: 'web_app' as const,
                ownerUserUuid: 'viewer',
                viewerUserUuid: 'viewer',
            },
            expected: { readOnly: false, readOnlyReason: null },
        },
    ])('computes capability for $name', ({ input, expected }) => {
        expect(getAiAgentThreadReadOnly(input)).toEqual(expected);
    });

    it('reports legacy before other read-only reasons', () => {
        expect(
            getAiAgentThreadReadOnly({
                storageVersion: 1,
                createdFrom: 'slack',
                ownerUserUuid: 'owner',
                viewerUserUuid: 'viewer',
            }),
        ).toEqual({ readOnly: true, readOnlyReason: 'legacy' });
    });
});
