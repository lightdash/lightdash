export type CompilationSource =
    | 'cli_deploy'
    | 'refresh_dbt'
    | 'create_project'
    | 'project_connection_form';

export const SOURCE_LABELS: Record<CompilationSource, string> = {
    cli_deploy: 'CLI Deploy',
    refresh_dbt: 'Refresh dbt',
    create_project: 'Create Project',
    project_connection_form: 'Project connection form',
};

export const ALL_SOURCES: CompilationSource[] = [
    'cli_deploy',
    'refresh_dbt',
    'create_project',
    'project_connection_form',
];
