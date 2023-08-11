import { ValidationErrorType, ValidationSourceType } from '@lightdash/common';
import { Knex } from 'knex';

export type DbValidationTable = {
    validation_id: number;
    created_at: Date;
    project_uuid: string;
    error: string;
    error_type: ValidationErrorType;
    chart_name: string | null;
    field_name: string | null;
    model_name: string | null;
    saved_chart_uuid: string | null;
    dashboard_uuid: string | null;
    job_id: string | null;
    source: ValidationSourceType | null;
};

export type ValidationTable = Knex.CompositeTableType<DbValidationTable>;

export const ValidationTableName = 'validations';
