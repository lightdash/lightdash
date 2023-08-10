/* eslint-disable @typescript-eslint/no-empty-function */
import { Knex } from 'knex';

// NOTE: keep this migration empty to avoid breaking the migration chain and instances see https://github.com/lightdash/lightdash/pull/5992 for details
export async function up(knex: Knex): Promise<void> {}

export async function down(knex: Knex): Promise<void> {}
