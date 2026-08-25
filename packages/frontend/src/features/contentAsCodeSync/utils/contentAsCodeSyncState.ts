import { type ContentAsCodeSyncItemState } from '../types';

export const CONTENT_AS_CODE_SYNC_STATE_BADGE: Record<
    ContentAsCodeSyncItemState,
    { label: string; color: string }
> = {
    in_sync: { label: 'In sync', color: 'teal' },
    ahead: { label: 'Ahead', color: 'yellow' },
    ui_only: { label: 'UI-only', color: 'ldGray' },
};

export const canRestampContentAsCodeSyncItem = (
    state: ContentAsCodeSyncItemState,
): boolean => state === 'ahead' || state === 'ui_only';

export const canProposeContentAsCodeSyncItem = (
    state: ContentAsCodeSyncItemState,
): boolean => state === 'ahead' || state === 'ui_only';
