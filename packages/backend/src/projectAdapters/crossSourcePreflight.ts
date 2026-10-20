import { ParameterError } from '@lightdash/common';
import { type DbtProjectScan } from '../dbt/dbtProjectScan';

export type OtherConnectionProject = {
    projectName: string;
    sourceKey: string;
    connectionName: string;
};

export const crossConnectionReferenceReason = (
    source: string,
    name: string,
    declared: boolean,
    connectionName: string | undefined,
    projects: OtherConnectionProject[],
): string | null => {
    const provider = projects.find((project) => project.projectName === name);
    return provider
        ? `dbt source "${source}"${connectionName ? ` on warehouse connection "${connectionName}"` : ''} ${declared ? 'declares upstream' : 'references'} project "${name}", which dbt source "${provider.sourceKey}" provides on a different warehouse connection ("${provider.connectionName}"). Cross-source refs only work between dbt sources on the same warehouse connection.`
        : null;
};

export const duplicateProjectNameReason = (
    name: string,
    keys: string[],
): string =>
    `dbt sources ${keys.map((key) => `"${key}"`).join(' and ')} both use the dbt project name "${name}". Each connected dbt source needs a unique name: in dbt_project.yml. Change the name in one of the repositories.`;

export const validateCrossSourceProjectScans = (
    sources: { key: string; scan: DbtProjectScan | null }[],
    otherConnectionProjects: OtherConnectionProject[] = [],
    connectionName?: string,
): void => {
    const providers = new Map<string, string[]>();
    for (const { key, scan } of sources) {
        if (scan?.projectName)
            providers.set(scan.projectName, [
                ...(providers.get(scan.projectName) ?? []),
                key,
            ]);
    }
    const duplicates = [...providers].filter(([, keys]) => keys.length > 1);
    if (duplicates.length > 0)
        throw new ParameterError(
            duplicates
                .map(([name, keys]) => duplicateProjectNameReason(name, keys))
                .join(' '),
        );
    const missing: string[] = [];
    for (const { key, scan } of sources) {
        for (const name of scan?.declaredUpstreams ?? []) {
            if (!providers.has(name)) {
                const reason = crossConnectionReferenceReason(
                    key,
                    name,
                    true,
                    connectionName,
                    otherConnectionProjects,
                );
                if (reason) missing.push(reason);
                else if (sources.every((source) => source.scan !== null))
                    missing.push(
                        `dbt source "${key}" declares upstream project "${name}" in dependencies.yml, but no connected dbt source provides project "${name}".`,
                    );
            }
        }
    }
    if (missing.length > 0) throw new ParameterError(missing.join(' '));
};
