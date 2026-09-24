import {
    getDataAppVizFieldIds,
    type DataAppVizConfigOption,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type DataAppVizPaletteDeclaration,
} from '@lightdash/common';

/** Label for the tab collecting every option that declared no `group`. */
export const UNGROUPED_OPTIONS_LABEL = 'Display';

export type DataAppVizOptionGroup = {
    /** Stable tab value, derived from position rather than the label. */
    id: string;
    label: string;
    options: DataAppVizConfigOption[];
    /** Whether the palette picker belongs in this tab. */
    hasPalette: boolean;
    /** Whether per-field options declared with this `group` render here. */
    hasFieldOptions: boolean;
};

/**
 * Buckets declared options into config tabs: one per distinct `group`, with
 * every ungrouped option collapsing into a single `Display` tab. Groups keep
 * the order in which they first appear in the declaration. A declared palette
 * joins the group it names, creating that tab if no option shares it. Per-field
 * options with a `group` do the same once their input has a bound field;
 * ungrouped ones stay under their field.
 */
export const groupDataAppVizOptions = (
    configOptions: DataAppVizConfigOption[],
    colorPalette: DataAppVizPaletteDeclaration | null,
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
): DataAppVizOptionGroup[] => {
    const buckets = new Map<string, DataAppVizConfigOption[]>();
    configOptions.forEach((option) => {
        const label = option.group ?? UNGROUPED_OPTIONS_LABEL;
        const existing = buckets.get(label);
        if (existing) existing.push(option);
        else buckets.set(label, [option]);
    });

    const paletteLabel = colorPalette
        ? (colorPalette.group ?? UNGROUPED_OPTIONS_LABEL)
        : null;
    if (paletteLabel !== null && !buckets.has(paletteLabel)) {
        buckets.set(paletteLabel, []);
    }

    const fieldOptionLabels = new Set(
        fields.flatMap((field) =>
            getDataAppVizFieldIds(fieldMapping[field.name]).length > 0
                ? (field.configOptions ?? []).flatMap((option) =>
                      option.group ? [option.group] : [],
                  )
                : [],
        ),
    );
    fieldOptionLabels.forEach((label) => {
        if (!buckets.has(label)) buckets.set(label, []);
    });

    return [...buckets.entries()].map(([label, options], index) => ({
        id: `option-group-${index}`,
        label,
        options,
        hasPalette: label === paletteLabel,
        hasFieldOptions: fieldOptionLabels.has(label),
    }));
};
