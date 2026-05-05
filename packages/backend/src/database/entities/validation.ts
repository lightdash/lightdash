import { ValidationErrorType, ValidationSourceType } from '@lightdash/common';
import { Knex } from 'knex';

export type DbValidationTable = {
    validation_uuid: string;
    /**
     * @deprecated Legacy auto-increment integer ID. The IDENTITY/sequence was
     * removed (see migration 20260501144729_validations_uuid_pk.ts) to prevent
     * INTEGER sequence exhaustion. Column is retained for back-compat with
     * downstream replication consumers and legacy URLs; new rows leave it NULL.
     * Use `validation_uuid` as the canonical identifier.
     */
    validation_id: number | null;
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
