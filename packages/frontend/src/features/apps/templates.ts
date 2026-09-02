import {
    DATA_APP_TEMPLATE_DEFINITIONS,
    type DataAppTemplate,
} from '@lightdash/common';
import {
    IconFileText,
    IconLayoutDashboard,
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
 * Built-in flavours offered as fan cards when creating a data app. Templates
 * with content are organization uploads and live in the gallery instead.
 */
export const getPickerTemplates = (): TemplateDefinition[] =>
    Object.values(DATA_APP_TEMPLATE_DEFINITIONS)
        .filter((def) => def.inPicker)
        .map((def) => toDefinition(def.id));

export const getTemplate = (id: DataAppTemplate): TemplateDefinition =>
    toDefinition(id);
