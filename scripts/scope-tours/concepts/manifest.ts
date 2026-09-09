import type { ConceptManifest } from './lib';
const doc = (file: string, ...headings: string[]) =>
    headings.map((heading) => ({ file: `${file}.mdx`, heading }));
export const CONCEPT_MANIFEST: ConceptManifest = [
    {
        scopes: ['view:ContentVerification'],
        title: 'Recognize verified content',
        sources: doc(
            'explore/verified-content',
            'Where users see verified content',
        ),
    },
    {
        scopes: ['manage:VerifiedContent'],
        title: 'Understand edits to verified content',
        sources: doc(
            'explore/verified-content',
            'What happens to verification when content is edited',
        ),
    },
    {
        scopes: ['manage:CustomSql'],
        title: 'Understand custom SQL queries',
        sources: doc(
            'explore/sql-runner',
            'Getting started with the SQL Runner',
            'Limitations',
        ),
    },
    {
        scopes: ['manage:VirtualView', 'delete:VirtualView'],
        title: 'Understand virtual view changes',
        sources: doc(
            'semantic-layer/virtual-views',
            'Edit or delete a virtual view',
            'Destructive changes and `--force`',
        ),
    },
    {
        scopes: ['manage:ChangeCsvResults'],
        title: 'Choose export result options',
        sources: doc(
            'explore/share-charts',
            'Choosing how many rows an export contains',
        ),
    },
    {
        scopes: ['view:SpotlightTableConfig', 'manage:SpotlightTableConfig'],
        title: 'Understand metrics catalog configuration',
        sources: doc('explore/metrics-catalog', 'The `spotlight` config'),
    },
    {
        scopes: ['view:ContentAsCode'],
        title: 'Read content as code',
        sources: doc(
            'workflow/content-as-code',
            'Choosing a workflow',
            '`lightdash download`',
        ),
    },
    {
        scopes: ['create:ContentAsCode', 'manage:ContentAsCode'],
        title: 'Understand content uploads',
        sources: doc(
            'workflow/content-as-code',
            'Choosing a workflow',
            '`lightdash upload`',
        ),
    },
    {
        scopes: ['promote:SavedChart'],
        title: 'Understand chart promotion',
        sources: doc(
            'explore/promote-content',
            'How promoting works',
            'Configure upstream project',
            'Promote charts',
        ),
    },
    {
        scopes: ['promote:Dashboard'],
        title: 'Understand dashboard promotion',
        sources: doc(
            'explore/promote-content',
            'How promoting works',
            'Configure upstream project',
            'Promote dashboards',
        ),
    },
    {
        scopes: ['manage:Validation'],
        title: 'Understand content validation',
        sources: doc(
            'workflow/validating-your-content',
            'How can I validate my content?',
            'What content is included in the validation?',
            'How to fix errors',
            'How to dismiss errors',
        ),
    },
    {
        scopes: [
            'view:EmbedDashboardFilters',
            'view:EmbedDashboardFilterAddition',
        ],
        title: 'Understand embedded dashboard filters',
        sources: doc('embed/reference', 'Dashboard filters interactivity'),
    },
    {
        scopes: ['view:EmbedDashboardParameters'],
        title: 'Understand embedded parameters',
        sources: doc('embed/reference', 'Parameter interactivity'),
    },
    {
        scopes: [
            'view:EmbedCsvExport',
            'view:EmbedImageExport',
            'view:EmbedPagePdfExport',
        ],
        title: 'Understand embedded exports',
        sources: doc('embed/reference', 'Export options'),
    },
    {
        scopes: ['view:EmbedDashboardCsvExport'],
        title: 'Understand exporting all embedded dashboard tiles',
        sources: doc('embed/reference', 'Export all dashboard tiles'),
    },
    {
        scopes: ['view:EmbedDateZoom'],
        title: 'Understand embedded date zoom',
        sources: doc('embed/reference', 'Date zoom'),
    },
    {
        scopes: ['view:EmbedExplore'],
        title: 'Understand embedded exploration',
        sources: doc('embed/reference', 'Explore from here'),
    },
    {
        scopes: ['view:EmbedUnderlyingData'],
        title: 'Understand embedded underlying data',
        sources: doc('embed/reference', 'View underlying data'),
    },
    {
        scopes: ['view:EmbedDataApps'],
        title: 'Understand embedded data apps',
        sources: doc('embed/reference', 'Data app token'),
    },
    {
        scopes: ['view:EmbedAiAgent'],
        title: 'Understand embedded AI agents',
        sources: doc('embed/reference', 'AI agent token'),
    },
    {
        scopes: ['view:Analytics'],
        title: 'Understand usage analytics',
        sources: doc(
            'workspace-admin/usage-analytics',
            'Usage analytics dashboards',
        ),
    },
    {
        scopes: ['view:AiAgentDocument'],
        title: 'Understand agent knowledge documents',
        sources: doc(
            'agents/effective-analytics-with-agents',
            'How they work',
            'What to upload',
        ),
    },
    {
        scopes: ['manage:AiAgentDocument'],
        title: 'Understand knowledge document maintenance',
        sources: doc(
            'agents/effective-analytics-with-agents',
            'How they work',
            'Always include in context',
            'View, edit, or download a document',
        ),
    },
];
