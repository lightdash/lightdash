import { type DbtProjectConfig } from '@lightdash/common';

export const omitDbtEnvironment = (
    dbtConnection: DbtProjectConfig,
): DbtProjectConfig => {
    if (!('environment' in dbtConnection)) {
        return dbtConnection;
    }

    const { environment: _environment, ...connectionWithoutEnvironment } =
        dbtConnection;
    return connectionWithoutEnvironment as DbtProjectConfig;
};
