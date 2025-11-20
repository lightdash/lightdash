#!/usr/bin/env node
import {
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    RenameType,
    ValidationTarget,
} from '@lightdash/common';
import { InvalidArgumentError, Option, program } from 'commander';
import { validate } from 'uuid';
import {
    CLI_VERSION,
    DEFAULT_DBT_PROFILES_DIR as defaultProfilesDir,
    DEFAULT_DBT_PROJECT_DIR as defaultProjectDir,
    NODE_VERSION,
    OPTIMIZED_NODE_VERSION,
} from './env';
import { compileHandler } from './handlers/compile';
import { refreshHandler } from './handlers/dbt/refresh';
import { dbtRunHandler } from './handlers/dbt/run';
import { deployHandler } from './handlers/deploy';
import { diagnosticsHandler } from './handlers/diagnostics';
import { downloadHandler, uploadHandler } from './handlers/download';
import { generateHandler } from './handlers/generate';
import { generateExposuresHandler } from './handlers/generateExposures';
import { lintHandler } from './handlers/lint';
import { login } from './handlers/login';
import {
    previewHandler,
    startPreviewHandler,
    stopPreviewHandler,
} from './handlers/preview';
import { renameHandler } from './handlers/renameHandler';
import { setProjectHandler } from './handlers/setProject';
import { validateHandler } from './handlers/validate';
import * as styles from './styles';
// Trigger CLI tests
// Suppress AWS SDK V2 warning, imported by snowflake SDK
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

function parseIntArgument(value: string) {
    const parsedValue = parseInt(value, 10);
    if (Number.isNaN(parsedValue)) {
        throw new InvalidArgumentError('Not a number.');
    }
    return parsedValue;
}

function parseStartOfWeekArgument(value: string) {
    const number = parseIntArgument(value);
    if (number < 0 || number > 6) {
        throw new InvalidArgumentError(
            'Not a valid number. Please use a number from 0 (Monday) to 6 (Sunday)',
        );
    }
    return number;
}

function parseUseDbtListOption(value: string | undefined): boolean {
    if (value === undefined) {
        return true;
    }
    return value.toLowerCase() !== 'false';
}

function parseDisableTimestampConversionOption(
    value: string | undefined,
): boolean {
    if (value === undefined) {
        return false;
    }
    return value.toLowerCase() === 'true';
}

function parseProjectArgument(value: string | undefined): string | undefined {
    if (value === undefined) {
        throw new InvalidArgumentError('No project argument provided.');
    }

    const isValidUuid = validate(value);

    if (!isValidUuid) {
        throw new InvalidArgumentError('Not a valid project UUID.');
    }

    return value;
}

