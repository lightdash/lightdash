import { describe, expect, it } from 'vitest';
import {
    getOrganizationJoinRequestExpiry,
    getOrganizationJoinRequestStatus,
    isOrganizationJoinRequestLimitReached,
    ORGANIZATION_JOIN_REQUEST_DAILY_LIMIT,
    OrganizationJoinRequestStatus,
} from './organizationLanding';

const createdAt = new Date('2026-10-01T10:00:00Z');

describe('getOrganizationJoinRequestExpiry', () => {
    it('is 14 days after the request', () => {
        expect(getOrganizationJoinRequestExpiry(createdAt)).toEqual(
            new Date('2026-10-15T10:00:00Z'),
        );
    });
});

describe('getOrganizationJoinRequestStatus', () => {
    const expiresAt = getOrganizationJoinRequestExpiry(createdAt);

    it('keeps a pending request pending before it expires', () => {
        expect(
            getOrganizationJoinRequestStatus(
                { status: OrganizationJoinRequestStatus.PENDING, expiresAt },
                new Date('2026-10-14T10:00:00Z'),
            ),
        ).toBe(OrganizationJoinRequestStatus.PENDING);
    });

    it('reads a pending request past its expiry as expired', () => {
        expect(
            getOrganizationJoinRequestStatus(
                { status: OrganizationJoinRequestStatus.PENDING, expiresAt },
                expiresAt,
            ),
        ).toBe(OrganizationJoinRequestStatus.EXPIRED);
    });

    it('keeps a decision after the expiry date', () => {
        expect(
            getOrganizationJoinRequestStatus(
                { status: OrganizationJoinRequestStatus.DECLINED, expiresAt },
                new Date('2026-11-01T00:00:00Z'),
            ),
        ).toBe(OrganizationJoinRequestStatus.DECLINED);
    });
});

describe('isOrganizationJoinRequestLimitReached', () => {
    it('allows requests below the daily limit', () => {
        expect(
            isOrganizationJoinRequestLimitReached(
                ORGANIZATION_JOIN_REQUEST_DAILY_LIMIT - 1,
            ),
        ).toBe(false);
    });

    it('refuses at the daily limit', () => {
        expect(
            isOrganizationJoinRequestLimitReached(
                ORGANIZATION_JOIN_REQUEST_DAILY_LIMIT,
            ),
        ).toBe(true);
    });
});
