import { ParseError } from '@lightdash/common';
import execa from 'execa';
import { compileHandler } from '../compile';
import { LightdashAnalytics } from '../../analytics/analytics';
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
    LightdashAnalytics.track({
        event: 'dbt_command.started',
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
        LightdashAnalytics.track({
            event: 'dbt_command.error',
            properties: {
                command: `${command.parent.args}`,
                error: `${e.message}`,
            },
        });
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    console.log('');
    console.log('⚡️ Lightdash run...');
    console.log('');
    await generateHandler({ ...options, assumeYes: true });
};

type DbtCompileHandlerOptions = {
    profilesDir: string;
    projectDir: string;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
};
export const dbtCompileHandler = async (
    options: DbtCompileHandlerOptions,
    command: any,
) => {
    try {
        const subprocess = execa('dbt', command.parent.args, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e) {
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    console.log('');
    console.log('⚡️ Lightdash run...');
    console.log('');
    await compileHandler(options);
};
