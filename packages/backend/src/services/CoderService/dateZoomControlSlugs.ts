import {
    getPortableSlugs,
    ParameterError,
    type DateZoomControl,
    type DateZoomControlAsCode,
    type DateZoomTileTarget,
    type DateZoomTileTargetAsCode,
} from '@lightdash/common';

const baseSlug = ({ name }: Pick<DateZoomControl, 'name'>): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'date-zoom';

/** A file's slug, else derived from the name */
export const dateZoomSlugs = (
    controls: Pick<DateZoomControlAsCode, 'name' | 'slug'>[],
): string[] => getPortableSlugs(controls, baseSlug);

/** Checks the file's zoom slugs and drops them with `controlSlug`: uuids are authoritative and slugs are never stored */
export const getDateZoomConfigWithoutSlugs = <
    C extends DateZoomControlAsCode,
>(config: {
    controls?: C[];
    tileTargets?: Record<string, DateZoomTileTargetAsCode>;
}): {
    controls: Omit<C, 'slug'>[];
    tileTargets: Record<string, DateZoomTileTarget>;
} => {
    // Older readers tolerated a config without either list
    const fileControls = config.controls ?? [];
    const seen = new Set<string>();
    fileControls.forEach(({ slug }) => {
        if (slug === undefined) return;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new ParameterError(
                `Invalid date zoom control slug "${slug}"; use lowercase letters and digits, with single hyphens between them`,
            );
        if (seen.has(slug))
            throw new ParameterError(
                `Date zoom control slug "${slug}" is duplicated`,
            );
        seen.add(slug);
    });
    return {
        controls: fileControls.map(({ slug: _slug, ...control }) => control),
        tileTargets: Object.fromEntries(
            Object.entries(config.tileTargets ?? {}).map(
                ([tile, { controlSlug: _controlSlug, ...target }]) => [
                    tile,
                    target,
                ],
            ),
        ),
    };
};

/** Each control gets the slug derived from its name, and each target its control's slug */
export const getDateZoomConfigWithSlugs = <
    C extends Pick<DateZoomControl, 'uuid' | 'name'> & { slug?: string },
    T extends Pick<DateZoomTileTarget, 'controlUuid'>,
>(config: {
    controls?: C[];
    tileTargets?: Record<string, T>;
}) => {
    // Older readers tolerated a config without either list
    const controls = config.controls ?? [];
    const slugs = dateZoomSlugs(controls.map(({ name }) => ({ name })));
    const slugByUuid = new Map<string, string>();
    controls.forEach(({ uuid }, index) => {
        if (!slugByUuid.has(uuid)) slugByUuid.set(uuid, slugs[index]);
    });
    return {
        ...config,
        // Derived on every download: a stored slug is ignored
        controls: controls.map(({ uuid, slug: _slug, ...control }, index) => ({
            uuid,
            slug: slugs[index],
            ...control,
        })),
        tileTargets: Object.fromEntries(
            Object.entries(config.tileTargets ?? {}).map(([tile, target]) => {
                const controlSlug = slugByUuid.get(target.controlUuid);
                return [
                    tile,
                    controlSlug === undefined
                        ? target
                        : { ...target, controlSlug },
                ];
            }),
        ),
    };
};
