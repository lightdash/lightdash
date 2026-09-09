import type { ConceptManifest } from './lib';
const doc = (file: string, ...headings: string[]) =>
    headings.map((heading) => ({ file: `${file}.mdx`, heading }));
const overview = (file: string, heading: string) => ({
    file: `${file}.mdx`,
    heading,
    includeSubsections: false,
});
export const CONCEPT_MANIFEST: ConceptManifest = [
    {
        scopes: ['manage:DeletedContent'],
        title: 'Understand restoring and permanently deleting content',
        sources: doc(
            'explore/version-history',
            'Recently deleted charts and dashboards',
        ),
    },
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
            'Who can edit or delete verified content',
            'What happens to verification when content is edited',
        ),
    },
    {
        scopes: ['manage:CustomSql'],
        title: 'Understand saving SQL charts',
        sources: doc(
            'explore/sql-runner',
            'Getting started with the SQL Runner',
            'Saved charts in the SQL Runner',
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
        scopes: ['view:SpotlightTableConfig'],
        title: 'Read catalog column configuration',
        sources: doc(
            'explore/metrics-catalog',
            'View catalog column configuration',
        ),
    },
    {
        scopes: ['manage:SpotlightTableConfig'],
        title: 'Understand shared catalog columns',
        sources: doc(
            'explore/metrics-catalog',
            'View catalog column configuration',
            'Save catalog column configuration',
        ),
    },
    {
        scopes: ['view:ContentAsCode'],
        title: 'Read content as code',
        sources: [
            overview('workflow/content-as-code', 'Choosing a workflow'),
            ...doc('workflow/content-as-code', '`lightdash download`'),
        ],
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
        sources: [
            overview('embed/reference', 'Dashboard filters interactivity'),
        ],
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
        sources: doc('embed/reference', 'View data apps'),
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
            'Open a document',
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
