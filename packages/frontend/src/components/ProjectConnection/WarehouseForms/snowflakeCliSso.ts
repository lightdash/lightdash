export const SNOWFLAKE_CLI_INSTALL_COMMAND = 'npm install -g @lightdash/cli';

export const buildSnowflakeConnectCommand = ({
    siteUrl,
    code,
    account,
    dev = false,
}: {
    siteUrl: string;
    code: string;
    account: string;
    dev?: boolean;
}): string => {
    const cli = dev ? 'pnpm -F cli exec tsx src/index.ts' : 'lightdash';
    return `${cli} connect-snowflake --url ${siteUrl} --code ${code} --account ${account}`;
};
