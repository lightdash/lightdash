import { FeatureFlags } from '../../types/featureFlags';
import { type DataAppTemplate } from './types';

/**
 * Registry metadata for a data app template: everything a picker or gallery
 * card needs, shared by frontend and backend so the template list lives in
 * one place. Adding a template = one entry here, its instruction block in the
 * backend's AppGenerateService templates, and an icon in the frontend's icon
 * map — the exhaustive Records turn a missing piece into a compile error.
 */
/**
 * A question the create-from-template flow asks instead of a blank prompt.
 * Answers travel to the build as clarifications (question/answer pairs), so
 * the backend generate path is unchanged. `list` questions collect one entry
 * per line — the repeatable-slot shape (e.g. a scorecard's tiles).
 */
export type TemplateQuestion = {
    key: string;
    label: string;
    placeholder?: string;
    /** Pre-filled answer; the user can build without editing it. */
    default?: string;
    required?: boolean;
    kind?: 'text' | 'list';
};

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
    /**
     * Declared questions shown in place of the freeform composer when this
     * template is chosen. Undefined = the template keeps the freeform flow.
     */
    questions?: TemplateQuestion[];
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
    forecaster: {
        id: 'forecaster',
        title: 'Forecaster',
        description:
            'A live what-if forecast: scenario levers, a baseline, and a copyable plan.',
        category: 'Forecasting',
        inPicker: false,
        inGallery: true,
        requiredFlag: FeatureFlags.EnableDataAppTemplates,
        questions: [
            {
                key: 'metric',
                label: 'What should we forecast?',
                placeholder: 'e.g. total order revenue',
                default: 'Total order revenue',
                required: true,
            },
            {
                key: 'ceiling',
                label: 'Is there a limit to forecast against?',
                placeholder:
                    'A budget, committed spend, or capacity metric — leave blank if none',
            },
            {
                key: 'horizon',
                label: 'How far ahead?',
                default: '24 months',
            },
        ],
    },
    scorecard: {
        id: 'scorecard',
        title: 'KPI Scorecard',
        description:
            'A tiled scorecard of key metrics: period totals, comparison deltas, sparklines, and targets.',
        category: 'Reporting',
        inPicker: false,
        inGallery: true,
        requiredFlag: FeatureFlags.EnableDataAppTemplates,
        questions: [
            {
                key: 'tiles',
                label: 'Which metrics belong on the scorecard?',
                placeholder: 'One per line',
                default:
                    'Revenue\nAverage order size\nShipping revenue\nNew customers',
                required: true,
                kind: 'list',
            },
            {
                key: 'period',
                label: 'Default period',
                default: 'Last 90 days',
            },
            {
                key: 'comparison',
                label: 'Compare each metric to the previous period?',
                default: 'Yes',
            },
            {
                key: 'targets',
                label: 'Any targets?',
                placeholder: 'metric: value, one per line — optional',
                kind: 'list',
            },
        ],
    },
};
