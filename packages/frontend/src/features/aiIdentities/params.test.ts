import {
    AiIdentityFailureReason,
    AiIdentitySort,
    AiIdentityState,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getAiIdentityFilter,
    getAiIdentityListParams,
    getAiIdentitySort,
    getAiIdentityTab,
} from './params';

describe('AI identity URL parameters', () => {
    it('reads a shareable view and preserves its server filters', () => {
        const params = new URLSearchParams(
            'tab=triage&state=failed&reason=key_or_user_rejected&project=project-1&stale=true&sort=last_checked',
        );
        const filter = getAiIdentityFilter(params, 'account-1', 'alice');
        expect(getAiIdentityTab(params)).toBe('triage');
        expect(getAiIdentitySort(params)).toBe(AiIdentitySort.LAST_CHECKED);
        expect(filter).toMatchObject({
            states: [AiIdentityState.FAILED],
            reasons: [AiIdentityFailureReason.KEY_OR_USER_REJECTED],
            projectUuid: 'project-1',
            staleOnly: true,
            search: 'alice',
        });
        const request = getAiIdentityListParams(
            filter,
            AiIdentitySort.LAST_CHECKED,
            3,
        );
        expect(request.getAll('state')).toEqual(['failed']);
        expect(request.getAll('reason')).toEqual(['key_or_user_rejected']);
        expect(request.get('page')).toBe('3');
    });

    it('rejects unknown tabs and filters', () => {
        const params = new URLSearchParams(
            'tab=missing&state=unknown&reason=unknown-value',
        );
        expect(getAiIdentityTab(params)).toBe('triage');
        expect(getAiIdentityFilter(params, 'account-1', '')).toMatchObject({
            states: [],
            reasons: [],
            search: null,
        });
    });
});
