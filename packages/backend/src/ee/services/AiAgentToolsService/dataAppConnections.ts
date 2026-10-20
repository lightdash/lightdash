import {
    ParameterError,
    uniqueAliasFromName,
    type AppExternalConnectionLink,
} from '@lightdash/common';
import type {
    ConnectionSlugLookup,
    DataAppConnectionIdentity,
} from '../AppGenerateService/externalConnectionSlugLookup';

const describeUnusableSlug = (
    lookup: Exclude<ConnectionSlugLookup, { status: 'found' }>,
): string =>
    lookup.status === 'not_found'
        ? `"${lookup.slug}" was not found in this project`
        : `"${lookup.slug}" is not available for you to link to data apps`;

/**
 * Links to add for the requested connections: skips ones already linked and
 * picks aliases unique on the app. Any unusable slug rejects the whole request.
 */
export const planConnectionLinks = (
    lookups: ConnectionSlugLookup[],
    existingLinks: AppExternalConnectionLink[],
): AppExternalConnectionLink[] => {
    const unusable = lookups.filter(
        (
            lookup,
        ): lookup is Exclude<ConnectionSlugLookup, { status: 'found' }> =>
            lookup.status !== 'found',
    );
    if (unusable.length > 0) {
        throw new ParameterError(
            `Cannot link external connections: ${unusable
                .map(describeUnusableSlug)
                .join(
                    '; ',
                )}. Call list_data_app_connections for the slugs you can pass in externalConnectionSlugs. No build was started.`,
        );
    }
    const linkedUuids = new Set(
        existingLinks.map((link) => link.externalConnectionUuid),
    );
    const aliases = existingLinks.map((link) => link.alias);
    return lookups.reduce<AppExternalConnectionLink[]>((links, lookup) => {
        if (
            lookup.status !== 'found' ||
            linkedUuids.has(lookup.connection.externalConnectionUuid)
        ) {
            return links;
        }
        const alias = uniqueAliasFromName(lookup.connection.name, aliases);
        aliases.push(alias);
        linkedUuids.add(lookup.connection.externalConnectionUuid);
        return [
            ...links,
            {
                externalConnectionUuid:
                    lookup.connection.externalConnectionUuid,
                alias,
            },
        ];
    }, []);
};

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mentions = (text: string, term: string): boolean =>
    term.trim() !== '' &&
    new RegExp(
        `(?<![a-z0-9])${escapeRegExp(term.trim().toLowerCase())}(?![a-z0-9])`,
    ).test(text);

/** Warnings for connections the brief names (by name or slug) that the app does not link. */
export const findUnlinkedConnectionMentions = (
    brief: string,
    visibleConnections: DataAppConnectionIdentity[],
    linkedConnectionUuids: string[],
): string[] => {
    const text = brief.toLowerCase();
    const linked = new Set(linkedConnectionUuids);
    return visibleConnections
        .filter(
            (connection) =>
                !linked.has(connection.externalConnectionUuid) &&
                (mentions(text, connection.name) ||
                    mentions(text, connection.slug)),
        )
        .map(
            ({ name, slug }) =>
                `Brief mentions "${name}" (slug "${slug}") but it isn't linked to the app; pass externalConnectionSlugs: ["${slug}"] to link it.`,
        );
};
