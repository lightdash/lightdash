import { ParseError } from '@lightdash/common';
import { Command } from 'commander';
import execa from 'execa';
import { LightdashAnalytics } from '../../analytics/analytics';
import GlobalState from '../../globalState';
import { generateHandler } from '../generate';
import { DbtCompileOptions } from './compile';

type DbtRunHandlerOptions = DbtCompileOptions & {
    excludeMeta: boolean;
    verbose: boolean;
    assumeYes: boolean;
};

export const dbtRunHandler = async (
    options: DbtRunHandlerOptions,
    command: Command,
) => {
    GlobalState.setVerbose(options.verbose);

    if (!command.parent) {
        throw new Error('Parent command not found');
    }

    await LightdashAnalytics.track({
        event: 'dbt_command.started',
        properties: {
            command: `${command.parent.args}`,
        },
    });

    const commands = command.parent.args.reduce<string[]>((acc, arg) => {
        if (arg === '--verbose' || arg === '--assume-yes') return acc;
        return [...acc, arg];
    }, []);

    GlobalState.debug(`> Running dbt command: ${commands}`);

    try {
        const subprocess = execa('dbt', commands, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '-';
        await LightdashAnalytics.track({
            event: 'dbt_command.error',
            properties: {
                command: `${commands}`,
                error: `${msg}`,
            },
        });
        throw new ParseError(`Failed to run dbt:\n  ${msg}`);
    }
    await generateHandler({
        ...options,
        assumeYes: options.assumeYes,
        excludeMeta: options.excludeMeta,
    });
};
