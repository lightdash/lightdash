import type { ApiSurface } from './release-safety-contract';
import type {
    AdvisoryDeclaration,
    BreakingChangeDeclaration,
    BreakingChangeDeclarationEntry,
} from './release-safety-declarations';
import { REST_FINDING_SEPARATOR } from './rest-api-diff';

export type AdvisorySurface = 'rest' | 'mcp';
export type FindingSurface = Pick<
    ApiSurface,
    'checked' | 'breaking' | 'changes'
> & {
    breakingCount?: number;
};

export const ACCEPTED_CLAIM_NOTICE =
    'No external callers is a claim the PR author and reviewer accepted; release-safety did not verify it.';

export function partitionDeclarations(
    declarations: readonly (BreakingChangeDeclarationEntry & { id: string })[],
): {
    ordinary: BreakingChangeDeclaration[];
    advisories: AdvisoryDeclaration[];
} {
    const ordinary: BreakingChangeDeclaration[] = [];
    const advisories: AdvisoryDeclaration[] = [];
    for (const declaration of declarations) {
        const { impact, ...entry } = declaration;
        if (impact === undefined) ordinary.push(entry);
        else {
            advisories.push({
                id: entry.id,
                reason: entry.reason,
                requiredStop: false,
                impact,
            });
        }
    }
    return { ordinary, advisories };
}

function matchesFinding(
    finding: string,
    entry: string,
    surface: AdvisorySurface,
): boolean {
    if (surface === 'rest')
        return finding.startsWith(`${entry}${REST_FINDING_SEPARATOR}`);
    const prefix = `MCP tool \`${entry}\``;
    return (
        finding.startsWith(`${prefix} removed`) ||
        finding.startsWith(`${prefix}:`)
    );
}

function isOverflow(finding: string): boolean {
    return /^… and \d+ more breaking change\(s\)$/.test(finding);
}

export function uncoveredFindings(
    surface: FindingSurface | null | undefined,
    advisories: readonly AdvisoryDeclaration[],
    kind: AdvisorySurface,
): string[] {
    if (!surface || surface.breaking !== true) return [];
    const listedCount = surface.changes.filter(
        (finding) => !isOverflow(finding),
    ).length;
    const truncated = surface.changes.some(isOverflow) ||
        (surface.breakingCount ?? listedCount) > listedCount;
    const entries = surface.checked && !truncated
        ? advisories.flatMap(({ impact }) => impact.covers[kind])
        : [];
    const uncovered = surface.changes.filter(
        (finding) =>
            isOverflow(finding) ||
            !entries.some((entry) => matchesFinding(finding, entry, kind)),
    );
    if (
        (surface.breakingCount ?? listedCount) > listedCount &&
        !uncovered.some(isOverflow)
    ) {
        uncovered.push(
            `… and ${(surface.breakingCount ?? listedCount) - listedCount} more breaking change(s)`,
        );
    }
    if (surface.changes.length === 0 && uncovered.length === 0) {
        uncovered.push('Breaking findings were not listed');
    }
    return uncovered;
}

export function unmatchedCoverEntries(
    surface: FindingSurface,
    advisories: readonly AdvisoryDeclaration[],
    kind: AdvisorySurface,
): { id: string; entry: string }[] {
    if (!surface.checked) return [];
    return advisories.flatMap(({ id, impact }) =>
        impact.covers[kind]
            .filter(
                (entry) =>
                    surface.breaking !== true ||
                    !surface.changes.some(
                        (finding) =>
                            !isOverflow(finding) &&
                            matchesFinding(finding, entry, kind),
                    ),
            )
            .map((entry) => ({ id, entry })),
    );
}

export function renderAdvisories(
    advisories: readonly AdvisoryDeclaration[],
): string[] {
    if (advisories.length === 0) return [];
    return [
        'No external callers (accepted claim):',
        ...advisories.map(({ id, reason, impact }) => {
            const evidence =
                'featureFlag' in impact
                    ? `Feature flag: \`${impact.featureFlag}\``
                    : `First-party only: ${impact.firstPartyOnly}`;
            const covered = [
                ...impact.covers.rest.map((entry) => `REST \`${entry}\``),
                ...impact.covers.mcp.map((entry) => `MCP \`${entry}\``),
            ].join(', ');
            return `- \`${id}\`: ${reason} ${evidence}. Covers: ${covered}.`;
        }),
        ACCEPTED_CLAIM_NOTICE,
    ];
}
