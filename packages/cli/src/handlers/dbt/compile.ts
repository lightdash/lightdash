import { ParseError } from '@lightdash/common';
import execa from 'execa';
import ora from 'ora';

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
    console.error('');
    const spinner = ora(`  Compiling dbt project`).start();
    try {
        await execa('dbt', ['compile', ...args]);
        spinner.succeed(`  Compiled dbt project with success`);
    } catch (e: any) {
        spinner.fail();
        throw new ParseError(`Failed to run dbt compile:\n  ${e.message}`);
    }
};
