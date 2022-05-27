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
    analytics.track({
        event: 'dbt_command',
        properties: {
            command: `${command.parent.args}`,
        },
    });
    try {
        const subprocess = execa('dbt', command.parent.args, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e: any) {
        analytics.track({
            event: 'dbt_error',
            properties: {
                command: `${command.parent.args}`,
                error: `${e.message}`,
            },
        });
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    await generateHandler(options);
};
