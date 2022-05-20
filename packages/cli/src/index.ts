#!/usr/bin/env node
import { LightdashError } from '@lightdash/common';
import { program } from 'commander';
import * as os from 'os';
import * as path from 'path';
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
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} mymodel ${styles.secondary(
            '-- generates a mymodel.yml file for a single dbt model',
        )}
`,
    );

program
    .command('generate <model>')
    .description('Generates a new schema.yml file for model')
    .addHelpText(
        'after',
        `
${styles.bold('Examples:')}
  ${styles.title('⚡')}️lightdash ${styles.bold(
            'generate',
        )} mymodel ${styles.secondary(
            '-- generates a mymodel.yml file for a single dbt model',
        )}
`,
    )
    .option(
        '--project-dir <path>',
        'The directory of the dbt project (defaults: current directory)',
        '.',
    )
    .option(
        '--profiles-dir <path>',
        'The directory of the dbt profiles (defaults: ~/.dbt)',
        path.join(os.homedir(), '.dbt'),
    )
    .option(
        '--profile <name>',
        'The name of the profile to use (defaults to profile name in dbt_project.yml',
        undefined,
    )
    .option('--target <name>', 'target to use in profiles.yml file', undefined)
    .action(generateHandler);

const errorHandler = (err: Error) => {
    console.error(styles.error(err.message));
    if (!(err instanceof LightdashError)) {
        console.error(err.stack);
    }
    process.exit(1);
};

const successHandler = () => {
    process.exit(0);
};

program.parseAsync().then(successHandler).catch(errorHandler);
