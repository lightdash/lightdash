import { buildSnowflakeConnectCommand } from './snowflakeCliSso';

describe('buildSnowflakeConnectCommand', () => {
    it('builds the connect-snowflake command with url, code and account', () => {
        expect(
            buildSnowflakeConnectCommand({
                siteUrl: 'https://app.lightdash.cloud',
                code: 'abc123',
                account: 'xy12345.eu-west-1',
            }),
        ).toBe(
            'lightdash connect-snowflake --url https://app.lightdash.cloud --code abc123 --account xy12345.eu-west-1',
        );
    });

    it('builds the dev-mode command running the CLI from the repo', () => {
        expect(
            buildSnowflakeConnectCommand({
                siteUrl: 'http://localhost:3010',
                code: 'abc123',
                account: 'AAA99827',
                dev: true,
            }),
        ).toBe(
            'pnpm -F cli exec tsx src/index.ts connect-snowflake --url http://localhost:3010 --code abc123 --account AAA99827',
        );
    });
});
