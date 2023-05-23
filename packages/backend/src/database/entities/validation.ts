import { Knex } from 'knex';

export type DbValidationTable = {
    validation_id: number;
    created_at: Date;
    saved_chart_uuid: string | null;
    dashboard_uuid: string | null;
    project_uuid: string;
    error: string;
};

export type DbValidationSummary = {
    validation_error: DbValidationTable['error'];
    validation_created_at: DbValidationTable['created_at'];
};

export type ValidationTable = Knex.CompositeTableType<DbValidationTable>;

export const ValidationTableName = 'validations';
