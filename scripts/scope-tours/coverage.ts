import { getTrainingProjectScopes } from '@lightdash/common';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPT_LESSONS } from '../../packages/frontend/src/features/learn/conceptLessons.generated';
import { SCOPE_TOURS } from '../../packages/frontend/src/features/scopeTours/generated';

export type ScopeDisposition = {
    status: 'pending' | 'excluded' | 'related';
    reason: string;
    ticket: string;
    tour: string | null;
};

const excluded = (reason: string, ticket = 'CS-212'): ScopeDisposition => ({
    status: 'excluded',
    reason,
    ticket,
    tour: null,
});
// Content obligations outside the training role remain read-only lessons.
// Listing them explicitly prevents a deleted lesson from shrinking the audit.
export const ADDITIONAL_CONTENT_SCOPES = [
    'view:Analytics',
    'view:AiAgentDocument',
    'manage:AiAgentDocument',
];

export const SCOPE_DISPOSITIONS: Readonly<Record<string, ScopeDisposition>> = {
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
        [...getTrainingProjectScopes(), ...ADDITIONAL_CONTENT_SCOPES],
        [...Object.keys(SCOPE_TOURS), ...Object.keys(CONCEPT_LESSONS)],
        SCOPE_DISPOSITIONS,
        process.argv.includes('--release'),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
}
