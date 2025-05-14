import { getErrorMessage, ParseError } from '@lightdash/common';
import { Command, InvalidArgumentError } from 'commander';
import execa from 'execa';
import { LightdashAnalytics } from '../../analytics/analytics';
import GlobalState from '../../globalState';
import { generateHandler } from '../generate';
import { DbtCompileOptions } from './compile';

type DbtRunHandlerOptions = DbtCompileOptions & {
    profilesDir: string;
    projectDir: string;
    excludeMeta: boolean;
    verbose: boolean;
    assumeYes: boolean;
    assumeNo: boolean;
    preserveColumnCase: boolean;
};

export const dbtRunHandler = async (
    options: DbtRunHandlerOptions,
    command: Command,
) => {
    GlobalState.setVerbose(options.verbose);

    if (!command.parent) {
        throw new Error('Parent command not found');
    }

    if (options.assumeYes && options.assumeNo) {
        throw new InvalidArgumentError(
            'Cannot use both --assume-yes and --assume-no flags',
        );
    }

    await LightdashAnalytics.track({
        event: 'dbt_command.started',
        properties: {
            command: `${command.parent.args}`,
        },
    });

    const commands = command.parent.args.reduce<string[]>((acc, arg) => {
        if (
            arg === '--verbose' ||
            arg === '--assume-yes' ||
            arg === '--assume-no'
        )
            return acc;
        return [...acc, arg];
    }, []);

    GlobalState.debug(`> Running dbt command: ${commands}`);

    try {
        const subprocess = execa('dbt', commands, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        await LightdashAnalytics.track({
            event: 'dbt_command.error',
            properties: {
                command: `${commands}`,
                error: `${msg}`,
            },
        });
        throw new ParseError(`Failed to run dbt:\n  ${msg}`);
    }

    if (!options.assumeNo) {
        await generateHandler({
            ...options,
            excludeMeta: options.excludeMeta,
            preserveColumnCase: options.preserveColumnCase,
        });
    }
};
