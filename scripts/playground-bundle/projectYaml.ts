export const replaceTableMaterializations = (projectYaml: string): string => {
    const tableMaterialization = '    materialized: table';
    if (!projectYaml.includes(tableMaterialization)) {
        throw new Error(
            'Playground dbt project must define a table materialization',
        );
    }

    return projectYaml.replaceAll(
        tableMaterialization,
        '    materialized: view',
    );
};
