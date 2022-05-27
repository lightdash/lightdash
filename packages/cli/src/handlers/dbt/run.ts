import { ParseError } from '@lightdash/common';
import execa from 'execa';
import { analytics } from '../../analytics/analytics';
import { generateHandler } from '../generate';

type DbtRunHandlerOptions = {
    profilesDir: string;
    projectDir: string;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
};
export const dbtRunHandler = async (
    options: DbtRunHandlerOptions,
    command: any,
) => {
    const numModelsSelected = options.select
        ? options.select.length
        : undefined;

    if (`${command.parent.args}`.startsWith('run ')) {
        analytics.track({
            event: 'cli_generate_started',
            properties: {
                trigger: 'dbt',
                numModelsSelected,
            },
        });
    } else {
        analytics.track({
            event: 'cli_dbt_command',
            properties: {
                command: `${command.parent.args}`,
            },
        });
    }
    try {
        const subprocess = execa('dbt', command.parent.args, {
            stdio: 'inherit',
        });
        await subprocess;

        if (`${command.parent.args}`.startsWith('run ')) {
            analytics.track({
                event: 'cli_generate_completed',
                properties: {
                    trigger: 'dbt',
                    numModelsSelected,
                },
            });
        }
    } catch (e: any) {
        if (`${command.parent.args}`.startsWith('run ')) {
            analytics.track({
                event: 'cli_generate_error',
                properties: {
                    trigger: 'dbt',
                    error: `${e.message}`,
                },
            });
        } else {
            analytics.track({
                event: 'cli_dbt_error',
                properties: {
                    command: `${command.parent.args}`,
                    error: `${e.message}`,
                },
            });
        }
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    await generateHandler(options);
};
