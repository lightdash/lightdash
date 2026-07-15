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
});