program
    .version(CLI_VERSION)
    .name(styles.title('⚡️lightdash'))
    .description(
        'Developer tools for dbt and Lightdash.\nSee https://docs.lightdash.com for more help and examples',
    )
    .showHelpAfterError(
        styles.bold('Run ⚡️lightdash help [command] for more information'),
    )
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('generate')} ${styles.secondary(
            '-- generates .yml file for all dbt models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s mymodel ${styles.secondary(
            '-- generates .yml file for a single dbt model',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s model1 model2 ${styles.secondary(
            '-- generates .yml for multiple dbt models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s tag:sales ${styles.secondary(
            '-- generates .yml for all dbt models tagged as sales',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s +mymodel ${styles.secondary(
            "-- generates .yml for mymodel and all it's parents",
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} --help ${styles.secondary(
            '-- shows detailed help for the "generate" command',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold('dbt run')} ${styles.secondary(
            '-- runs dbt for all models and updates .yml for all models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s model1 model2+ tag:dev ${styles.secondary(
            '-- runs dbt for models and generates .yml for affected models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} --help ${styles.secondary(
            '-- shows detailed help for the "dbt run" command',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold('compile')} ${styles.secondary(
            '-- compiles Lightdash metrics and dimensions',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold('deploy')} ${styles.secondary(
            '-- compiles and deploys Lightdash metrics to active project',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login https://lightdash.domain.com',
        )} ${styles.secondary('-- logs in to a Lightdash instance')}
`,
    );

// LOGIN
program
    .command('login [url]')
    .description('Logs in to a Lightdash instance')
    .description(
        'Logs in to a Lightdash instance using OAuth2 (opens browser). Use --token to bypass OAuth.\n\nURL is optional - if not provided, uses the last URL you logged into. URL can be flexible: single words like "app" become "https://app.lightdash.cloud", protocol defaults to https, and paths are ignored.\n\n👀 See https://docs.lightdash.com/guides/cli/cli-authentication for more help and examples',
    )
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('login')} ${styles.secondary(
            '-- Uses previously saved URL (opens browser for OAuth)',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} app ${styles.secondary(
            '-- Short form for https://app.lightdash.cloud (opens browser for OAuth)',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} eu1 ${styles.secondary(
            '-- Short form for https://eu1.lightdash.cloud (opens browser for OAuth)',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} app.lightdash.cloud ${styles.secondary(
            '-- Adds https:// automatically (opens browser for OAuth)',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} https://custom.lightdash.domain/projects/123 ${styles.secondary(
            '-- Strips path, uses https://custom.lightdash.domain (opens browser for OAuth)',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} http://localhost:3000 ${styles.secondary(
            '-- Preserves http protocol for local development',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'login',
        )} --token 12345 ${styles.secondary(
            '-- Logs in with API token using saved URL (bypasses OAuth)',
        )}
`,
    )
    .option('--token <token>', 'Login with an API access token', undefined)
    .option(
        '--project <project uuid>',
        'Select a project by UUID after login',
        parseProjectArgument,
        undefined,
    )
    .option('--verbose', undefined, false)
    .action(login);

// CONFIG
const configProgram = program
    .command('config')
    .description('Sets configuration');
configProgram
    .command('set-project')
    .description(
        'Choose project.\nSee https://docs.lightdash.com/guides/cli/cli-authentication#set-active-project for more help and examples',
    )
    .option('--verbose', undefined, false)
    .addOption(
        new Option(
            '--name <project_name>',
            'Set the project non-interactively by passing a project name.',
        ),
    )
    .addOption(
        new Option(
            '--uuid <project_uuid>',
            'Set the project non-interactively by passing a project uuid.',
        ).conflicts('name'),
    )
    .action(setProjectHandler);

const dbtProgram = program.command('dbt').description('Runs dbt commands');

dbtProgram
    .command('run')
    .description('Runs dbt and then generates .yml for affected models')
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('dbt run')} ${styles.secondary(
            '-- run all models and generate .yml files',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s mymodel ${styles.secondary(
            '-- runs a single model and generates .yml',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s model1 model2 ${styles.secondary(
            '-- runs multiple models and generates .yml',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s tag:sales ${styles.secondary(
            '-- runs all models tagged as "sales" and generates .yml',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s +mymodel ${styles.secondary(
            '-- runs mymodel and its parents and generates .yml',
        )}
`,
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option('--profile <name>')
    .option('-t, --target <target>')
    .option('-x, --fail-fast')
    .option('--threads <threads>')
    .option('--no-version-check')
    .option('-s, --select, <select> [selects...]')
    .option('--state <state>')
    .option(
        '--defer',
        'dbt property. Resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-defer',
        'dbt property. Do not resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option('--full-refresh')
    .option(
        '--exclude-meta',
        'exclude Lightdash metadata from the generated .yml',
        false,
    )
    .option('--verbose', undefined, false)
    .option('-y, --assume-yes', 'assume yes to prompts', false)
    .option('-no, --assume-no', 'assume no to prompts', false)
    .option(
        '--preserve-column-case',
        'preserve original casing of column names in generated schema files',
        false,
    )
    .action(dbtRunHandler);

program
    .command('compile')
    .description('Compiles Lightdash resources')
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option(
        '--target-path <path>',
        'The target directory for dbt (overrides DBT_TARGET_PATH and dbt_project.yml)',
        undefined,
    )
    .option('--vars <vars>')
    .option('--threads <number>')
    .option('--no-version-check')
    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--exclude <models...>')
    .option('--selector <selector_name>')
    .option('--state <state>')
    .option('--full-refresh')
    .option('--verbose', undefined, false)
    .option(
        '--skip-warehouse-catalog',
        'Skip fetch warehouse catalog and use types in yml',
        false,
    )
    .option(
        '--skip-dbt-compile',
        'Skip `dbt compile` and deploy from the existing ./target/manifest.json',
        false,
    )
    .option(
        '--defer',
        'dbt property. Resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-defer',
        'dbt property. Do not resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-warehouse-credentials',
        'Compile without any warehouse credentials. Skips dbt compile + warehouse catalog',
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .action(compileHandler);

program
    .command('preview')
    .description('Creates a new preview project - waits for a keypress to stop')
    .option(
        '--name <preview name>',
        'Custom name for the preview. If a name is not provided, a unique, randomly generated name will be created.',
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option(
        '--target-path <path>',
        'The target directory for dbt (overrides DBT_TARGET_PATH and dbt_project.yml)',
        undefined,
    )
    .option('--vars <vars>')
    .option(
        '--defer',
        'dbt property. Resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-defer',
        'dbt property. Do not resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option('--threads <number>')
    .option('--no-version-check')
    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--exclude <models...>')
    .option('--selector <selector_name>')
    .option('--state <state>')
    .option('--full-refresh')
    .option('--verbose', undefined, false)
    .option(
        '--start-of-week <number>',
        'Specifies the first day of the week (used by week-related date functions). 0 (Monday) to 6 (Sunday)',
        parseStartOfWeekArgument,
    )
    .option(
        '--skip-dbt-compile',
        'Skip `dbt compile` and deploy from the existing ./target/manifest.json',
        false,
    )
    .option(
        '--skip-warehouse-catalog',
        'Skip fetch warehouse catalog and use types in yml',
        false,
    )
    .option(
        '--use-dbt-list [true|false]',
        'Use `dbt list` instead of `dbt compile` to generate dbt manifest.json',
        parseUseDbtListOption,
        true,
    )
    .option('--ignore-errors', 'Allows deploy with errors on compile', false)
    .option(
        '--table-configuration <prod|all>',
        `If set to 'prod' it will copy the table configuration from prod project`,
        'all',
    )
    .option(
        '--skip-copy-content',
        'Skip copying content from the source project',
        false,
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .option(
        '--organization-credentials <name>',
        'Use organization warehouse credentials with the specified name (Enterprise Edition feature)',
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .action(previewHandler);

program
    .command('start-preview')
    .description('Creates a new preview project')
    .option(
        '--name [preview name]',
        '[required] Name for the preview project. If a preview project with this name already exists, it will be updated, otherwise it will create a new preview project ',
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option(
        '--target-path <path>',
        'The target directory for dbt (overrides DBT_TARGET_PATH and dbt_project.yml)',
        undefined,
    )
    .option('--vars <vars>')
    .option(
        '--defer',
        'dbt property. Resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-defer',
        'dbt property. Do not resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option('--threads <number>')
    .option('--no-version-check')
    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--exclude <models...>')
    .option('--selector <selector_name>')
    .option('--state <state>')
    .option('--full-refresh')
    .option('--verbose', undefined, false)
    .option(
        '--start-of-week <number>',
        'Specifies the first day of the week (used by week-related date functions). 0 (Monday) to 6 (Sunday)',
        parseStartOfWeekArgument,
    )
    .option(
        '--skip-dbt-compile',
        'Skip `dbt compile` and deploy from the existing ./target/manifest.json',
        false,
    )
    .option(
        '--skip-warehouse-catalog',
        'Skip fetch warehouse catalog and use types in yml',
        false,
    )
    .option(
        '--use-dbt-list [true|false]',
        'Use `dbt list` instead of `dbt compile` to generate dbt manifest.json',
        parseUseDbtListOption,
        true,
    )
    .option('--ignore-errors', 'Allows deploy with errors on compile', false)
    .option(
        '--table-configuration <prod|all>',
        `If set to 'prod' it will copy the table configuration from prod project`,
        'all',
    )
    .option(
        '--skip-copy-content',
        'Skip copying content from the source project',
        false,
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .action(startPreviewHandler);

program
    .command('stop-preview')
    .description('Deletes preview project')
    .option(
        '--name [preview name]',
        '[required] Name for the preview project to be deleted',
    )
    .option('--verbose', undefined, false)
    .action(stopPreviewHandler);

program
    .command('download')
    .description('Downloads charts and dashboards as code')
    .option('--verbose', undefined, false)
    .option(
        '-c, --charts <charts...>',
        'specify chart slugs, uuids, or urls to download',
        [],
    )
    .option(
        '-d, --dashboards <dashboards...>',
        'specify dashboard slugs, uuids or urls to download',
        [],
    )
    .option(
        '-l, --language-map',
        'generate a language maps for the downloaded charts and dashboards',
        false,
    )
    .option(
        '-p, --path <path>',
        'specify a custom path to download charts and dashboards',
        undefined,
    )
    .option(
        '--nested',
        'organize downloads in nested folders by project and space (default: flat structure)',
        false,
    )
    .option(
        '--project <project uuid>',
        'specify a project UUID to download',
        parseProjectArgument,
        undefined,
    )
    .action(downloadHandler);

program
    .command('upload')
    .description('Uploads charts and dashboards as code')
    .option('--verbose', undefined, false)
    .option(
        '-c, --charts <charts...>',
        'specify chart slugs to force upload',
        [],
    )
    .option(
        '-d, --dashboards <dashboards...>',
        'specify dashboard slugs to force upload',
        [],
    )
    .option(
        '--force',
        'Force upload even if local files have not changed, use this when you want to upload files to a new project',
        false,
    )
    .option(
        '-p, --path <path>',
        'specify a custom path to upload charts and dashboards from',
        undefined,
    )
    .option(
        '--project <project uuid>',
        'specify a project UUID to upload',
        parseProjectArgument,
        undefined,
    )
    .option(
        '--skip-space-create',
        'Skip space creation if it does not exist',
        false,
    )
    .option('--public', 'Create new spaces as public instead of private', false)
    .option(
        '--include-charts',
        'Include charts updates when uploading dashboards',
        false,
    )
    .action(uploadHandler);

program
    .command('deploy')
    .description('Compiles and deploys a Lightdash project')
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option(
        '--target-path <path>',
        'The target directory for dbt (overrides DBT_TARGET_PATH and dbt_project.yml)',
        undefined,
    )
    .option('--vars <vars>')
    .option('--threads <number>')
    .option('--no-version-check')
    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--exclude <models...>')
    .option('--selector <selector_name>')
    .option('--state <state>')
    .option('--full-refresh')
    .option('--verbose', undefined, false)

    .option(
        '--create [project_name]',
        "Create a new project. If a project name is not provided, you'll be prompted for one on creation.",
        undefined,
    )
    .option('--ignore-errors', 'Allows deploy with errors on compile', false)
    .option(
        '--start-of-week <number>',
        'Specifies the first day of the week (used by week-related date functions). 0 (Monday) to 6 (Sunday)',
        parseStartOfWeekArgument,
    )
    .option(
        '--skip-dbt-compile',
        'Skip `dbt compile` and deploy from the existing ./target/manifest.json',
        false,
    )
    .option(
        '--skip-warehouse-catalog',
        'Skip fetch warehouse catalog and use types in yml',
        false,
    )
    .option(
        '--use-dbt-list [true|false]',
        'Use `dbt list` instead of `dbt compile` to generate dbt manifest.json',
        parseUseDbtListOption,
        true,
    )
    .option(
        '--no-warehouse-credentials',
        'Create project without warehouse credentials. Skips dbt compile + warehouse catalog',
    )
    .option(
        '--organization-credentials <name>',
        'Use organization warehouse credentials with the specified name (Enterprise Edition feature)',
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .action(deployHandler);

program
    .command('refresh')
    .description('Refreshes Lightdash project with remote repository')
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('refresh')}
`,
    )
    .option('--verbose', undefined, false)
    .action(refreshHandler);

program
    .command('validate')
    .description('Validates a project')
    .option(
        '--project <project uuid>',
        'Project UUID to validate, if not provided, the last preview will be used',
    )
    .option('--verbose', undefined, false)
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option('--vars <vars>')
    .option('--threads <number>')
    .option('--no-version-check')
    .option('--preview', 'Validate the last preview if available', false)
    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--exclude <models...>')
    .option('--selector <selector_name>')
    .option('--state <state>')
    .option('--full-refresh')
    .option('--verbose', undefined, false)
    .option(
        '--skip-dbt-compile',
        'Skip `dbt compile` and deploy from the existing ./target/manifest.json',
        false,
    )
    .option(
        '--skip-warehouse-catalog',
        'Skip fetch warehouse catalog and use types in yml',
        false,
    )
    .option(
        '--use-dbt-list [true|false]',
        'Use `dbt list` instead of `dbt compile` to generate dbt manifest.json',
        parseUseDbtListOption,
        true,
    )
    .option(
        '--disable-timestamp-conversion [true|false]',
        'Disable timestamp conversion to UTC for Snowflake warehouses. Only use this if your timestamp values are already in UTC.',
        parseDisableTimestampConversionOption,
        false,
    )
    .addOption(
        new Option('--only <elems...>', 'Specify project elements to validate')
            .choices(Object.values(ValidationTarget))
            .default(Object.values(ValidationTarget)),
    )
    .action(validateHandler);

program
    .command('generate')
    .description('Generates a new schema.yml file for model')
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('generate')} ${styles.secondary(
            '-- generates .yml file for all dbt models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s mymodel ${styles.secondary(
            '-- generates .yml file for a single dbt model',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s model1 model2 ${styles.secondary(
            '-- generates .yml for multiple dbt models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s tag:sales ${styles.secondary(
            '-- generates .yml for all dbt models tagged as sales',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} -s +mymodel ${styles.secondary(
            "-- generates .yml for mymodel and all it's parents",
        )}
`,
    )

    .option(
        '-s, --select <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-e, --exclude <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        defaultProfilesDir,
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option(
        '--target-path <path>',
        'The target directory for dbt (overrides DBT_TARGET_PATH and dbt_project.yml)',
        undefined,
    )
    .option('--vars <vars>')
    .option('-y, --assume-yes', 'assume yes to prompts', false)
    .option('--skip-existing', 'skip files that already exist', false)
    .option(
        '--exclude-meta',
        'exclude Lightdash metadata from the generated .yml',
        false,
    )
    .option(
        '--preserve-column-case',
        'preserve original casing of column names in generated schema files',
        false,
    )
    .option('--verbose', undefined, false)

    .action(generateHandler);

program
    .command('rename')
    .description('Rename models and fields on Lightdash content')
    .option('--verbose', undefined, false)
    .option(
        '-p, --project <project uuid>',
        'specify a project UUID to rename',
        parseProjectArgument,
        undefined,
    )
    .option(
        '-m, --model <model>',
        'When renaming a field, specify which model the field belongs to',
        undefined,
    )
    .option('-y, --assume-yes', 'assume yes to prompts', false)
    .requiredOption('-t, --type <type>', 'model or field', RenameType.MODEL)
    .requiredOption('--from <from>', 'Name to replace from', undefined)
    .requiredOption('--to <to>', 'Name to replace to', undefined)
    .option('--dry-run', 'Test the rename, no changes will be made', false)
    .option('--list', 'List all charts and dashboards that are renamed', false)

    .action(renameHandler);

program
    .command('generate-exposures')
    .description(
        '[Experimental command] Generates a .yml file for Lightdash exposures',
    )
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate-exposures',
        )} ${styles.secondary(
            '-- generates .yml file for all lightdash exposures',
        )}
`,
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project',
        defaultProjectDir,
    )
    .option('--verbose', undefined, false)
    .option(
        '--output <path>',
        'The path where the output exposures YAML file will be written',
        undefined,
    )
    .action(generateExposuresHandler);

program
    .command('diagnostics')
    .description('Shows diagnostic information about the CLI environment')
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'diagnostics',
        )} ${styles.secondary(
            '-- shows CLI version, Node.js version, and auth status',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'diagnostics',
        )} --dbt ${styles.secondary('-- includes dbt debug output')}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'diagnostics',
        )} --dbt --project-dir ./my-dbt-project ${styles.secondary(
            '-- runs dbt debug with custom project directory',
        )}
`,
    )
    .option('--dbt', 'Include dbt debug information', false)
    .option(
        '--project-dir <path>',
        'The directory of the dbt project (used with --dbt flag)',
        defaultProjectDir,
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles (used with --dbt flag)',
        defaultProfilesDir,
    )
    .option(
        '--defer',
        'dbt property. Resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .option(
        '--no-defer',
        'dbt property. Do not resolve unselected nodes by deferring to the manifest within the --state directory.',
        undefined,
    )
    .action(diagnosticsHandler);

program
    .command('lint')
    .description(
        'Validates Lightdash Code files (models, charts, dashboards) against JSON schemas',
    )
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold('lint')} ${styles.secondary(
            '-- validates all Lightdash Code files in current directory',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'lint',
        )} --path ./chart.yml ${styles.secondary(
            '-- validates a single chart file',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'lint',
        )} --path ./lightdash ${styles.secondary(
            '-- validates files in a specific directory',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'lint',
        )} --verbose ${styles.secondary('-- shows detailed validation output')}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'lint',
        )} --format json ${styles.secondary(
            '-- outputs results in SARIF JSON format',
        )}
`,
    )
    .option(
        '-p, --path <path>',
        'Path to a file or directory to lint (defaults to current directory)',
        undefined,
    )
    .option('--verbose', 'Show detailed output', false)
    .option(
        '-f, --format <format>',
        'Output format: cli (default) or json (SARIF format)',
        'cli',
    )
    .action(lintHandler);

const errorHandler = (err: Error) => {
    // Use error message with fallback for safety
    const errorMessage = getErrorMessage(err) || 'An unexpected error occurred';
    console.error(styles.error(errorMessage));

    if (err.name === 'ForbiddenError' || err instanceof ForbiddenError) {
        // For permission errors, show clear message with fallback
        const permissionMessage =
            err.message || "You don't have permission to perform this action";
        if (permissionMessage !== errorMessage) {
            console.error(styles.error(permissionMessage));
        }
        console.error(
            `\n💡 Contact your Lightdash administrator to request project creation access or if you believe this is incorrect.\n`,
        );
    } else if (err.name === 'AuthorizationError') {
        console.error(
            `Looks like you did not authenticate or the personal access token expired.\n\n👀 See https://docs.lightdash.com/guides/cli/cli-authentication for help and examples`,
        );
    } else if (!(err instanceof LightdashError)) {
        console.error(err);
        if (err.stack) {
            console.error(err.stack);
        }
        console.error('\nReport this issue with 1-click:\n');
        console.error(
            `  🐛 https://github.com/lightdash/lightdash/issues/new?assignees=&labels=🐛+bug&template=bug_report.md&title=${encodeURIComponent(
                err.message,
            )}`,
        );
    }
    if (err.message.includes('ENOENT: dbt')) {
        console.error(
            styles.error(
                `\n You must have dbt installed to use this command. See https://docs.getdbt.com/docs/core/installation for installation instructions`,
            ),
        );
    }
    if (NODE_VERSION.major !== OPTIMIZED_NODE_VERSION) {
        console.warn(
            styles.warning(
                `⚠️ You are using Node.js version ${process.version}. Lightdash CLI is optimized for v${OPTIMIZED_NODE_VERSION} so you might experience issues.`,
            ),
        );
    }
    process.exit(1);
};

const successHandler = () => {
    console.error(`Done 🕶`);
    process.exit(0);
};

program.parseAsync().then(successHandler).catch(errorHandler);
