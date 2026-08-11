import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from '@lightdash/common';

/**
 * What a rebuild did to the declared option contract: options added, defaults
 * changed under a stable name, and options removed.
 */
export type VizContractDiff = {
    fromVersion: number;
    toVersion: number;
    added: string[];
    /** Name → previous declaration, where the default or control type changed. */
    changed: Record<string, DataAppVizConfigOption>;
    removed: DataAppVizConfigOption[];
};

export const countVizContractChanges = (diff: VizContractDiff): number =>
    diff.added.length + Object.keys(diff.changed).length + diff.removed.length;

export const diffVizConfigOptions = (
    prev: DataAppVizConfigOption[],
    next: DataAppVizConfigOption[],
    fromVersion: number,
    toVersion: number,
): VizContractDiff => {
    const prevByName = new Map(prev.map((option) => [option.name, option]));
    const nextNames = new Set(next.map((option) => option.name));

    const added: string[] = [];
    const changed: Record<string, DataAppVizConfigOption> = {};
    next.forEach((option) => {
        const before = prevByName.get(option.name);
        if (before === undefined) {
            added.push(option.name);
            return;
        }
        if (
            before.type !== option.type ||
            JSON.stringify(before.default) !== JSON.stringify(option.default)
        ) {
            changed[option.name] = before;
        }
    });

    return {
        fromVersion,
        toVersion,
        added,
        changed,
        removed: prev.filter((option) => !nextNames.has(option.name)),
    };
};

/** The declared default of an option, worded the way its control shows it. */
export const formatVizOptionValue = (
    option: DataAppVizConfigOption,
    value: DataAppVizOptionValue,
): string => {
    if (option.type === 'boolean') return value ? 'On' : 'Off';
    if (option.type === 'select') {
        const choice = option.choices.find((c) => c.value === value);
        return choice?.label ?? String(value);
    }
    return String(value);
};
