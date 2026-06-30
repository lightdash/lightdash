import { type DataAppTemplate } from '@lightdash/common';
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
        id: 'data_app_viz',
        title: 'Data app visualization',
        description:
            'A reusable single-tile chart you can apply to any query like a chart type.',
        icon: IconPuzzle,
    },
    {
        id: 'custom',
        title: 'From scratch',
        description: 'Start from scratch and describe whatever you want.',
        icon: IconPencil,
    },
];

export const getTemplate = (id: DataAppTemplate): TemplateDefinition => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return t;
};
