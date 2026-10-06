import { type AiIdentityEvent } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { exclusionChangeRows } from './exclusionChanges';

const event: AiIdentityEvent = {
    aiIdentityEventUuid: 'one',
    aiIdentityAccountUuid: 'account',
    aiIdentityUuid: null,
    actorType: 'user',
    actorUserUuid: 'admin',
    actorName: 'Ana Admin',
    action: 'ai_role_created',
    targetCount: 1,
    status: 'success',
    detail: 'FINANCE_AI · Database: DB · Added: *_CLEAR · Removed: none',
    createdAt: new Date('2026-10-06T09:58:00Z'),
};

describe('exclusionChangeRows', () => {
    it('groups roles created together and puts newer changes first', () => {
        const rows = exclusionChangeRows([
            event,
            {
                ...event,
                aiIdentityEventUuid: 'two',
                detail: 'ANALYST_AI · Database: DB · Added: *_CLEAR · Removed: none',
            },
            {
                ...event,
                aiIdentityEventUuid: 'three',
                action: 'ai_role_exclusions_changed',
                detail: 'FINANCE_AI · Database: DB · Added: *_PII · Removed: *_RAW',
                createdAt: new Date('2026-10-06T11:52:00Z'),
            },
        ]);
        expect(rows.map(({ sentence }) => sentence)).toEqual([
            'Ana Admin excluded *_PII in FINANCE_AI',
            'Ana Admin removed *_RAW from FINANCE_AI',
            'Ana Admin created FINANCE_AI and ANALYST_AI, both excluding *_CLEAR',
        ]);
    });

    it.each([
        { createdAt: new Date('2026-10-06T10:00:00Z') },
        { actorUserUuid: 'another-admin' },
        { detail: 'ANALYST_AI · Database: DB · Added: *_RAW · Removed: none' },
        { aiIdentityAccountUuid: 'another-account' },
    ])('keeps distinct creation events separate: %j', (change) => {
        expect(
            exclusionChangeRows([
                event,
                { ...event, ...change, aiIdentityEventUuid: 'two' },
            ]),
        ).toHaveLength(2);
    });

    it('keeps database changes, deletions and roles without exclusions readable', () => {
        expect(
            exclusionChangeRows([
                {
                    ...event,
                    action: 'ai_role_exclusions_changed',
                    detail: 'FINANCE_AI · Database: DB to OTHER · Added: none · Removed: none',
                },
            ])[0].sentence,
        ).toBe('Ana Admin changed the database from DB to OTHER in FINANCE_AI');
        expect(
            exclusionChangeRows([{ ...event, action: 'ai_role_deleted' }])[0]
                .sentence,
        ).toBe('Ana Admin deleted FINANCE_AI');
        expect(
            exclusionChangeRows([
                {
                    ...event,
                    detail: 'FINANCE_AI · Database: DB · Added: none · Removed: none',
                },
            ])[0].sentence,
        ).toBe('Ana Admin created FINANCE_AI');
    });
});
