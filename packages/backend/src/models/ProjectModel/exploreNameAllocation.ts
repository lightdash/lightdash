import {
    ConflictError,
    getDeferredExploreName,
    InlineErrorType,
    isExploreError,
    isUserManagedExplore,
    type DbtExploreIdentity,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { chunk } from 'lodash';
import {
    ExploreNameAllocationsTableName,
    type DbExploreNameAllocation,
} from '../../database/entities/exploreNameAllocations';
import {
    CachedExploreStagingTableName,
    CachedExploreTableName,
} from '../../database/entities/projects';
import { rewriteAllocatedExplore } from './allocatedExploreReferences';

export type ExploreNaming = {
    mode: 'refresh' | 'deploy';
    models: DbtExploreIdentity[];
    refreshedSourceUuids: string[];
    warnings: string[];
    onPublished?: (explores: (Explore | ExploreError)[]) => void;
};

type Candidate = { identity: DbtExploreIdentity; references: Set<string> };

export const allocateStagedExploreNames = async (
    trx: Knex.Transaction,
    projectUuid: string,
    saveUuid: string,
    naming: ExploreNaming,
): Promise<{
    names: string[];
    explores: (Explore | ExploreError)[];
    warnings: string[];
    activeSourceUuids: string[];
}> => {
    const project = await trx('projects')
        .select('dbt_source_uuid', 'dbt_source_name')
        .where('project_uuid', projectUuid)
        .first();
    const primaryUuid = project?.dbt_source_uuid ?? projectUuid;
    const sources = await trx('project_dbt_sources')
        .select('project_dbt_source_uuid', 'name')
        .where('project_uuid', projectUuid);
    const sourceNames = new Map([
        [primaryUuid, project?.dbt_source_name ?? 'primary'],
        ...sources.map(
            (source) => [source.project_dbt_source_uuid, source.name] as const,
        ),
    ]);
    const keyForSource = (uuid: string | null) =>
        uuid === null || uuid === primaryUuid ? 'primary' : uuid;
    const sourceKey = (identity: DbtExploreIdentity) =>
        keyForSource(identity.sourceUuid);
    const ownerKey = (identity: DbtExploreIdentity) =>
        JSON.stringify([
            sourceKey(identity),
            identity.packageName,
            identity.uniqueId,
            identity.modelName,
        ]);
    const allocationIdentity = (
        allocation: DbExploreNameAllocation,
    ): DbtExploreIdentity => ({
        sourceUuid:
            allocation.source_key === 'primary'
                ? primaryUuid
                : allocation.source_key,
        sourceName: allocation.source_name,
        packageName: allocation.package_name,
        uniqueId: allocation.model_unique_id,
        modelName: allocation.model_name,
    });
    const cached = await trx(CachedExploreTableName)
        .where('project_uuid', projectUuid)
        .select('name', 'explore');
    const existing = await trx(ExploreNameAllocationsTableName)
        .where('project_uuid', projectUuid)
        .select('*');
    const modelsBySourceAndName = new Map<string, DbtExploreIdentity[]>();
    [...naming.models, ...existing.map(allocationIdentity)].forEach((model) => {
        const key = JSON.stringify([sourceKey(model), model.modelName]);
        modelsBySourceAndName.set(key, [
            ...(modelsBySourceAndName.get(key) ?? []),
            model,
        ]);
    });
    const staged = await trx(CachedExploreStagingTableName)
        .where({ project_uuid: projectUuid, save_uuid: saveUuid })
        .select('*');
    const candidates = new Map<string, Candidate>();
    const add = (identity: DbtExploreIdentity, reference?: string) => {
        const key = ownerKey(identity);
        const candidate = candidates.get(key) ?? {
            identity,
            references: new Set<string>(),
        };
        if (reference !== undefined) candidate.references.add(reference);
        candidates.set(key, candidate);
    };
    naming.models.forEach((identity) =>
        add(
            identity,
            getDeferredExploreName({
                unique_id: identity.uniqueId,
                lightdash_source_uuid: identity.sourceUuid ?? undefined,
            }),
        ),
    );
    const identityOf = (
        explore: Explore | ExploreError,
    ): DbtExploreIdentity => {
        if (explore.dbtModelIdentity) return explore.dbtModelIdentity;
        const table = explore.tables?.[explore.baseTable ?? explore.name];
        const sourceUuid =
            table?.dbtSourceUuid ??
            (explore as { dbtSourceUuid?: string }).dbtSourceUuid ??
            primaryUuid;
        const namespace =
            table?.dbtSourceName ?? sourceNames.get(sourceUuid) ?? null;
        const modelName =
            table && explore.baseTable !== explore.name
                ? explore.name
                : (table?.originalName ??
                  (namespace !== null &&
                  explore.name.startsWith(`${namespace}__`)
                      ? explore.name.slice(namespace.length + 2)
                      : explore.name));
        const matching = modelsBySourceAndName
            .get(JSON.stringify([keyForSource(sourceUuid), modelName]))
            ?.find(
                (model) =>
                    !table?.dbtPackageName ||
                    model.packageName === table.dbtPackageName,
            );
        const packageName =
            table?.dbtPackageName ?? matching?.packageName ?? '';
        return {
            sourceUuid,
            sourceName: namespace,
            packageName,
            uniqueId:
                table?.dbtModelUniqueId ??
                matching?.uniqueId ??
                `model.${packageName}.${modelName}`,
            modelName,
        };
    };
    const providers = new Map<
        string,
        { identity: DbtExploreIdentity; names: Set<string> }
    >();
    const addProvider = (identity: DbtExploreIdentity, name: string) => {
        const key = ownerKey(identity);
        const provider = providers.get(key) ?? {
            identity,
            names: new Set<string>(),
        };
        provider.names.add(name);
        provider.names.add(
            `${sourceNames.get(identity.sourceUuid ?? primaryUuid) ?? identity.packageName}__${identity.modelName}`,
        );
        providers.set(key, provider);
    };
    existing.forEach((allocation) =>
        addProvider(allocationIdentity(allocation), allocation.name),
    );
    cached.forEach(({ name, explore }) => {
        if (!isUserManagedExplore(explore))
            addProvider(identityOf(explore), name);
    });
    const providersByReference = new Map<string, DbtExploreIdentity[]>();
    const providersByModel = new Map<string, DbtExploreIdentity[]>();
    providers.forEach(({ identity, names }) => {
        names.forEach((name) =>
            providersByReference.set(name, [
                ...(providersByReference.get(name) ?? []),
                identity,
            ]),
        );
        for (const property of ['uniqueId', 'modelName'] as const) {
            const key = JSON.stringify([
                sourceKey(identity),
                property,
                identity[property],
            ]);
            providersByModel.set(key, [
                ...(providersByModel.get(key) ?? []),
                identity,
            ]);
        }
    });
    const identityOfTable = (
        explore: Explore | ExploreError,
        name: string,
        table: Explore['tables'][string],
    ): DbtExploreIdentity => {
        const root = identityOf(explore);
        if (name === explore.baseTable) return root;
        const fallback = {
            sourceUuid: table.dbtSourceUuid ?? root.sourceUuid,
            sourceName: table.dbtSourceName ?? root.sourceName,
            packageName: table.dbtPackageName ?? root.packageName,
            uniqueId:
                table.dbtModelUniqueId ??
                `model.${table.dbtPackageName ?? root.packageName}.${table.originalName ?? name}`,
            modelName: table.originalName ?? table.name,
        };
        if (
            naming.mode !== 'deploy' ||
            (sources.length === 0 && existing.length === 0)
        )
            return fallback;
        const reference = table.canonicalName ?? table.originalName ?? name;
        const unresolved = () =>
            new ConflictError(
                `Cannot resolve joined model "${reference}" to an existing explore in this project. Refresh the project and compile again.`,
            );
        if (
            table.dbtSourceUuid !== undefined &&
            !sourceNames.has(table.dbtSourceUuid)
        )
            throw unresolved();
        const namedSource = [...sourceNames].find(
            ([, sourceName]) => sourceName === table.dbtSourceName,
        )?.[0];
        const referencedProviders = providersByReference.get(reference) ?? [];
        const sourceUuid =
            table.dbtSourceUuid ??
            namedSource ??
            (referencedProviders.length === 1 && reference.includes('__')
                ? referencedProviders[0].sourceUuid
                : root.sourceUuid) ??
            primaryUuid;
        const sourceName = sourceNames.get(sourceUuid) ?? null;
        const modelName =
            sourceName && fallback.modelName.startsWith(`${sourceName}__`)
                ? fallback.modelName.slice(sourceName.length + 2)
                : fallback.modelName;
        const matching = (
            providersByModel.get(
                JSON.stringify([
                    keyForSource(sourceUuid),
                    table.dbtModelUniqueId ? 'uniqueId' : 'modelName',
                    table.dbtModelUniqueId ?? modelName,
                ]),
            ) ?? []
        ).filter(
            (identity) =>
                !table.dbtPackageName ||
                identity.packageName === table.dbtPackageName,
        );
        if (
            keyForSource(sourceUuid) !== sourceKey(root) &&
            matching.length !== 1
        )
            throw unresolved();
        if (matching.length === 0 && !table.dbtModelUniqueId) return fallback;
        const resolved =
            matching.length === 1
                ? matching[0]
                : { ...fallback, sourceUuid, sourceName, modelName };
        Object.assign(table, {
            canonicalName: table.canonicalName ?? table.originalName ?? name,
            dbtSourceUuid: resolved.sourceUuid ?? primaryUuid,
            dbtSourceName: sourceNames.get(resolved.sourceUuid ?? primaryUuid),
            dbtModelUniqueId: resolved.uniqueId,
            dbtPackageName: resolved.packageName,
        });
        return resolved;
    };
    staged.forEach(({ explore }: { explore: Explore | ExploreError }) => {
        const identity = identityOf(explore);
        add(identity, explore.name);
        Object.entries(explore.tables ?? {}).forEach(([name, table]) => {
            if (name === explore.baseTable) {
                add(identity, name);
                return;
            }
            const tableIdentity = identityOfTable(explore, name, table);
            if (!table.dbtModelUniqueId) return;
            add(
                tableIdentity,
                table.canonicalName === undefined ||
                    table.canonicalName === name
                    ? name
                    : table.canonicalName,
            );
        });
    });
    const writeStaged = async (explores: (Explore | ExploreError)[]) => {
        const rows = staged.map((row, index) => ({
            ...row,
            name: explores[index].name,
            table_names: Object.keys(explores[index].tables ?? {}),
            explore: JSON.stringify(explores[index]),
        }));
        await trx(CachedExploreStagingTableName)
            .where({ project_uuid: projectUuid, save_uuid: saveUuid })
            .delete();
        await chunk(rows, 500).reduce(async (previous, batch) => {
            await previous;
            await trx(CachedExploreStagingTableName).insert(batch);
        }, Promise.resolve());
    };
    if (sources.length === 0 && existing.length === 0) {
        const explores = staged.map((row) => {
            const explore = row.explore as Explore | ExploreError;
            const names = new Map([
                [explore.name, identityOf(explore).modelName],
            ]);
            Object.entries(explore.tables ?? {}).forEach(([name, table]) => {
                if (
                    table.canonicalName !== undefined &&
                    table.canonicalName !== name
                )
                    names.set(
                        table.canonicalName,
                        table.originalName ?? table.canonicalName,
                    );
                else names.set(name, table.originalName ?? name);
            });
            return rewriteAllocatedExplore(explore, names);
        });
        await writeStaged(explores);
        return {
            names: explores.map((explore) => explore.name),
            explores,
            warnings: [],
            activeSourceUuids: [...sourceNames.keys()],
        };
    }
    const byName = new Map(
        existing.map((allocation) => [allocation.name, allocation]),
    );
    const byOwner = new Map(
        existing.map((allocation) => [
            ownerKey(allocationIdentity(allocation)),
            allocation,
        ]),
    );
    const pending: Omit<
        DbExploreNameAllocation,
        'explore_name_allocation_uuid'
    >[] = [];
    const claim = (identity: DbtExploreIdentity, name: string) => {
        const allocation = {
            project_uuid: projectUuid,
            name,
            source_key: sourceKey(identity),
            source_name: identity.sourceName,
            package_name: identity.packageName,
            model_unique_id: identity.uniqueId,
            model_name: identity.modelName,
        };
        pending.push(allocation);
        const row = { ...allocation, explore_name_allocation_uuid: '' };
        byName.set(name, row);
        byOwner.set(ownerKey(identity), row);
        return row;
    };
    cached.forEach(
        ({
            name,
            explore,
        }: {
            name: string;
            explore: Explore | ExploreError;
        }) => {
            if (isUserManagedExplore(explore)) return;
            if (
                isExploreError(explore) &&
                explore.errors.some(
                    (error) =>
                        error.type === InlineErrorType.EXPLORE_NAME_COLLISION,
                )
            )
                return;
            const identity = identityOf(explore);
            if (!byName.has(name) && !byOwner.has(ownerKey(identity)))
                claim(identity, name);
        },
    );
    const refreshed = new Set(
        naming.refreshedSourceUuids.map((uuid) =>
            uuid === primaryUuid ? 'primary' : uuid,
        ),
    );
    const stale = [...byOwner].filter(
        ([key, allocation]) =>
            (allocation.source_key !== 'primary' &&
                !sourceNames.has(allocation.source_key)) ||
            (refreshed.has(allocation.source_key) && !candidates.has(key)),
    );
    for (const [key, allocation] of stale) {
        byName.delete(allocation.name);
        byOwner.delete(key);
    }
    if (stale.length > 0)
        await trx(ExploreNameAllocationsTableName)
            .where('project_uuid', projectUuid)
            .whereIn(
                'name',
                stale.map(([, allocation]) => allocation.name),
            )
            .delete();
    const blocked = new Map<string, string>();
    const warnings: string[] = [];
    const warningsByOwner = new Map<string, string>();
    const unallocated = [...candidates].filter(([key]) => !byOwner.has(key));
    const unallocatedByModel = new Map<string, Candidate[]>();
    unallocated.forEach(([, candidate]) => {
        const { modelName } = candidate.identity;
        unallocatedByModel.set(modelName, [
            ...(unallocatedByModel.get(modelName) ?? []),
            candidate,
        ]);
    });
    const sameRunCollisions = new Set<string>();
    unallocatedByModel.forEach((models, modelName) => {
        if (new Set(models.map(({ identity }) => sourceKey(identity))).size > 1)
            sameRunCollisions.add(modelName);
        else if (!byName.has(modelName)) claim(models[0].identity, modelName);
    });
    const ownerDescription = (allocation: DbExploreNameAllocation) =>
        `model "${allocation.model_name}" from ${allocation.source_name === null ? 'package' : 'source'} "${allocation.source_name ?? allocation.package_name}" (${allocation.model_unique_id})`;
    for (const [key, { identity }] of candidates) {
        const bareOwner = byName.get(identity.modelName);
        let allocation = byOwner.get(key);
        if (!allocation) {
            const namespace = identity.sourceName ?? identity.packageName;
            const qualified = `${namespace}__${identity.modelName}`;
            const qualifiedOwner = byName.get(qualified);
            if (qualifiedOwner) {
                const message = `Model "${identity.modelName}" (${identity.uniqueId}) cannot use explore name "${qualified}" because it is owned by ${ownerDescription(qualifiedOwner)}. Rename the source, package or model and deploy again.`;
                if (naming.mode === 'deploy') throw new ConflictError(message);
                blocked.set(key, message);
            } else {
                allocation = claim(identity, qualified);
            }
        }
        if (
            allocation &&
            allocation.name !== identity.modelName &&
            bareOwner &&
            ownerKey(allocationIdentity(bareOwner)) !== key
        ) {
            const warning = `Model "${identity.modelName}" (${identity.uniqueId}) is assigned explore name "${allocation.name}" because "${identity.modelName}" is owned by ${ownerDescription(bareOwner)}.`;
            warnings.push(warning);
            warningsByOwner.set(key, warning);
        } else if (
            allocation &&
            allocation.name !== identity.modelName &&
            sameRunCollisions.has(identity.modelName)
        ) {
            const warning = `Model "${identity.modelName}" (${identity.uniqueId}) is assigned explore name "${allocation.name}" because multiple new sources define "${identity.modelName}" in this publication.`;
            warnings.push(warning);
            warningsByOwner.set(key, warning);
        }
    }
    const rows = pending.filter(
        (allocation) =>
            byOwner.get(
                ownerKey(
                    allocationIdentity({
                        ...allocation,
                        explore_name_allocation_uuid: '',
                    }),
                ),
            )?.name === allocation.name,
    );
    await chunk(rows, 500).reduce(async (previous, batch) => {
        await previous;
        await trx(ExploreNameAllocationsTableName).insert(batch);
    }, Promise.resolve());
    const errorNames = new Map<string, string>();
    for (const [key] of blocked) {
        const { identity } = candidates.get(key)!;
        const base = `${identity.sourceName ?? identity.packageName}__${identity.modelName}__conflict`;
        let name = base;
        let suffix = 1;
        while (byName.has(name) || [...errorNames.values()].includes(name)) {
            name = `${base}_${suffix}`;
            suffix += 1;
        }
        errorNames.set(key, name);
    }
    const referenceNames = new Map<string, string>();
    candidates.forEach((candidate, key) => {
        const assigned = byOwner.get(key)?.name ?? errorNames.get(key);
        if (assigned)
            candidate.references.forEach((reference) =>
                referenceNames.set(reference, assigned),
            );
    });
    const rewritten = staged.map((row) => {
        const explore = row.explore as Explore | ExploreError;
        const identity = identityOf(explore);
        const names = new Map<string, string>();
        const ownKey = ownerKey(identity);
        const assigned = byOwner.get(ownKey)?.name ?? errorNames.get(ownKey)!;
        let conflict = blocked.get(ownKey);
        names.set(explore.name, assigned);
        Object.entries(explore.tables ?? {}).forEach(([name, table]) => {
            for (const [lineageName, dependencies] of Object.entries(
                table.lineageGraph ?? {},
            )) {
                const lineageAssigned = referenceNames.get(lineageName);
                if (lineageAssigned) names.set(lineageName, lineageAssigned);
                dependencies.forEach((dependency) => {
                    const dependencyAssigned = referenceNames.get(
                        dependency.name,
                    );
                    if (dependencyAssigned)
                        names.set(dependency.name, dependencyAssigned);
                });
            }
            const tableIdentity = identityOfTable(explore, name, table);
            const tableOwnerKey = ownerKey(tableIdentity);
            conflict ??= blocked.get(tableOwnerKey);
            const allocation = byOwner.get(tableOwnerKey);
            if (
                allocation &&
                (name === explore.baseTable ||
                    table.canonicalName === undefined ||
                    table.canonicalName === name)
            )
                names.set(name, allocation.name);
            if (table.canonicalName && allocation)
                names.set(table.canonicalName, allocation.name);
        });
        let result: Explore | ExploreError = conflict
            ? {
                  name: assigned,
                  label: explore.label,
                  dbtModelIdentity: identity,
                  errors: [
                      {
                          type: InlineErrorType.EXPLORE_NAME_COLLISION,
                          message: conflict,
                      },
                  ],
              }
            : rewriteAllocatedExplore(explore, names);
        const warning = warningsByOwner.get(ownKey);
        if (warning && !('errors' in result))
            result = {
                ...result,
                warnings: [
                    ...(result.warnings ?? []),
                    {
                        type: InlineErrorType.EXPLORE_NAME_COLLISION,
                        message: warning,
                    },
                ],
            };
        return result;
    });
    await writeStaged(rewritten);
    return {
        names: rewritten.map((explore) => explore.name),
        explores: rewritten,
        warnings,
        activeSourceUuids: [...sourceNames.keys()],
    };
};
