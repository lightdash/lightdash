import { assertUnreachable } from '@lightdash/common';
import { type AiPreview } from '../../store/aiArtifactSlice';

export const PREVIEW_PANE_MIN = 32;
export const PREVIEW_PANE_MAX = 64;

export type PreviewPane = {
    /** Doubles as the splitter layout key, so each kind remembers its own width. */
    id: 'data-app' | 'chart-artifact' | 'composer-artifact';
    defaultSize: number;
};

// A composer artifact opens as wide as the splitter allows: its result sits
// above a pipeline panel, so it needs the room.
export const previewPaneOf = (
    type: AiPreview['type'],
    isComposerArtifact: boolean,
): PreviewPane => {
    switch (type) {
        case 'dataApp':
            return { id: 'data-app', defaultSize: 60 };
        case 'artifact':
            return isComposerArtifact
                ? { id: 'composer-artifact', defaultSize: PREVIEW_PANE_MAX }
                : { id: 'chart-artifact', defaultSize: 46 };
        case 'savedChart':
            return { id: 'chart-artifact', defaultSize: 46 };
        default:
            return assertUnreachable(type, 'Unknown preview type');
    }
};
