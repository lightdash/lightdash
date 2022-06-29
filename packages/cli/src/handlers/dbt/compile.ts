import { ParseError } from '@lightdash/common';
import execa from 'execa';

export type DbtCompileOptions = {
    profilesDir: string;
    projectDir: string;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
    models: string[] | undefined;
    vars: string | undefined;
    threads: string | undefined;
    noVersionCheck: boolean | undefined;
    exclude: string | undefined;
    selector: string | undefined;
    state: string | undefined;
    fullRefresh: boolean | undefined;
};
export const dbtCompile = async (
    options: DbtCompileOptions,
    args: string[],
) => {
    try {
        await execa('dbt', ['compile', ...args]);
    } catch (e: any) {
        throw new ParseError(`Failed to run dbt compile:\n  ${e.message}`);
    }
};
