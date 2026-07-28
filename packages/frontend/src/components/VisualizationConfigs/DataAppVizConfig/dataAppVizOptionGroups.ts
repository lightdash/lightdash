import { type DataAppVizConfigOption } from '@lightdash/common';

/** Label for the tab collecting every option that declared no `group`. */
export const UNGROUPED_OPTIONS_LABEL = 'Display';

export type DataAppVizOptionGroup = {
    /** Stable tab value, derived from position rather than the label. */
    id: string;
    label: string;
    options: DataAppVizConfigOption[];
};

/**
 * Buckets declared options into config tabs: one per distinct `group`, with
 * every ungrouped option collapsing into a single `Display` tab. Groups keep
 * the order in which they first appear in the declaration.
 */
export const groupDataAppVizOptions = (
    configOptions: DataAppVizConfigOption[],
): DataAppVizOptionGroup[] => {
    const buckets = new Map<string, DataAppVizConfigOption[]>();
    configOptions.forEach((option) => {
        const label = option.group ?? UNGROUPED_OPTIONS_LABEL;
        const existing = buckets.get(label);
        if (existing) existing.push(option);
        else buckets.set(label, [option]);
    });

    return [...buckets.entries()].map(([label, options], index) => ({
        id: `option-group-${index}`,
        label,
        options,
    }));
};
