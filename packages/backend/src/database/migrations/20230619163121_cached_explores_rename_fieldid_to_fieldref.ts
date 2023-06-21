import { Explore } from '@lightdash/common';
import { Knex } from 'knex';

const CachedExploresTableName = 'cached_explores';
const exploresColumnName = 'explores';

export async function up(knex: Knex): Promise<void> {
    const rows = await knex(CachedExploresTableName).select();

    const updates = rows.map(async (row) => {
        const parsedExplores = row[exploresColumnName];

        parsedExplores.forEach((explore: Explore) => {
            if (explore && explore.tables) {
                Object.values(explore.tables).forEach((table) => {
                    if (table && table.metrics) {
                        Object.values(table.metrics).forEach((metric) => {
                            if (Array.isArray(metric.filters)) {
                                // eslint-disable-next-line no-param-reassign
                                metric.filters = metric.filters.map(
                                    (filter) => ({
                                        ...filter,
                                        target: {
                                            // @ts-expect-error migration from old fieldId to new fieldRef
                                            fieldRef: filter.target.fieldId,
                                        },
                                    }),
                                );
                            }
                        });
                    }
                });
            }
        });

        const updatedExplores = JSON.stringify(parsedExplores);

        await knex(CachedExploresTableName)
            .where({ project_uuid: row.project_uuid })
            .update({ [exploresColumnName]: updatedExplores });
    });

    await Promise.all(updates);
}

export async function down(knex: Knex): Promise<void> {
    const rows = await knex(CachedExploresTableName).select();

    const updates = rows.map(async (row) => {
        const parsedExplores = row[exploresColumnName];

        parsedExplores.forEach((explore: Explore) => {
            if (explore && explore.tables) {
                Object.values(explore.tables).forEach((table) => {
                    if (table && table.metrics) {
                        Object.values(table.metrics).forEach((metric) => {
                            if (Array.isArray(metric.filters)) {
                                // @ts-expect-error migration from new fieldRef to old fieldId
                                // eslint-disable-next-line no-param-reassign
                                metric.filters = metric.filters.map(
                                    (filter) => {
                                        if (
                                            filter.target &&
                                            filter.target.fieldRef
                                        ) {
                                            return {
                                                ...filter,
                                                target: {
                                                    fieldId:
                                                        filter.target.fieldRef,
                                                },
                                            };
                                        }
                                        return filter;
                                    },
                                );
                            }
                        });
                    }
                });
            }
        });

        const updatedExplores = JSON.stringify(parsedExplores);

        await knex(CachedExploresTableName)
            .where({ project_uuid: row.project_uuid })
            .update({ [exploresColumnName]: updatedExplores });
    });

    await Promise.all(updates);
}
