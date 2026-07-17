import { type HomepageViewAsTarget } from '@lightdash/common';

export type CanvasMode = 'edit' | 'preview';

// The canvas renders the read-only PreviewPane whenever the user has
// manually toggled preview on, OR has picked a specific audience to view
// as — picking an audience always wins, even mid-edit.
export const resolveCanvasMode = (
    isPreviewing: boolean,
    viewTarget: HomepageViewAsTarget | null,
): CanvasMode => (isPreviewing || viewTarget !== null ? 'preview' : 'edit');
