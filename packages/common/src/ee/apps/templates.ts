import { type FeatureFlags } from '../../types/featureFlags';
import { type DataAppTemplate } from './types';

/**
 * Registry metadata for a data app template: everything a picker or gallery
 * card needs, shared by frontend and backend so the template list lives in
 * one place. Adding a template = one entry here, its instruction block in the
 * backend's AppGenerateService templates, and an icon in the frontend's icon
 * map — the exhaustive Records turn a missing piece into a compile error.
 */
export type DataAppTemplateDefinition = {
    id: DataAppTemplate;
    title: string;
    description: string;
    /** Picker/gallery grouping. */
    category: string;
    /**
     * Offered when creating a data app. data_app_viz is created from
     * Explorer's chart type picker instead, so it stays out of the picker.
     */
    inPicker: boolean;
    /**
     * Listed in the template gallery (the "From Template" surface) rather
     * than as a picker fan card.
     */
    inGallery: boolean;
    /** Feature flag gating visibility on either surface; undefined = always offered. */
    requiredFlag?: FeatureFlags;
};

export const DATA_APP_TEMPLATE_DEFINITIONS: Record<
    DataAppTemplate,
    DataAppTemplateDefinition
> = {
    dashboard: {
        id: 'dashboard',
        title: 'Dashboard',
        description: 'A grid of KPIs and charts for at-a-glance reporting.',
        category: 'Layouts',
        inPicker: true,
        inGallery: false,
    },
    slideshow: {
        id: 'slideshow',
        title: 'Slide Show',
        description:
            'A guided narrative - one chart per slide, navigated linearly.',
        category: 'Layouts',
        inPicker: true,
        inGallery: false,
    },
    pdf: {
        id: 'pdf',
        title: 'PDF Report',
        description:
            'A print-friendly document with sections and supporting charts.',
        category: 'Documents',
        inPicker: true,
        inGallery: false,
    },
    custom: {
        id: 'custom',
        title: 'From scratch',
        description: 'Start from scratch and describe whatever you want.',
        category: 'Layouts',
        inPicker: true,
        inGallery: false,
    },
    data_app_viz: {
        id: 'data_app_viz',
        title: 'Data app visualization',
        description:
            'A reusable single-tile chart you can apply to any query like a chart type.',
        category: 'Building blocks',
        inPicker: false,
        inGallery: false,
    },
};
