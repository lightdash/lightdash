#!/usr/bin/env node
import { LightdashError } from '@lightdash/common';
import { program } from 'commander';
import * as os from 'os';
import * as path from 'path';
import { dbtRunHandler } from './handlers/dbt/run';
import { generateHandler } from './handlers/generate';
import * as styles from './styles';

const { version: VERSION } = require('../package.json');

program
    .version(VERSION)
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
            '-- show detailed help for the "generate" command',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold('dbt run')} ${styles.secondary(
            '-- Runs dbt for all models and updates .yml for all models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} -s model1 model2+ tag:dev ${styles.secondary(
            '-- Runs dbt for models and generates .yml for affected models',
        )}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'dbt run',
        )} --help ${styles.secondary(
            '-- show detailed help for the "dbt run" command',
        )}
`,
    );

const dbtProgram = program.command('dbt').description('runs dbt commands');

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
            "-- runs mymodel and it's parents and generates .yml",
        )}
`,
    )
    .option('--project-dir <path>', 'The directory of the dbt project', '.')
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        path.join(os.homedir(), '.dbt'),
    )
    .option('--profile <name>')
    .option('-t, --target <target>')
    .option('-x, --fail-fast')
    .option('--threads <threads>')
    .option('--no-version-check')
    .option('-s, --select, <select> [selects...]')
    .option('--state <state>')
    .option('--defer')
    .option('--no-defer')
    .option('--full-refresh')
    .action(dbtRunHandler);

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
        '-m, --models <models...>',
        'specify models (accepts dbt selection syntax)',
    )
    .option('--project-dir <path>', 'The directory of the dbt project', '.')
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles',
        path.join(os.homedir(), '.dbt'),
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml)',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .option('-y, --assume-yes', 'assume yes to prompts', false)
    .action(generateHandler);

const errorHandler = (err: Error) => {
    console.error(styles.error(err.message));
    if (!(err instanceof LightdashError)) {
        console.error(err.stack);
        console.error('\nReport this issue with 1-click:\n');
        console.error(
            `  🐛 https://github.com/lightdash/lightdash/issues/new?assignees=&labels=🐛+bug&template=bug_report.md&title=${encodeURIComponent(
                err.message,
            )}`,
        );
    }
    process.exit(1);
};

const successHandler = () => {
    process.exit(0);
};

program.parseAsync().then(successHandler).catch(errorHandler);
