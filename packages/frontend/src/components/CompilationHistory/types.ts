import { type TFunction } from 'i18next';

export type CompilationSource =
    | 'cli_deploy'
    | 'refresh_dbt'
    | 'create_project'
    | 'project_connection_form';

const SOURCE_LABEL_KEYS: Record<CompilationSource, string> = {
    cli_deploy: 'compilationHistory.sources.cliDeploy',
    refresh_dbt: 'compilationHistory.sources.refreshDbt',
    create_project: 'compilationHistory.sources.createProject',
    project_connection_form: 'compilationHistory.sources.projectConnectionForm',
};

export const isCompilationSource = (
    source: string,
): source is CompilationSource => source in SOURCE_LABEL_KEYS;

export const getSourceLabel = (t: TFunction, source: CompilationSource) =>
    t(SOURCE_LABEL_KEYS[source], { ns: 'projectConnection' });

export const ALL_SOURCES: CompilationSource[] = [
    'cli_deploy',
    'refresh_dbt',
    'create_project',
    'project_connection_form',
];
