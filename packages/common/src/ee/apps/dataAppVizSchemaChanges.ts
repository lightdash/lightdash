import { type DataAppVizConfigOption } from './dataAppVizConfigOptions';
import { type DataAppVizField, type DataAppVizSchema } from './types';

export type DataAppVizFieldChange = {
    before: DataAppVizField;
    after: DataAppVizField;
};

export type DataAppVizConfigOptionChange = {
    before: DataAppVizConfigOption;
    after: DataAppVizConfigOption;
};

export type DataAppVizPaletteChange = 'added' | 'removed' | 'unchanged';

/** What moved between two declarations of the same project chart type. */
export type DataAppVizSchemaChanges = {
    fields: {
        added: DataAppVizField[];
        removed: DataAppVizField[];
        changed: DataAppVizFieldChange[];
    };
    configOptions: {
        added: DataAppVizConfigOption[];
        removed: DataAppVizConfigOption[];
        changed: DataAppVizConfigOptionChange[];
    };
    colorPalette: DataAppVizPaletteChange;
};

const isSameField = (a: DataAppVizField, b: DataAppVizField): boolean =>
    a.label === b.label && a.type === b.type && a.required === b.required;

const isSameOption = (
    a: DataAppVizConfigOption,
    b: DataAppVizConfigOption,
): boolean => {
    if (a.type !== b.type || a.label !== b.label || a.default !== b.default) {
        return false;
    }
    if (a.type === 'select' && b.type === 'select') {
        return (
            a.choices.length === b.choices.length &&
            a.choices.every(
                (choice, index) =>
                    choice.value === b.choices[index]?.value &&
                    choice.label === b.choices[index]?.label,
            )
        );
    }
    if (a.type === 'number' && b.type === 'number') {
        return a.min === b.min && a.max === b.max;
    }
    return true;
};

const diffByName = <T extends { name: string }>(
    before: T[],
    after: T[],
    isSame: (a: T, b: T) => boolean,
): { added: T[]; removed: T[]; changed: { before: T; after: T }[] } => {
    const beforeByName = new Map(before.map((item) => [item.name, item]));
    const afterByName = new Map(after.map((item) => [item.name, item]));
    return {
        added: after.filter((item) => !beforeByName.has(item.name)),
        removed: before.filter((item) => !afterByName.has(item.name)),
        changed: after.flatMap((item) => {
            const previous = beforeByName.get(item.name);
            return previous && !isSame(previous, item)
                ? [{ before: previous, after: item }]
                : [];
        }),
    };
};

export const diffDataAppVizSchema = (
    before: DataAppVizSchema,
    after: DataAppVizSchema,
): DataAppVizSchemaChanges => {
    const hadPalette = before.colorPalette !== null;
    const hasPalette = after.colorPalette !== null;
    let colorPalette: DataAppVizPaletteChange = 'unchanged';
    if (hasPalette && !hadPalette) colorPalette = 'added';
    if (!hasPalette && hadPalette) colorPalette = 'removed';
    return {
        fields: diffByName(before.fields, after.fields, isSameField),
        configOptions: diffByName(
            before.configOptions,
            after.configOptions,
            isSameOption,
        ),
        colorPalette,
    };
};

export const hasDataAppVizSchemaChanges = (
    changes: DataAppVizSchemaChanges,
): boolean =>
    changes.colorPalette !== 'unchanged' ||
    [changes.fields, changes.configOptions].some(
        (group) =>
            group.added.length > 0 ||
            group.removed.length > 0 ||
            group.changed.length > 0,
    );

const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Short counters for a one-line rendering, e.g. `+2 fields`, `~1 option`. */
export const summarizeDataAppVizSchemaChanges = (
    changes: DataAppVizSchemaChanges,
): string[] => {
    const parts: string[] = [];
    const groups: [
        string,
        DataAppVizSchemaChanges['fields' | 'configOptions'],
    ][] = [
        ['field', changes.fields],
        ['option', changes.configOptions],
    ];
    for (const [noun, group] of groups) {
        if (group.added.length > 0)
            parts.push(`+${plural(group.added.length, noun)}`);
        if (group.removed.length > 0)
            parts.push(`−${plural(group.removed.length, noun)}`);
        if (group.changed.length > 0)
            parts.push(`~${plural(group.changed.length, noun)}`);
    }
    if (changes.colorPalette === 'added') parts.push('palette added');
    if (changes.colorPalette === 'removed') parts.push('palette removed');
    return parts;
};
