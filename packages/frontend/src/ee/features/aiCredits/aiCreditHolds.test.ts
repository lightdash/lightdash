import { type AiCreditHold } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { findBlockingAiCreditHold } from './aiCreditHolds';

const hold = (reason: AiCreditHold['reason']): AiCreditHold => ({
    uuid: `hold-${reason}`,
    organizationUuid: 'org-1',
    userUuid: null,
    contractUuid: null,
    reason,
    notes: null,
    placedBy: 'system',
    placedAt: new Date('2026-09-29T12:00:00Z'),
    expiresAt: null,
    releasedAt: null,
});

const contract = (allowanceMode: 'warn' | 'enforce') => ({
    uuid: 'contract-1',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: null,
    resetIntervalMonths: 1,
    allowanceCredits: 1000,
    allowanceMode,
});

describe('findBlockingAiCreditHold', () => {
    it('keeps AI working when a warn-only allowance is used up', () => {
        expect(
            findBlockingAiCreditHold({
                activeHolds: [hold('allowance_exhausted')],
                contract: contract('warn'),
            }),
        ).toBeNull();
    });

    it('shows AI as paused when an enforced allowance is used up', () => {
        expect(
            findBlockingAiCreditHold({
                activeHolds: [hold('allowance_exhausted')],
                contract: contract('enforce'),
            })?.reason,
        ).toBe('allowance_exhausted');
    });

    it('shows AI as paused for a manual pause whatever the contract says', () => {
        expect(
            findBlockingAiCreditHold({
                activeHolds: [hold('manual_pause')],
                contract: null,
            })?.reason,
        ).toBe('manual_pause');
    });
});
