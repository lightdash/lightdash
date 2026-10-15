import { type DataAppTemplate } from '@lightdash/common';
import {
    IconFileText,
    IconLayoutDashboard,
    IconPencil,
    IconPresentation,
    IconPuzzle,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import i18n from '../../i18n/i18n';

export type TemplateDefinition = {
    id: DataAppTemplate;
    /** English name walkthroughs select the card by (data-tour-value). */
    tourName: string;
    title: string;
    description: string;
    icon: TablerIcon;
};

const KEYS: Record<DataAppTemplate, string> = {
    dashboard: 'dashboard',
    slideshow: 'slideshow',
    pdf: 'pdf',
    custom: 'custom',
    data_app_viz: 'dataAppViz',
};

// Getters keep copy lazy: i18n may not be initialised at import time.
const template = (
    id: DataAppTemplate,
    tourName: string,
    icon: TablerIcon,
): TemplateDefinition => ({
    id,
    tourName,
    icon,
    get title() {
        return i18n.t(`templates.${KEYS[id]}.title`, { ns: 'apps' });
    },
    get description() {
        return i18n.t(`templates.${KEYS[id]}.description`, { ns: 'apps' });
    },
});

const TEMPLATES: TemplateDefinition[] = [
    template('dashboard', 'Dashboard', IconLayoutDashboard),
    template('slideshow', 'Slide Show', IconPresentation),
    template('pdf', 'PDF Report', IconFileText),
    template('custom', 'From scratch', IconPencil),
    template('data_app_viz', 'Data app visualization', IconPuzzle),
];

// Offered when creating a data app. Vizs (custom chart types) are created from
// Explorer's chart type picker instead, but existing viz apps still resolve
// their definition via `getTemplate`, so the entry stays in TEMPLATES.
export const PICKER_TEMPLATES: TemplateDefinition[] = TEMPLATES.filter(
    (t) => t.id !== 'data_app_viz',
);

export const getTemplate = (id: DataAppTemplate): TemplateDefinition => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return t;
};
