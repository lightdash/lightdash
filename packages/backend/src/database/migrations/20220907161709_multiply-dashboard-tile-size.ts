import { Knex } from 'knex';
import { DashboardTilesTableName } from '../entities/dashboards';

export async function up(knex: Knex): Promise<void> {
    await knex(DashboardTilesTableName).update({
        // @ts-ignore
        x_offset: knex.raw<number>('?? * 3', ['x_offset']),
        // @ts-ignore
        y_offset: knex.raw<number>('?? * 3', ['y_offset']),
        // @ts-ignore
        width: knex.raw<number>('?? * 3', ['width']),
        // @ts-ignore
        height: knex.raw<number>('?? * 3', ['height']),
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(DashboardTilesTableName).update({
        // @ts-ignore
        x_offset: knex.raw<number>('?? / 3', ['x_offset']),
        // @ts-ignore
        y_offset: knex.raw<number>('?? / 3', ['y_offset']),
        // @ts-ignore
        width: knex.raw<number>('?? / 3', ['width']),
        // @ts-ignore
        height: knex.raw<number>('?? / 3', ['height']),
    });
}
