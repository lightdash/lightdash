import {
    getMalformedParameterControlMessages,
    getPortableSlugs,
    ParameterError,
    type DashboardParameterControl,
    type DashboardParameterControlAsCode,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { PORTABLE_SLUG_PATTERN } from './dashboardReferences';

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

const controlSlugs = (
    controls: Pick<
        DashboardParameterControlAsCode,
        'label' | 'parameters' | 'slug'
    >[],
): string[] => getPortableSlugs(controls, baseSlug);

export const getParameterControlsWithSlugs = (
    controls: DashboardParameterControl[],
): DashboardParameterControlAsCode[] => {
    const slugs = controlSlugs(controls);
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
                ? { ...control, id: control.id || 'pending' }
                : control,
        ),
    );
    if (malformed.length) throw new ParameterError(malformed.join('. '));
    const seenSlugs = new Set<string>();
    const claimed = new Set<string>();
    controls.forEach(({ slug, id }) => {
        if (slug !== undefined) {
            if (!slug || !PORTABLE_SLUG_PATTERN.test(slug))
                throw new ParameterError(
                    `Invalid parameter control slug "${slug}"`,
                );
            if (seenSlugs.has(slug))
                throw new ParameterError(
                    `Parameter control slug "${slug}" is duplicated`,
                );
            seenSlugs.add(slug);
        }
        if (id !== undefined) {
            if (!id || claimed.has(id))
                throw new ParameterError(
                    `Parameter control id "${id}" is duplicated`,
                );
            claimed.add(id);
        }
    });
    const existingSlugs = controlSlugs(existing);
    const matches = controls.map(({ slug, id }) => {
        const match =
            slug === undefined
                ? undefined
                : existing.find((_, index) => existingSlugs[index] === slug)
                      ?.id;
        if (id && match && id !== match)
            throw new ParameterError(
                `Parameter control slug "${slug}" conflicts with id "${id}"`,
            );
        if (match && !id) {
            if (claimed.has(match))
                throw new ParameterError(
                    `Parameter control id "${match}" is duplicated`,
                );
            claimed.add(match);
        }
        return id ?? match;
    });
    return controls.map(({ slug, id: _id, ...control }, index) => {
        const id = matches[index] ?? uuidv4();
        const savedSlug = slug ?? existing.find((item) => item.id === id)?.slug;
        return {
            ...control,
            id,
            ...(savedSlug !== undefined && { slug: savedSlug }),
        };
    });
};
