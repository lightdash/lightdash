export const getPortableSlugs = <T extends { slug?: string }>(
    items: T[],
    nameOf: (item: T) => string,
): string[] => {
    const bases = items.map(nameOf);
    const counts = new Map<string, number>();
    items.forEach((control, index) => {
        if (control.slug === undefined)
            counts.set(bases[index], (counts.get(bases[index]) ?? 0) + 1);
    });
    const reserved = new Set([
        ...bases,
        ...items.flatMap((control) =>
            control.slug === undefined ? [] : [control.slug],
        ),
    ]);
    const used = new Set(
        items.flatMap((control) =>
            control.slug === undefined ? [] : [control.slug],
        ),
    );
    return items.map((control, index) => {
        if (control.slug !== undefined) return control.slug;
        const base = bases[index];
        let slug = base;
        let suffix = 1;
        if ((counts.get(base) ?? 0) > 1 || used.has(base)) {
            do {
                slug = `${base}-${suffix}`;
                suffix += 1;
            } while (reserved.has(slug) || used.has(slug));
        }
        used.add(slug);
        return slug;
    });
};
