export type CompilationSource = 'cli_deploy' | 'refresh_dbt' | 'create_project';

export const SOURCE_LABELS: Record<CompilationSource, string> = {
    cli_deploy: 'CLI Deploy',
    refresh_dbt: 'Refresh dbt',
    create_project: 'Create Project',
};

export const ALL_SOURCES: CompilationSource[] = [
    'cli_deploy',
    'refresh_dbt',
    'create_project',
];
