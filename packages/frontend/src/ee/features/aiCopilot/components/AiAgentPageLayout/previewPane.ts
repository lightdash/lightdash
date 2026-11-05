import { assertUnreachable } from '@lightdash/common';
import { type AiPreview } from '../../store/aiArtifactSlice';

export const PREVIEW_PANE_MIN = 32;
export const PREVIEW_PANE_MAX = 64;
// Leaves the chat about 38% of the row (~520px at 1440px with the rail collapsed).
const WIDE_PREVIEW_PANE = 62;

export type PreviewPane = {
    /** Doubles as the splitter layout key, so each kind remembers its own width. */
    id: 'data-app' | 'chart-artifact' | 'composer-artifact' | 'document';
    defaultSize: number;
};

// Composer artifacts and data apps open wide: they hold a result above a
// pipeline panel, or a full app.
export const previewPaneOf = (
    type: AiPreview['type'],
    isComposerArtifact: boolean,
): PreviewPane => {
    switch (type) {
        case 'dataApp':
            return { id: 'data-app', defaultSize: WIDE_PREVIEW_PANE };
        case 'artifact':
            return isComposerArtifact
                ? { id: 'composer-artifact', defaultSize: WIDE_PREVIEW_PANE }
                : { id: 'chart-artifact', defaultSize: 46 };
        case 'savedChart':
            return { id: 'chart-artifact', defaultSize: 46 };
        case 'queryPipeline':
            return { id: 'composer-artifact', defaultSize: WIDE_PREVIEW_PANE };
        case 'document':
            return { id: 'document', defaultSize: 50 };
        default:
            return assertUnreachable(type, 'Unknown preview type');
    }
};
