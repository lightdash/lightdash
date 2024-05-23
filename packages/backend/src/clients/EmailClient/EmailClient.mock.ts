import { LightdashConfig, SmtpConfig } from '../../config/parseConfig';

export const passwordResetLinkMock = {
    code: 'code',
    expiresAt: new Date(),
    email: 'demo@lightdash.com',
    url: 'htt://localhost:3000/reset-password/code',
    isExpired: false,
};

export const lightdashConfigWithNoSMTP: Pick<
    LightdashConfig,
    | 'smtp'
    | 'siteUrl'
    | 'query'
    | 'siteName'
    | 'siteGithubIcon'
    | 'siteGithubUrl'
    | 'siteLinkedinIcon'
    | 'siteLinkedinUrl'
    | 'siteTwitterIcon'
    | 'siteTwitterUrl'
    | 'siteHelpdeskUrl'
> = {
    smtp: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
    siteName: 'Lightdash',
    siteGithubIcon: '',
    siteGithubUrl: '',
    siteLinkedinIcon: '',
    siteLinkedinUrl: '',
    siteTwitterIcon: '',
    siteTwitterUrl: '',
    siteHelpdeskUrl: '',
};

const smtpBase: SmtpConfig = {
    host: 'host',
    secure: true,
    port: 587,
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
    | 'siteUrl'
    | 'smtp'
    | 'query'
    | 'siteName'
    | 'siteGithubIcon'
    | 'siteGithubUrl'
    | 'siteLinkedinIcon'
    | 'siteLinkedinUrl'
    | 'siteTwitterIcon'
    | 'siteTwitterUrl'
    | 'siteHelpdeskUrl'
> = {
    smtp: {
        ...smtpBase,
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
    siteName: 'Lightdash',
    siteGithubIcon: '',
    siteGithubUrl: '',
    siteLinkedinIcon: '',
    siteLinkedinUrl: '',
    siteTwitterIcon: '',
    siteTwitterUrl: '',
    siteHelpdeskUrl: '',
};

export const lightdashConfigWithOauth2SMTP: Pick<
    LightdashConfig,
    | 'siteUrl'
    | 'smtp'
    | 'query'
    | 'siteName'
    | 'siteGithubIcon'
    | 'siteGithubUrl'
    | 'siteLinkedinIcon'
    | 'siteLinkedinUrl'
    | 'siteTwitterIcon'
    | 'siteTwitterUrl'
    | 'siteHelpdeskUrl'
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
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
    siteName: 'Lightdash',
    siteGithubIcon: '',
    siteGithubUrl: '',
    siteLinkedinIcon: '',
    siteLinkedinUrl: '',
    siteTwitterIcon: '',
    siteTwitterUrl: '',
    siteHelpdeskUrl: '',
};

export const lightdashConfigWithSecurePortSMTP: Pick<
    LightdashConfig,
    | 'smtp'
    | 'siteUrl'
    | 'query'
    | 'siteName'
    | 'siteGithubIcon'
    | 'siteGithubUrl'
    | 'siteLinkedinIcon'
    | 'siteLinkedinUrl'
    | 'siteTwitterIcon'
    | 'siteTwitterUrl'
    | 'siteHelpdeskUrl'
> = {
    smtp: {
        ...smtpBase,
        port: 465,
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
    siteName: 'Lightdash',
    siteGithubIcon: '',
    siteGithubUrl: '',
    siteLinkedinIcon: '',
    siteLinkedinUrl: '',
    siteTwitterIcon: '',
    siteTwitterUrl: '',
    siteHelpdeskUrl: '',
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
