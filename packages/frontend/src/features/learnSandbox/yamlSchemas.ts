/**
 * The workspace files the dbt YAML schema applies to: model files, at any
 * depth. monaco-yaml reads each pattern as a glob anchored at the end of the
 * file's URI, where `*` stops at a folder, so `**` is what reaches nested
 * model folders. Files a download writes under `lightdash/` are content as
 * code, not dbt, and stay out.
 */
export const DBT_SCHEMA_FILE_MATCH = ['/models/**/*.yml', '/models/**/*.yaml'];
