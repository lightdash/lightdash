import { assertUnreachable } from '@lightdash/common';

export type BuildStepGroupKind =
    | 'models'
    | 'files-read'
    | 'search'
    | 'files-edited'
    | 'files-created'
    | 'other';

export type BuildStepGroup = {
    kind: BuildStepGroupKind;
    /** "Read 3 models" / "Reading models" style label. */
    label: string;
    /** Distinct targets, e.g. model or file names. */
    targets: string[];
    count: number;
};

const classify = (
    step: string,
): { kind: BuildStepGroupKind; target: string | null } => {
    const match = /^(\S+)\s+(.+)$/.exec(step.trim());
    const verb = (match?.[1] ?? step).toLowerCase();
    const target = match?.[2] ?? null;
    if (verb === 'reading' && target && /\.ya?ml$/i.test(target))
        return { kind: 'models', target: target.replace(/\.ya?ml$/i, '') };
    if (verb === 'reading') return { kind: 'files-read', target };
    if (verb === 'searching') return { kind: 'search', target: null };
    if (/^(editing|updating|writing|modifying)$/.test(verb))
        return { kind: 'files-edited', target };
    if (verb === 'creating') return { kind: 'files-created', target };
    return { kind: 'other', target: step.trim() };
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const labelFor = (
    kind: BuildStepGroupKind,
    n: number,
    live: boolean,
    raw: string,
): string => {
    switch (kind) {
        case 'models':
            return live
                ? 'Reading data models'
                : `Read ${n} ${plural(n, 'data model', 'data models')}`;
        case 'files-read':
            return live
                ? 'Reading files'
                : `Read ${n} ${plural(n, 'file', 'files')}`;
        case 'search':
            return live ? 'Searching the code' : 'Searched the code';
        case 'files-edited':
            return live
                ? 'Editing files'
                : `Edited ${n} ${plural(n, 'file', 'files')}`;
        case 'files-created':
            return live
                ? 'Creating files'
                : `Created ${n} ${plural(n, 'file', 'files')}`;
        case 'other':
            return raw;
        default:
            return assertUnreachable(kind, `Unknown step kind ${kind}`);
    }
};

/**
 * Folds raw tool steps into one row per kind of work, in first-seen order.
 * With `isLive`, the group holding the latest step reads in the present tense.
 */
export const groupBuildSteps = (
    steps: string[],
    isLive: boolean,
): { groups: BuildStepGroup[]; currentIndex: number | null } => {
    const order: string[] = [];
    const byKey = new Map<
        string,
        { kind: BuildStepGroupKind; targets: string[]; count: number }
    >();
    let lastKey: string | null = null;
    for (const step of steps) {
        const { kind, target } = classify(step);
        const key = kind === 'other' ? `other:${step.trim()}` : kind;
        const entry = byKey.get(key) ?? { kind, targets: [], count: 0 };
        if (!byKey.has(key)) {
            byKey.set(key, entry);
            order.push(key);
        }
        entry.count += 1;
        if (target && kind !== 'other' && !entry.targets.includes(target))
            entry.targets.push(target);
        lastKey = key;
    }
    const groups = order.map((key) => {
        const entry = byKey.get(key)!;
        const live = isLive && key === lastKey;
        const n = entry.kind === 'search' ? entry.count : entry.targets.length;
        return {
            kind: entry.kind,
            label: labelFor(entry.kind, Math.max(n, 1), live, key.slice(6)),
            targets: entry.targets,
            count: entry.count,
        };
    });
    return {
        groups,
        currentIndex: isLive && lastKey ? order.indexOf(lastKey) : null,
    };
};
