import { ParseError } from '@lightdash/common';
import execa from 'execa';
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
    try {
        const subprocess = execa('dbt', command.parent.args, {
            stdio: 'inherit',
        });
        await subprocess;
    } catch (e) {
        throw new ParseError(`Failed to run dbt:\n  ${e.message}`);
    }
    await generateHandler(options);
};
