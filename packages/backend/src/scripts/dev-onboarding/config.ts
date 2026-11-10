export const TEST_USER_UUID = 'b37a34ae-84f4-4f09-aef7-c100b4d40671';
export const TEST_ORG_UUID = '508067b3-e511-4cae-8b34-8d0e6108157a';
export const TEST_EMAIL = 'onboarding@lightdash.com';
export const TEST_PASSWORD = 'onboarding_password!';

export const assertLocalTarget = ({
    siteUrl,
    databaseHost,
    nodeEnv,
}: {
    siteUrl: string;
    databaseHost: string;
    nodeEnv: string | undefined;
}) => {
    const site = new URL(siteUrl);
    const isLocal = (host: string) =>
        ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
    if (
        nodeEnv === 'production' ||
        site.protocol !== 'http:' ||
        !isLocal(site.hostname) ||
        !isLocal(databaseHost)
    ) {
        throw new Error(
            'Onboarding fixtures require a local development app and database.',
        );
    }
};
