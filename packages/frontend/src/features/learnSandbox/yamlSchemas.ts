/**
 * The workspace files the dbt YAML schema applies to: model files, at any
 * depth. monaco-yaml reads each pattern as a glob anchored at the end of the
 * file's URI, where `*` stops at a folder, so `**` is what reaches nested
 * model folders. Files a download writes under `lightdash/` are content as
 * code, not dbt, and stay out.
 */
export const DBT_SCHEMA_FILE_MATCH = ['/models/**/*.yml', '/models/**/*.yaml'];

/**
 * What `lightdash download` writes: one file per chart and per dashboard,
 * never deeper. Each kind has its own content-as-code schema, so the editor
 * can check a learner's edit and explain a key on hover. A space file
 * (`lightdash/spaces/*.space.yml`) has no schema and gets YAML checks only.
 */
export const CHART_SCHEMA_FILE_MATCH = ['/lightdash/charts/*.yml'];
export const DASHBOARD_SCHEMA_FILE_MATCH = ['/lightdash/dashboards/*.yml'];
