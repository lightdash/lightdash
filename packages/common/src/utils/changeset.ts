import * as JsonPatch from 'fast-json-patch';
import { type ChangeBase } from '../types/changeset';
import {
    ForbiddenError,
    NotImplementedError,
    ParameterError,
} from '../types/errors';
import {
    isExploreError,
    type CompiledTable,
    type Explore,
    type ExploreError,
} from '../types/explore';
import { type CompiledDimension, type CompiledMetric } from '../types/field';
import assertUnreachable from './assertUnreachable';

export class ChangesetUtils {
    private static applyChange<
        T extends CompiledDimension | CompiledMetric | CompiledTable | Explore,
    >(entity: T | undefined, change: ChangeBase): T | undefined {
        switch (change.type) {
            case 'create':
                throw new ParameterError('Create change is not supported');

            case 'delete':
                throw new ParameterError('Delete change is not supported');

            case 'update':
                if (!entity) {
                    return undefined;
                }
                const errors = JsonPatch.validate(
                    change.payload.patches,
                    entity,
                );
                if (errors) {
                    throw new Error(`Invalid patches: ${errors.message}`);
                }
                const result = JsonPatch.applyPatch(
                    entity,
                    change.payload.patches,
                );
                return result.newDocument;

            default:
                return assertUnreachable(change, 'Invalid change type');
        }
    }

    static applyChangeset<C extends ChangeBase>(
        changeset: { changes: C[] },
        explores: Record<string, Explore | ExploreError>,
    ) {
        const changedExplores = Object.entries(explores).reduce<
            Record<string, Explore | ExploreError>
        >((acc, [exploreName, explore]) => {
            if (isExploreError(explore)) {
                return acc;
            }

            const relevantChanges = changeset.changes.filter(
                (change) => explore.tables[change.entityTableName],
            );

            if (relevantChanges.length === 0) {
                return acc;
            }

            let patchedExplore = explore;

            for (const change of relevantChanges) {
                const tableName = change.entityTableName;

                switch (change.entityType) {
                    case 'table':
                        switch (change.type) {
                            case 'create':
                                throw new NotImplementedError(
                                    `Not implemented: applyChange for table ${tableName} create change`,
                                );
                            case 'update':
                                const updatePatch = JsonPatch.applyPatch(
                                    patchedExplore,
                                    [
                                        ...(patchedExplore.baseTable ===
                                            change.entityName &&
                                        change.entityName in patchedExplore
                                            ? [
                                                  {
                                                      op: 'replace' as const,
                                                      path: `/`,
                                                      value: this.applyChange(
                                                          patchedExplore,
                                                          change,
                                                      ),
                                                  },
                                              ]
                                            : []),
                                        {
                                            op: 'replace',
                                            path: `/tables/${change.entityName}`,
                                            value: this.applyChange(
                                                patchedExplore.tables[
                                                    change.entityName
                                                ],
                                                change,
                                            ),
                                        },
                                    ],
                                );
                                patchedExplore = updatePatch.newDocument;
                                break;
                            case 'delete':
                                throw new NotImplementedError(
                                    `Not implemented: applyChange for table ${tableName} delete change`,
                                );
                            default:
                                return assertUnreachable(
                                    change,
                                    'Invalid change type',
                                );
                        }
                        break;

                    case 'metric':
                    case 'dimension':
                        const entityType = `${change.entityType}s` as const;

                        switch (change.type) {
                            case 'create':
                                if (
                                    patchedExplore.tables[tableName][
                                        entityType
                                    ][change.entityName]
                                ) {
                                    throw new ForbiddenError(
                                        `Entity "${change.entityName}" already exists in table "${tableName}" of explore`,
                                    );
                                }

                                const createPatch = JsonPatch.applyPatch(
                                    patchedExplore,
                                    [
                                        {
                                            op: 'replace',
                                            path: `/tables/${tableName}/${entityType}/${change.entityName}`,
                                            value: change.payload.value,
                                        },
                                    ],
                                );
                                patchedExplore = createPatch.newDocument;
                                break;

                            case 'update':
                                if (!patchedExplore.tables[tableName]) {
                                    break;
                                }

                                const updatePatch = JsonPatch.applyPatch(
                                    patchedExplore,
                                    [
                                        {
                                            op: 'replace',
                                            path: `/tables/${tableName}/${entityType}/${change.entityName}`,
                                            value: this.applyChange(
                                                patchedExplore.tables[
                                                    tableName
                                                ][entityType][
                                                    change.entityName
                                                ],
                                                change,
                                            ),
                                        },
                                    ],
                                );
                                patchedExplore = updatePatch.newDocument;
                                break;

                            case 'delete':
                                const deletePatch = JsonPatch.applyPatch(
                                    patchedExplore,
                                    [
                                        {
                                            op: 'remove',
                                            path: `/tables/${tableName}/${entityType}/${change.entityName}`,
                                        },
                                    ],
                                );
                                patchedExplore = deletePatch.newDocument;
                                break;

                            default:
                                return assertUnreachable(
                                    change,
                                    'Invalid change type',
                                );
                        }
                        break;

                    default:
                        return assertUnreachable(
                            change.entityType,
                            'Invalid entity type',
                        );
                }
            }

            acc[exploreName] = patchedExplore;
            return acc;
        }, {});

        const patchedExploreNamess = Object.keys(changedExplores);
        if (patchedExploreNamess.length > 0) {
            const patchResult = JsonPatch.applyPatch(
                explores,
                patchedExploreNamess.map((exploreName) => ({
                    op: 'replace',
                    path: `/${exploreName}`,
                    value: changedExplores[exploreName],
                })),
            );
            return patchResult.newDocument;
        }

        return explores;
    }
}
