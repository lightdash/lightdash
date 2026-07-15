export const SNOWFLAKE_CLI_INSTALL_COMMAND = 'npm install -g @lightdash/cli';

export const buildSnowflakeConnectCommand = ({
    siteUrl,
    code,
    account,
}: {
    siteUrl: string;
    code: string;
    account: string;
}): string =>
    `lightdash connect-snowflake --url ${siteUrl} --code ${code} --account ${account}`;
