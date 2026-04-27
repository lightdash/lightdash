import { type DataAppTemplate } from '@lightdash/common';
import {
    IconFileText,
    IconLayoutDashboard,
    IconPresentation,
    IconSparkles,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

export type TemplateQuestion = {
    id: string;
    label: string;
    placeholder?: string;
    required?: boolean;
};

export type TemplateDefinition = {
    id: DataAppTemplate;
    title: string;
    description: string;
    icon: TablerIcon;
    questions: TemplateQuestion[];
    composePrompt: (answers: Record<string, string>) => string;
};

const sentence = (s: string | undefined): string => {
    const trimmed = (s ?? '').trim();
    if (!trimmed) return '';
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const optionalSentence = (
    prefix: string,
    s: string | undefined,
): string | null => {
    const trimmed = (s ?? '').trim();
    if (!trimmed) return null;
    return sentence(`${prefix}${trimmed}`);
};

const joinNonEmpty = (parts: (string | null)[]): string =>
    parts.filter((p): p is string => p !== null && p.length > 0).join(' ');

export const TEMPLATES: TemplateDefinition[] = [
    {
        id: 'dashboard',
        title: 'Dashboard',
        description: 'A grid of KPIs and charts for at-a-glance reporting.',
        icon: IconLayoutDashboard,
        questions: [
            {
                id: 'topic',
                label: "What's the dashboard about?",
                placeholder: 'e.g. Revenue overview',
                required: true,
            },
            {
                id: 'audience',
                label: 'Who is the audience?',
                placeholder: 'e.g. Sales leadership',
            },
            {
                id: 'kpis',
                label: 'Which key metrics should stand out?',
                placeholder: 'e.g. ARR, customer count, churn rate',
            },
        ],
        composePrompt: (a) =>
            joinNonEmpty([
                sentence(`Build a dashboard about ${a.topic ?? ''}`),
                optionalSentence('The audience is ', a.audience),
                optionalSentence(
                    'Highlight these key metrics at the top: ',
                    a.kpis,
                ),
            ]),
    },
    {
        id: 'slideshow',
        title: 'Slide Show',
        description:
            'A guided narrative - one chart per slide, navigated linearly.',
        icon: IconPresentation,
        questions: [
            {
                id: 'topic',
                label: "What's the story about?",
                placeholder: 'e.g. Q3 sales performance',
                required: true,
            },
            {
                id: 'audience',
                label: 'Who will be presenting this to whom?',
                placeholder: 'e.g. CFO presenting to the board',
            },
            {
                id: 'arc',
                label: 'What story arc do you want?',
                placeholder:
                    'e.g. Headline result → drivers → risks → next steps',
            },
        ],
        composePrompt: (a) =>
            joinNonEmpty([
                sentence(`Build a slideshow about ${a.topic ?? ''}`),
                optionalSentence('The presentation context: ', a.audience),
                optionalSentence('Follow this story arc: ', a.arc),
            ]),
    },
    {
        id: 'pdf',
        title: 'PDF Report',
        description:
            'A print-friendly document with sections and supporting charts.',
        icon: IconFileText,
        questions: [
            {
                id: 'topic',
                label: "What's the report about?",
                placeholder: 'e.g. Monthly investor update',
                required: true,
            },
            {
                id: 'audience',
                label: 'Who is the report for?',
                placeholder: 'e.g. Investors',
            },
            {
                id: 'sections',
                label: 'What sections should it have?',
                placeholder: 'e.g. Summary, KPIs, Growth, Risks, Outlook',
            },
        ],
        composePrompt: (a) =>
            joinNonEmpty([
                sentence(`Build a PDF report about ${a.topic ?? ''}`),
                optionalSentence('The report is for ', a.audience),
                optionalSentence(
                    'Organize it into these sections: ',
                    a.sections,
                ),
            ]),
    },
    {
        id: 'custom',
        title: 'Custom',
        description: 'Start from scratch and describe whatever you want.',
        icon: IconSparkles,
        questions: [],
        composePrompt: () => '',
    },
];

export const getTemplate = (id: DataAppTemplate): TemplateDefinition => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return t;
};
