import { type DataAppTemplate } from '@lightdash/common';
import {
    IconFileText,
    IconLayoutDashboard,
    IconPresentation,
    IconSparkles,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

export type TemplateDefinition = {
    id: DataAppTemplate;
    title: string;
    description: string;
    icon: TablerIcon;
};

export const TEMPLATES: TemplateDefinition[] = [
    {
        id: 'dashboard',
        title: 'Dashboard',
        description: 'A grid of KPIs and charts for at-a-glance reporting.',
        icon: IconLayoutDashboard,
    },
    {
        id: 'slideshow',
        title: 'Slide Show',
        description:
            'A guided narrative - one chart per slide, navigated linearly.',
        icon: IconPresentation,
    },
    {
        id: 'pdf',
        title: 'PDF Report',
        description:
            'A print-friendly document with sections and supporting charts.',
        icon: IconFileText,
    },
    {
        id: 'custom',
        title: 'Custom',
        description: 'Start from scratch and describe whatever you want.',
        icon: IconSparkles,
    },
];

export const getTemplate = (id: DataAppTemplate): TemplateDefinition => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return t;
};
