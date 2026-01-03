import { ExecaError, ExecaReturnValue } from 'execa';

export const cliMocks = {
    dbt1_3: {
        all:
            'Core:\n' +
            '  - installed: 1.3.0\n' +
            '  - latest:    1.9.1 - Update available!\n',
    } as Partial<ExecaReturnValue>,
    dbt1_4: {
        all:
            'Core:\n' +
            '  - installed: 1.4.9\n' +
            '  - latest:    1.9.1 - Update available!\n' +
            '\n' +
            '  Your version of dbt-core is out of date!\n' +
            '  You can find instructions for upgrading here:\n' +
            '  https://docs.getdbt.com/docs/installation\n' +
            '\n' +
            'Plugins:\n' +
            '  - trino:      1.4.2 - Update available!\n' +
            '  - databricks: 1.4.3 - Update available!\n' +
            '  - redshift:   1.4.1 - Update available!\n' +
            '  - spark:      1.4.3 - Update available!\n' +
            '  - bigquery:   1.4.5 - Update available!\n' +
            '  - snowflake:  1.4.5 - Update available!\n' +
            '  - postgres:   1.4.9 - Update available!\n' +
            '\n' +
            '  At least one plugin is out of date or incompatible with dbt-core.\n' +
            '  You can find instructions for upgrading here:\n' +
            '  https://docs.getdbt.com/docs/installation\n',
    } as Partial<ExecaReturnValue>,
    dbt1_9: {
        all:
            'Core:\n' +
            '  - installed: 1.9.1\n' +
            '  - latest:    1.9.1 - Up to date!\n' +
            '\n' +
            'Plugins:\n' +
            '  - databricks: 1.9.1 - Up to date!\n' +
            '  - redshift:   1.9.0 - Up to date!\n' +
            '  - spark:      1.9.0 - Up to date!\n' +
            '  - bigquery:   1.9.0 - Up to date!\n' +
            '  - snowflake:  1.9.0 - Up to date!\n' +
            '  - postgres:   1.9.0 - Up to date!\n',
    } as Partial<ExecaReturnValue>,
    dbt1_11: {
        all:
            'Core:\n' +
            '  - installed: 1.11.0\n' +
            '  - latest:    1.11.0 - Up to date!\n' +
            '\n' +
            'Plugins:\n' +
            '  - databricks: 1.11.0 - Up to date!\n' +
            '  - redshift:   1.11.0 - Up to date!\n' +
            '  - spark:      1.11.0 - Up to date!\n' +
            '  - bigquery:   1.11.0 - Up to date!\n' +
            '  - snowflake:  1.11.0 - Up to date!\n' +
            '  - postgres:   1.11.0 - Up to date!\n',
    } as Partial<ExecaReturnValue>,
    dbtCloud: {
        all: 'dbt Cloud CLI - 0.38.22 (1183c2abdb6003083b0fa91fcd89cd5feb25f9f7 2024-11-20T15:49:01Z)',
    } as Partial<ExecaReturnValue>,
    dbt20_1: {
        all:
            'Core:\n' +
            '  - installed: 20.1.0\n' +
            '  - latest:    20.2.0 - Update available!\n',
    } as Partial<ExecaReturnValue>,
    error: {
        shortMessage: 'error message',
        all: 'all error messages',
    } as Partial<ExecaError>,
};
