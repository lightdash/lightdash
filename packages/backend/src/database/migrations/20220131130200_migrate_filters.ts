import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

const SavedChartVersionsTableName = 'saved_queries_versions';
const FiltersColumnName = 'filters';

interface OldFilterGroup {
    tableName: string;
    fieldName: string;
    operator: 'and' | 'or';
    type: string;
    filters: {
        operator: string;
        values?: Array<string | number | boolean | Date>;
        value?: string | number | boolean | Date;
        id?: string;
    }[];
}

/* new filter types */

export type FilterRule<
    O = string,
    V = any,
    S extends object | undefined = undefined,
> = {
    id: string;
    target: {
        fieldId: string;
    };
    operator: O;
    settings?: S;
    values?: V[];
};

type OrFilterGroup = {
    id: string;
    or: Array<FilterGroup | FilterRule>;
};

type AndFilterGroup = {
    id: string;
    and: Array<FilterGroup | FilterRule>;
};

export type FilterGroup = OrFilterGroup | AndFilterGroup;

export type Filters = {
    // Note: dimensions need to be in a separate filter group from metrics & table calculations
    dimensions?: FilterGroup;
    metrics?: FilterGroup;
};

function migrateToNewFormat(data: OldFilterGroup[]): Filters {
    return {
        dimensions: {
            id: uuidv4(),
            and: (Array.isArray(data) ? data : []).reduce<FilterRule[]>(
                (sum, filterGroup) => [
                    ...sum,
                    ...filterGroup.filters.map<FilterRule>((filter) => ({
                        id: filter.id || uuidv4(),
                        target: {
                            fieldId: `${filterGroup.tableName}_${filterGroup.fieldName}`,
                        },
                        operator: filter.operator,
                        values:
                            filter.values || filter.value
                                ? filter.values || [filter.value]
                                : undefined,
                    })),
                ],
                [],
            ),
        },
    };
}

export async function up(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            SavedChartVersionsTableName,
            FiltersColumnName,
        )
    ) {
        const savedCharts = await knex(SavedChartVersionsTableName).select<
            {
                saved_queries_version_id: number;
                filters: OldFilterGroup[];
            }[]
        >(['saved_queries_version_id', 'filters']);

        const promises: Promise<any>[] = [];
        savedCharts.forEach(({ saved_queries_version_id, filters }) => {
            promises.push(
                knex(SavedChartVersionsTableName)
                    .update({
                        [FiltersColumnName]: JSON.stringify(
                            migrateToNewFormat(filters),
                        ),
                    })
                    .where(
                        'saved_queries_version_id',
                        saved_queries_version_id,
                    ),
            );
        });

        await Promise.all(promises);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            SavedChartVersionsTableName,
            FiltersColumnName,
        )
    ) {
        await knex(SavedChartVersionsTableName).update({
            [FiltersColumnName]: JSON.stringify([]),
        });
    }
}
