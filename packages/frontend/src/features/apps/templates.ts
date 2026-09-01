import {
    DATA_APP_TEMPLATE_DEFINITIONS,
    type DataAppTemplate,
    type FeatureFlags,
} from '@lightdash/common';
import {
    IconChartLine,
    IconFileText,
    IconLayoutDashboard,
    IconLayoutGrid,
    IconPencil,
    IconPresentation,
    IconPuzzle,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

export type TemplateDefinition = {
    id: DataAppTemplate;
    title: string;
    description: string;
    category: string;
    icon: TablerIcon;
};

// Icons are React components so they stay on the frontend; everything else
// about a template comes from the shared registry in @lightdash/common.
const TEMPLATE_ICONS: Record<DataAppTemplate, TablerIcon> = {
    dashboard: IconLayoutDashboard,
    slideshow: IconPresentation,
    pdf: IconFileText,
    custom: IconPencil,
    data_app_viz: IconPuzzle,
    forecaster: IconChartLine,
    scorecard: IconLayoutGrid,
};

const toDefinition = (id: DataAppTemplate): TemplateDefinition => {
    const def = DATA_APP_TEMPLATE_DEFINITIONS[id];
    if (!def) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return {
        id: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        icon: TEMPLATE_ICONS[id],
    };
};

/**
 * Templates offered when creating a data app, honoring each definition's
 * picker eligibility and feature-flag gate.
 */
export const getPickerTemplates = (
    enabledFlags: Set<FeatureFlags>,
): TemplateDefinition[] =>
    Object.values(DATA_APP_TEMPLATE_DEFINITIONS)
        .filter(
            (def) =>
                def.inPicker &&
                (def.requiredFlag === undefined ||
                    enabledFlags.has(def.requiredFlag)),
        )
        .map((def) => toDefinition(def.id));

/**
 * Templates listed in the gallery behind the picker's "From Template" card,
 * honoring each definition's feature-flag gate.
 */
export const getGalleryTemplates = (
    enabledFlags: Set<FeatureFlags>,
): TemplateDefinition[] =>
    Object.values(DATA_APP_TEMPLATE_DEFINITIONS)
        .filter(
            (def) =>
                def.inGallery &&
                (def.requiredFlag === undefined ||
                    enabledFlags.has(def.requiredFlag)),
        )
        .map((def) => toDefinition(def.id));

export const getTemplate = (id: DataAppTemplate): TemplateDefinition =>
    toDefinition(id);
