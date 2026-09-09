import { getTrainingProjectScopes } from '@lightdash/common';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCOPE_TOURS } from '../../packages/frontend/src/features/scopeTours/generated';

export type ScopeDisposition = {
    status: 'pending' | 'excluded' | 'related';
    reason: string;
    ticket: string;
    tour: string | null;
};

const pending = (reason: string, ticket = 'CS-212'): ScopeDisposition => ({
    status: 'pending',
    reason,
    ticket,
    tour: null,
});
const excluded = (reason: string, ticket = 'CS-212'): ScopeDisposition => ({
    status: 'excluded',
    reason,
    ticket,
    tour: null,
});
const related = (tour: string, reason: string): ScopeDisposition => ({
    status: 'related',
    reason,
    ticket: 'CS-212',
    tour,
});

export const SCOPE_DISPOSITIONS: Readonly<Record<string, ScopeDisposition>> = {
    'view:AiAgent': related(
        'create:AiAgentThread',
        'Grouped with the agent lesson; scope-specific viewing coverage awaits verification.',
    ),
    'view:DataApp': related(
        'create:DataApp',
        'Grouped with app lessons; scope-specific viewing coverage awaits verification.',
    ),
    'view:ContentVerification': related(
        'manage:ContentVerification',
        'Grouped with verification; viewing coverage awaits verification.',
    ),
    'manage:VerifiedContent': related(
        'manage:ContentVerification',
        'Grouped with verification; editing verified content is not yet proved by the lesson.',
    ),
    'manage:CustomSql': related(
        'manage:SqlRunner',
        'Grouped with SQL Runner; the distinct custom SQL permission needs teaching evidence.',
    ),
    'manage:VirtualView': related(
        'create:VirtualView',
        'Creating a virtual view does not prove the lesson teaches managing an existing view.',
    ),
    'delete:VirtualView': related(
        'create:VirtualView',
        'Creating a virtual view does not teach deleting one.',
    ),
    'manage:ChangeCsvResults': related(
        'manage:ExportCsv',
        'Grouped with CSV export; changing result options needs teaching evidence.',
    ),
    'view:Project': excluded(
        'Baseline project access has no standalone lesson-sized surface.',
    ),
    'view:Job': excluded(
        'Background job permission has no standalone learner surface.',
    ),
    'view:JobStatus': excluded(
        'Background job status permission has no standalone learner surface.',
    ),
    'view:SemanticViewer': excluded(
        'Catalogue records no product surface for this permission.',
    ),
    'manage:SemanticViewer': excluded(
        'Catalogue records no product surface for this permission.',
    ),
    'manage:DeletedContent': excluded(
        'No product surface recorded; the associated content ticket is canceled.',
        'CS-222',
    ),
    'view:SpotlightTableConfig': pending(
        'The UI control is not named in docs; documented teaching content is required.',
        'CS-233',
    ),
    'manage:SpotlightTableConfig': pending(
        'The UI control is not named in docs; documented teaching content is required.',
        'CS-233',
    ),
    'view:ContentAsCode': pending(
        'CLI/API workflow needs an agreed content format beyond click walkthroughs.',
    ),
    'create:ContentAsCode': pending(
        'CLI/API workflow needs an agreed content format beyond click walkthroughs.',
    ),
    'manage:ContentAsCode': pending(
        'CLI/API workflow needs an agreed content format beyond click walkthroughs.',
    ),
    'promote:Dashboard': pending(
        'Cross-project promotion semantics in a training copy remain unresolved.',
    ),
    'promote:SavedChart': pending(
        'Cross-project promotion semantics in a training copy remain unresolved.',
    ),
    'view:MetricsTree': pending(
        'Metrics tree lesson and supported interaction format remain deferred.',
        'CS-234',
    ),
    'manage:MetricsTree': pending(
        'Adding metrics requires drag-and-drop or a supported alternative lesson format.',
        'CS-234',
    ),
    'manage:Validation': pending(
        'Settings access requires excluded update:Project and a tour host outside the current layout.',
        'CS-231',
    ),
    'view:EmbedDashboardFilters': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedDashboardFilterAddition': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedDashboardParameters': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedCsvExport': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedDashboardCsvExport': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedImageExport': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedPagePdfExport': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedDateZoom': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedExplore': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedUnderlyingData': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedDataApps': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
    'view:EmbedAiAgent': pending(
        'Embedded application lesson format requires a curriculum decision.',
    ),
};

export type CoverageAudit = {
    ok: boolean;
    generated: string[];
    pending: string[];
    excluded: string[];
    related: string[];
    unclassified: string[];
    staleDispositions: string[];
    missingTours: { scope: string; tour: string }[];
    invalidDispositions: string[];
};

export const auditCoverage = (
    trainingScopes: readonly string[],
    availableTours: readonly string[],
    dispositions: Readonly<Record<string, ScopeDisposition>>,
    strict = false,
): CoverageAudit => {
    const scopes = new Set(
        trainingScopes.filter((scope) => !scope.includes('@')),
    );
    const tours = new Set(availableTours);
    const result: CoverageAudit = {
        ok: true,
        generated: [],
        pending: [],
        excluded: [],
        related: [],
        unclassified: [],
        staleDispositions: [],
        missingTours: [],
        invalidDispositions: [],
    };
    for (const [scope, disposition] of Object.entries(dispositions)) {
        if (!scopes.has(scope) || tours.has(scope))
            result.staleDispositions.push(scope);
        if (
            !disposition.reason.trim() ||
            !/^CS-\d+$/.test(disposition.ticket) ||
            !['pending', 'excluded', 'related'].includes(disposition.status) ||
            (disposition.status === 'related' && !disposition.tour)
        ) {
            result.invalidDispositions.push(scope);
        }
        if (disposition.tour !== null && !tours.has(disposition.tour)) {
            result.missingTours.push({ scope, tour: disposition.tour });
        }
    }
    for (const scope of scopes) {
        if (tours.has(scope)) result.generated.push(scope);
        else if (!Object.hasOwn(dispositions, scope))
            result.unclassified.push(scope);
        else {
            const { status } = dispositions[scope];
            if (
                status === 'pending' ||
                status === 'excluded' ||
                status === 'related'
            )
                result[status].push(scope);
        }
    }
    result.ok =
        result.unclassified.length === 0 &&
        result.staleDispositions.length === 0 &&
        result.missingTours.length === 0 &&
        result.invalidDispositions.length === 0 &&
        (!strict ||
            (result.pending.length === 0 && result.related.length === 0));
    return result;
};

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const report = auditCoverage(
        getTrainingProjectScopes(),
        Object.keys(SCOPE_TOURS),
        SCOPE_DISPOSITIONS,
        process.argv.includes('--release'),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
}
