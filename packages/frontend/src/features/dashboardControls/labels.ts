// A field or parameter as the controls surface names it: its own label, and
// the table or model it belongs to (none for project parameters and SQL columns)
export type LabelledItem = {
    id: string;
    label: string;
    group: string | null;
};

// What is shown: the group only when it is needed to tell two items apart
export type DisplayLabel = {
    label: string;
    group: string | null;
};

// Display labels for items shown together in one list or set. An item carries
// its table or model name only when another item in the set has the same label.
export const getDisplayLabels = (
    items: LabelledItem[],
): Record<string, DisplayLabel> => {
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    const counts = new Map<string, number>();
    unique.forEach(({ label }) =>
        counts.set(label, (counts.get(label) ?? 0) + 1),
    );
    return Object.fromEntries(
        unique.map(({ id, label, group }) => [
            id,
            { label, group: (counts.get(label) ?? 0) > 1 ? group : null },
        ]),
    );
};

// A tile's own options, told apart among themselves. An option that has a
// row in the panel (mapped or suggested) reads as that row, on every tile, so
// tile and row can be matched and a cleared tile offers what its neighbours show.
export const getTileDisplayLabels = (
    options: LabelledItem[],
    rowLabels: Record<string, DisplayLabel>,
): Record<string, DisplayLabel> => {
    const own = getDisplayLabels(options);
    return Object.fromEntries(
        Object.entries(own).map(([id, display]) => [
            id,
            rowLabels[id] ?? display,
        ]),
    );
};

export const formatDisplayLabel = ({ label, group }: DisplayLabel): string =>
    group ? `${group} ${label}` : label;

// Every item with its table: how the product's field picker names a field,
// so a field reads the same in the list and on every tile
export const getFullDisplayLabels = (
    items: LabelledItem[],
): Record<string, DisplayLabel> =>
    Object.fromEntries(
        items.map(({ id, label, group }) => [id, { label, group }]),
    );
