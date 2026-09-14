const MINIMUM_BREAKING_REASON_LENGTH = 24;

const HOLLOW_BREAKING_REASONS = new Set([
    '<operator-facing reason>',
    'breaking',
    'breaking change',
    'fix',
    'placeholder',
    'reason',
    'todo',
]);

export function isSubstantiveBreakingReason(reason: string): boolean {
    const normalized = reason.trim().replace(/\s+/g, ' ').toLowerCase();
    return (
        normalized.length >= MINIMUM_BREAKING_REASON_LENGTH &&
        normalized.includes(' ') &&
        !HOLLOW_BREAKING_REASONS.has(normalized)
    );
}

export function hollowBreakingReasonMessage(file: string, line: number): string {
    return `${file}:${line} breaking declaration reason must describe what breaks and for whom. Use at least ${MINIMUM_BREAKING_REASON_LENGTH} characters and more than one word; placeholders are not accepted.`;
}

interface BreakingChangeDecisionBriefInput {
    file: string;
    line: number;
    pattern: string;
    declarationLocation: string;
}

export function breakingChangeDecisionBrief(
    input: BreakingChangeDecisionBriefInput,
): string {
    return [
        'BREAKING-CHANGE DECISION BRIEF',
        `Detected at ${input.file}:${input.line}: ${input.pattern}`,
        'Path 1 — redesign: redesign to expand-only — e.g. deprecate-now-drop-later. Consequence: preserves a rolling-safe release.',
        `Path 2 — declare: declare — flips this release to not-rolling-safe, advises Recreate to every self-hosted customer. The declaration must be in ${input.declarationLocation}.`,
        'Declaring is a product decision — confirm with a human before adding a registry entry.',
    ].join('\n');
}
