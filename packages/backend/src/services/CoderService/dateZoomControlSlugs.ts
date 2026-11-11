import {
    getPortableSlugs,
    ParameterError,
    type DateZoomControl,
    type DateZoomControlUploadAsCode,
    type DateZoomTileTarget,
    type DateZoomTileTargetUploadAsCode,
} from '@lightdash/common';
import { getStableIds } from './dashboardReferences';

const baseSlug = ({ name }: Pick<DateZoomControl, 'name'>): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'date-zoom';

/** A file's slug, else derived from the name */
export const dateZoomSlugs = (
    controls: Pick<DateZoomControlUploadAsCode, 'name' | 'slug'>[],
): string[] => getPortableSlugs(controls, baseSlug);

type UploadedControl = Pick<DateZoomControlUploadAsCode, 'uuid' | 'slug'> &
    Pick<DateZoomControl, 'name'>;

/** Controls keep a file uuid, else the saved uuid their name matches, else a new one; targets resolve `controlSlug` */
export const getDateZoomConfigWithIds = <C extends UploadedControl>(
    config: {
        controls?: C[];
        tileTargets?: Record<string, DateZoomTileTargetUploadAsCode>;
    },
    existing: Pick<DateZoomControl, 'uuid' | 'name'>[],
): {
    controls: (Omit<C, 'uuid' | 'slug'> & { uuid: string })[];
    tileTargets: Record<string, DateZoomTileTarget>;
} => {
    // Older readers tolerated a config without either list
    const fileControls = config.controls ?? [];
    const fileTargets = config.tileTargets ?? {};
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
    const fileUuids = new Set(
        fileControls.flatMap(({ uuid }) => (uuid === undefined ? [] : [uuid])),
    );
    const newIds = getStableIds(
        fileControls.filter(({ uuid }) => uuid === undefined),
        existing.map(({ uuid, name }) => ({ id: uuid, name })),
        baseSlug,
        fileUuids,
    );
    // A file's slugs only resolve refs inside it
    const controls = fileControls.map(({ slug: _slug, uuid, ...control }) => ({
        ...control,
        uuid: uuid ?? (newIds.shift() as string),
    }));
    const slugs = dateZoomSlugs(fileControls);
    const uuidBySlug = new Map(
        slugs.map((slug, index) => [slug, controls[index].uuid]),
    );
    const validSlugs = slugs.join(', ') || 'none';
    const tileTargets = Object.fromEntries(
        Object.entries(fileTargets).map(([tile, target]) => {
            const { controlSlug, ...rest } = target;
            if (controlSlug === undefined) {
                if (rest.controlUuid === undefined)
                    throw new ParameterError(
                        `The date zoom target of tile "${tile}" needs a controlSlug. Valid date zoom control slugs are ${validSlugs}`,
                    );
                // Unchanged, as uploads stored it before control slugs
                return [tile, target as DateZoomTileTarget];
            }
            const controlUuid = uuidBySlug.get(controlSlug);
            if (controlUuid === undefined)
                throw new ParameterError(
                    `Unknown date zoom control slug "${controlSlug}" on tile "${tile}". Valid date zoom control slugs are ${validSlugs}`,
                );
            return [tile, { ...rest, controlUuid }];
        }),
    );
    return { controls, tileTargets };
};

/** Each control gets the slug derived from its name, and each target its control's slug */
export const getDateZoomConfigWithSlugs = <
    C extends Pick<DateZoomControl, 'uuid' | 'name'>,
    T extends Pick<DateZoomTileTarget, 'controlUuid'>,
>(config: {
    controls: C[];
    tileTargets: Record<string, T>;
}) => {
    const slugs = dateZoomSlugs(config.controls.map(({ name }) => ({ name })));
    const slugByUuid = new Map<string, string>();
    config.controls.forEach(({ uuid }, index) => {
        if (!slugByUuid.has(uuid)) slugByUuid.set(uuid, slugs[index]);
    });
    return {
        ...config,
        controls: config.controls.map(({ uuid, ...control }, index) => ({
            uuid,
            slug: slugs[index],
            ...control,
        })),
        tileTargets: Object.fromEntries(
            Object.entries(config.tileTargets).map(([tile, target]) => {
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
