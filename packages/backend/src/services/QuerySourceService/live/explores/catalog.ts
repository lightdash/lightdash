import {
    getLiveObjectModelName,
    UnexpectedServerError,
    type ApiConnectorType,
} from '@lightdash/common';
import { z } from 'zod';
import { getLiveIntegration } from '../registry';
import {
    type LiveCatalog,
    type LiveCatalogEntry,
    type LiveConfiguredCatalog,
    type LiveObjectCatalog,
} from '../types';
import { catalogEntrySchema, type LiveSourceCatalog } from './catalogState';
import { type LiveExploreDefinition } from './definition';
import { type ScannedLiveSourceField } from './fields';

/**
 * Whether an object id can sit in one path segment of an access rule as it
 * is: no `/`, which would add segments, and no `{` or `}`, which would make
 * the segment match any object.
 */
const isPathSafeObjectId = (id: string) => !/[/{}?#\s%]/.test(id);

/**
 * What a Refresh stores of what `discover` returned: its entries, checked.
 * An object whose id can't be a path segment is left out, so it can never
 * widen the source's access.
 */
export const toLiveSourceCatalog = (
    connector: ApiConnectorType,
    discovered: LiveCatalog,
    refreshedAt: Date,
): LiveSourceCatalog => {
    const parsed = z
        .array(catalogEntrySchema)
        .safeParse(discovered.entries ?? []);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            `${getLiveIntegration(connector).label} reported a catalog in an unexpected shape`,
        );
    }
    const ids = parsed.data.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
        throw new UnexpectedServerError(
            `${getLiveIntegration(connector).label} reported one object twice`,
        );
    }
    return {
        refreshedAt: refreshedAt.toISOString(),
        entries: parsed.data.filter(
            ({ id, builtIn }) => builtIn || isPathSafeObjectId(id),
        ),
    };
};

/** The objects a workspace made, which admins turn on one by one. */
export const getLiveCustomObjects = (
    catalog: LiveObjectCatalog | null,
): LiveCatalogEntry[] =>
    (catalog?.entries ?? []).filter(({ builtIn }) => !builtIn);

/** Model names a custom object can't take: built-in, planned and named ones. */
const getTakenModelNames = (
    connector: ApiConnectorType,
    configured: LiveConfiguredCatalog,
): Set<string> => {
    const { explores, plannedNames = [] } = getLiveIntegration(connector).model;
    return new Set([
        ...explores.map(({ name }) => name),
        ...plannedNames,
        ...Object.values(configured.objects).map(({ name }) => name),
    ]);
};

/**
 * The model name a custom object gets when first turned on: its vendor id
 * as a slug, numbered past any name taken. `isExploreTaken` says whether an
 * explore of that model name belongs to something else in the project.
 */
export const getLiveObjectName = ({
    connector,
    configured,
    objectId,
    isTaken = () => false,
}: {
    connector: ApiConnectorType;
    configured: LiveConfiguredCatalog;
    objectId: string;
    isTaken?: (model: string) => boolean;
}): string => {
    if (Object.hasOwn(configured.objects, objectId)) {
        return configured.objects[objectId].name;
    }
    const taken = getTakenModelNames(connector, configured);
    return getLiveObjectModelName(
        objectId,
        (model) => taken.has(model) || isTaken(model),
    );
};

/**
 * A custom object's explore, ready to build: its definition without the
 * discovered fields, which come as scanned fields so field edits apply to
 * them as they do on built-in explores.
 */
export type LiveCustomModel = {
    model: string;
    objectId: string;
    base: LiveExploreDefinition;
    scannedFields: ScannedLiveSourceField[];
};

/** The explores of the custom objects an admin turned on, as the integration describes them. */
export const getLiveCustomModels = ({
    connector,
    catalog,
    configured,
}: {
    connector: ApiConnectorType;
    catalog: LiveObjectCatalog | null;
    configured: LiveConfiguredCatalog;
}): LiveCustomModel[] => {
    const describeObject =
        getLiveIntegration(connector).model.discovery?.describeObject;
    if (!describeObject) return [];
    return getLiveCustomObjects(catalog).flatMap((entry): LiveCustomModel[] => {
        if (!Object.hasOwn(configured.objects, entry.id)) return [];
        const model = configured.objects[entry.id].name;
        const definition: LiveExploreDefinition = {
            ...describeObject(entry),
            name: model,
            object: entry.id,
        };
        const discovered = new Map(
            entry.fields.map((field) => [field.id, field]),
        );
        const isDiscovered = ({ apiName }: { apiName: string }) =>
            discovered.has(apiName);
        const isInternal = (apiName: string) =>
            discovered.get(apiName)?.internal === true;
        return [
            {
                model,
                objectId: entry.id,
                base: {
                    ...definition,
                    dimensions: definition.dimensions.filter(
                        (field) => !isDiscovered(field),
                    ),
                    metrics: definition.metrics.filter(
                        (field) => !isDiscovered(field),
                    ),
                },
                scannedFields: [
                    ...definition.dimensions.filter(isDiscovered).map(
                        (field): ScannedLiveSourceField => ({
                            kind: 'dimension',
                            definition: field,
                            isInternal: isInternal(field.apiName),
                            model,
                        }),
                    ),
                    ...definition.metrics.filter(isDiscovered).map(
                        (field): ScannedLiveSourceField => ({
                            kind: 'metric',
                            definition: field,
                            isInternal: isInternal(field.apiName),
                            model,
                        }),
                    ),
                ],
            },
        ];
    });
};
export type { LiveSourceCatalog } from './catalogState';
