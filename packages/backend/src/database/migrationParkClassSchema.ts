export const MIGRATION_PARK_CLASS_SCHEMA_SQL = `
ALTER TABLE migration_lease
    ADD COLUMN IF NOT EXISTS parked_error_class text
        CONSTRAINT migration_lease_parked_error_class_check
        CHECK (parked_error_class IN ('transient', 'deterministic'));
`;
