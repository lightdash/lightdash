import { describe, expect, it } from 'vitest';
import {
    canRestampContentAsCodeSyncItem,
    CONTENT_AS_CODE_SYNC_STATE_BADGE,
} from './contentAsCodeSyncState';

describe('contentAsCodeSyncState', () => {
    it('labels the three sync states', () => {
        expect(CONTENT_AS_CODE_SYNC_STATE_BADGE.in_sync.label).toBe('In sync');
        expect(CONTENT_AS_CODE_SYNC_STATE_BADGE.ahead.label).toBe('Ahead');
        expect(CONTENT_AS_CODE_SYNC_STATE_BADGE.ui_only.label).toBe('UI-only');
    });

    it('allows restamp for ahead and UI-only, not in sync', () => {
        expect(canRestampContentAsCodeSyncItem('ahead')).toBe(true);
        expect(canRestampContentAsCodeSyncItem('ui_only')).toBe(true);
        expect(canRestampContentAsCodeSyncItem('in_sync')).toBe(false);
    });
});
