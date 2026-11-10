import {
    getMalformedParameterControlMessages,
    getPortableSlugs,
    ParameterError,
    type DashboardParameterControl,
    type DashboardParameterControlAsCode,
} from '@lightdash/common';
import { getStableIds } from './dashboardReferences';

const baseSlug = (
    control: Pick<DashboardParameterControlAsCode, 'label' | 'parameters'>,
): string => {
    const sanitize = (value: string) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    return (
        sanitize(control.label ?? '') ||
        sanitize(Object.keys(control.parameters)[0] ?? '') ||
        'parameter'
    );
};

/** A file's slug, else derived from the label or first parameter key */
export const controlSlugs = (
    controls: Pick<
        DashboardParameterControlAsCode,
        'label' | 'parameters' | 'slug'
    >[],
): string[] => getPortableSlugs(controls, baseSlug);

export const getParameterControlsWithSlugs = (
    controls: DashboardParameterControl[],
): DashboardParameterControlAsCode[] => {
    // Derived on every download: a stored slug is ignored
    const slugs = controlSlugs(
        controls.map(({ label, parameters }) => ({ label, parameters })),
    );
    return controls.map(({ id: _id, slug: _slug, ...control }, index) => ({
        slug: slugs[index],
        ...control,
    }));
};

export const getParameterControlsWithIds = (
    controls: DashboardParameterControlAsCode[],
    existing: DashboardParameterControl[],
): DashboardParameterControl[] => {
    if (!Array.isArray(controls))
        throw new ParameterError('Parameter controls must be a list');
    const malformed = getMalformedParameterControlMessages(
        controls.map((control) =>
            typeof control === 'object' && control !== null
                ? { ...control, id: 'pending' }
                : control,
        ),
    );
    if (malformed.length) throw new ParameterError(malformed.join('. '));
    const seenSlugs = new Set<string>();
    controls.forEach(({ slug }) => {
        if (slug === undefined) return;
        if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new ParameterError(
                `Invalid parameter control slug "${slug}"`,
            );
        if (seenSlugs.has(slug))
            throw new ParameterError(
                `Parameter control slug "${slug}" is duplicated`,
            );
        seenSlugs.add(slug);
    });
    const stableIds = getStableIds(controls, existing, baseSlug);
    // A file's slugs only resolve refs inside it
    return controls.map(({ slug: _slug, ...control }, index) => ({
        ...control,
        id: stableIds[index],
    }));
};
