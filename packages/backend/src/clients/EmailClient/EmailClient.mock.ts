import { SendRawEmailCommand, SES } from '@aws-sdk/client-ses';
import type { Options as SESTransportOptions } from 'nodemailer/lib/ses-transport';
import {
    LightdashConfig,
    SesConfig,
    SmtpConfig,
} from '../../config/parseConfig';

export const passwordResetLinkMock = {
    code: 'code',
    expiresAt: new Date(),
    email: 'demo@lightdash.com',
    url: 'htt://localhost:3000/reset-password/code',
    isExpired: false,
};

type LightdashConfigEmailClientMock = Pick<
    LightdashConfig,
    'smtp' | 'ses' | 'siteUrl' | 'query'
>;

export const lightdashConfigWithNoSMTPOrSes: LightdashConfigEmailClientMock = {
    smtp: undefined,
    ses: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
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

export const lightdashConfigWithBasicSMTP: LightdashConfigEmailClientMock = {
    smtp: {
        ...smtpBase,
    },
    ses: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const lightdashConfigWithOauth2SMTP: LightdashConfigEmailClientMock = {
    smtp: {
        ...smtpBase,
        auth: {
            user: 'user',
            pass: undefined,
            accessToken: 'accessToken',
        },
    },
    ses: undefined,
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const lightdashConfigWithSecurePortSMTP: LightdashConfigEmailClientMock =
    {
        smtp: {
            ...smtpBase,
            port: 465,
        },
        ses: undefined,
        siteUrl: 'https://test.lightdash.cloud',
        query: {
            maxLimit: 100,
            csvCellsLimit: 100,
            timezone: undefined,
        },
    };

const SesBase: SesConfig = {
    region: 'us-east-1',
    endpoint: 'http://email.us-east-1.amazonaws.com',
    sender: {
        name: 'name',
        email: 'email',
    },
    options: undefined,
};

export const lightdashConfigWithSes: LightdashConfigEmailClientMock = {
    smtp: undefined,
    ses: {
        ...SesBase,
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const lightdashConfigWithSesCredentials: LightdashConfigEmailClientMock =
    {
        smtp: undefined,
        ses: {
            ...SesBase,
            accessKey: 'foo',
            secretKey: 'bar',
        },
        siteUrl: 'https://test.lightdash.cloud',
        query: {
            maxLimit: 100,
            csvCellsLimit: 100,
            timezone: undefined,
        },
    };

export const lightdashConfigWithSesOptions: LightdashConfigEmailClientMock = {
    smtp: undefined,
    ses: {
        ...SesBase,
        options: {
            configurationSetName: 'a-config-set',
        },
    },
    siteUrl: 'https://test.lightdash.cloud',
    query: {
        maxLimit: 100,
        csvCellsLimit: 100,
        timezone: undefined,
    },
};

export const expectedSMTPTransporterArgs = [
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

export const expectedSMTPTransporterWithOauth2Args = [
    {
        ...expectedSMTPTransporterArgs[0],
        auth: {
            type: 'OAuth2',
            user: lightdashConfigWithOauth2SMTP.smtp?.auth.user,
            accessToken: lightdashConfigWithOauth2SMTP.smtp?.auth.accessToken,
        },
    },
    expectedSMTPTransporterArgs[1],
];

export const expectedSMTPTransporterWithSecurePortArgs = [
    {
        ...expectedSMTPTransporterArgs[0],
        port: 465,
        secure: true,
    },
    expectedSMTPTransporterArgs[1],
];

export const expectedSesTransporterArgs = [
    {
        SES: {
            ses: expect.any(SES),
            aws: { SendRawEmailCommand },
        },
        ses: undefined,
    } as SESTransportOptions,
    {
        from: `"${SesBase.sender.name}" <${SesBase.sender.email}>`,
    },
];

export const expectedSesTransporterArgsWithOptions = [
    {
        SES: {
            ses: expect.any(SES),
            aws: { SendRawEmailCommand },
        },
        ses: {
            ConfigurationSetName: 'a-config-set',
        },
    } as SESTransportOptions,
    {
        from: `"${SesBase.sender.name}" <${SesBase.sender.email}>`,
    },
];

export const expectedSesClientConfig = {
    region: SesBase.region,
    apiVersion: '2006-03-02',
    endpoint: SesBase.endpoint,
};

export const expectedSesClientConfigWithCredentials = {
    ...expectedSesClientConfig,
    credentials: {
        accessKeyId: 'foo',
        secretAccessKey: 'bar',
    },
};
