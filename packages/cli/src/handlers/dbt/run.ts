import { ParseError } from '@lightdash/common';
import execa from 'execa';
import { LightdashAnalytics } from '../../analytics/analytics';
import { generateHandler } from '../generate';

type DbtRunHandlerOptions = {
    profilesDir: string;
    projectDir: string;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
    models: string[] | undefined;
    excludeMeta: boolean;
    verbose: boolean;
};
export const dbtRunHandler = async (
    options: DbtRunHandlerOptions,
    command: any,
) => {
    LightdashAnalytics.track({
        event: 'dbt_command.started',
        properties: {
            command: `${command.parent.args}`,
        },
    });

    const commands = command.parent.args.reduce((acc: any, arg: any) => {
        if (arg === '--verbose') return acc;
        return [...acc, arg];
    }, []);

    if (options.verbose) console.error(`> Running DBT command: ${commands}`);

    try {
        const subprocess = execa('dbt', commands, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e: any) {
        LightdashAnalytics.track({
            event: 'dbt_command.error',
            properties: {
                command: `${commands}`,
                error: `${e.message}`,
            },
        });
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    await generateHandler({
        ...options,
        assumeYes: true,
        excludeMeta: options.excludeMeta,
    });
};
