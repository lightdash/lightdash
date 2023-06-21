import { Explore } from '@lightdash/common';
import { Knex } from 'knex';

const CachedExploresTableName = 'cached_explores';
const exploresColumnName = 'explores';
// NOTE: Process 5 rows at a time to avoid memory issues
const CHUNK_SIZE = 5;

export async function up(knex: Knex): Promise<void> {
    let offset = 0;
    let rows;
    do {
        // eslint-disable-next-line no-await-in-loop
        rows = await knex(CachedExploresTableName)
            .select()
            .limit(CHUNK_SIZE)
            .offset(offset);

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
                                                fieldRef:
                                                    // @ts-expect-error migration from old fieldId to new fieldRef
                                                    filter.target.fieldId,
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
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(updates);

        offset += CHUNK_SIZE;
    } while (rows.length === CHUNK_SIZE);
}

export async function down(knex: Knex): Promise<void> {
    let offset = 0;
    let rows;
    do {
        // eslint-disable-next-line no-await-in-loop
        rows = await knex(CachedExploresTableName)
            .select()
            .limit(CHUNK_SIZE)
            .offset(offset);

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
                                            if (filter.target.fieldRef) {
                                                return {
                                                    ...filter,
                                                    target: {
                                                        fieldId:
                                                            filter.target
                                                                .fieldRef,
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
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(updates);

        offset += CHUNK_SIZE;
    } while (rows.length === CHUNK_SIZE);
}
