import { LightdashConfig, SmtpConfig } from '../../config/parseConfig';
import { SMTP_CONNECTION_CONFIG } from './EmailClient';

export const passwordResetLinkMock = {
    code: 'code',
    expiresAt: new Date(),
    email: 'demo@lightdash.com',
    url: 'htt://localhost:3000/reset-password/code',
    isExpired: false,
};

export const lightdashConfigWithNoSMTP: Pick<
    LightdashConfig,
    'smtp' | 'siteUrl' | 'query'
> = {
    smtp: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxPageSize: 500,
        maxLimit: 100,
        defaultLimit: 500,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

const smtpBase: SmtpConfig = {
    host: 'host',
    secure: true,
    port: 587,
    useAuth: true,
    auth: {
        user: 'user',
        pass: 'pass',
        accessToken: undefined,
    },
    sender: {
        name: 'name',
        email: 'email',
    },
    allowInvalidCertificate: false,
};

export const lightdashConfigWithBasicSMTP: Pick<
    LightdashConfig,
    'smtp' | 'siteUrl' | 'query'
> = {
    smtp: {
        ...smtpBase,
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxPageSize: 500,
        maxLimit: 100,
        defaultLimit: 500,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const lightdashConfigWithOauth2SMTP: Pick<
    LightdashConfig,
    'smtp' | 'siteUrl' | 'query'
> = {
    smtp: {
        ...smtpBase,
        auth: {
            user: 'user',
            pass: undefined,
            accessToken: 'accessToken',
        },
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxPageSize: 500,
        maxLimit: 100,
        defaultLimit: 500,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const lightdashConfigWithSecurePortSMTP: Pick<
    LightdashConfig,
    'smtp' | 'siteUrl' | 'query'
> = {
    smtp: {
        ...smtpBase,
        port: 465,
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxPageSize: 500,
        maxLimit: 100,
        defaultLimit: 500,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const expectedTransporterArgs = [
    {
        host: smtpBase.host,
        port: smtpBase.port,
        secure: false,
        auth: {
            user: smtpBase.auth.user,
            pass: smtpBase.auth.pass,
        },
        requireTLS: true,
        tls: undefined,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout: SMTP_CONNECTION_CONFIG.connectionTimeout,
        greetingTimeout: SMTP_CONNECTION_CONFIG.greetingTimeout,
        socketTimeout: SMTP_CONNECTION_CONFIG.socketTimeout,
    },
    {
        from: `"${smtpBase.sender.name}" <${smtpBase.sender.email}>`,
    },
];

export const expectedTransporterWithOauth2Args = [
    {
        ...expectedTransporterArgs[0],
        auth: {
            type: 'OAuth2',
            user: lightdashConfigWithOauth2SMTP.smtp?.auth.user,
            accessToken: lightdashConfigWithOauth2SMTP.smtp?.auth.accessToken,
        },
    },
    expectedTransporterArgs[1],
];

export const expectedTransporterWithSecurePortArgs = [
    {
        ...expectedTransporterArgs[0],
        port: 465,
        secure: true,
    },
    expectedTransporterArgs[1],
];
