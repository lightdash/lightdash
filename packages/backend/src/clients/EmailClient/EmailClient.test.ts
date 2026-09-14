import {
    InviteLinkPurpose,
    PartialFailureType,
    SchedulerFormat,
} from '@lightdash/common';
import * as nodemailer from 'nodemailer';
import type SMTPConnection from 'nodemailer/lib/smtp-connection';
import EmailClient from './EmailClient';
import {
    expectedTransporterArgs,
    expectedTransporterWithOauth2Args,
    expectedTransporterWithSecurePortArgs,
    lightdashConfigWithBasicSMTP,
    lightdashConfigWithNoSMTP,
    lightdashConfigWithOauth2SMTP,
    lightdashConfigWithSecurePortSMTP,
    passwordResetLinkMock,
} from './EmailClient.mock';
import { buildPlainTextEmailBody } from './plainTextEmailBody';

vi.mock('nodemailer', () => ({
    createTransport: vi.fn(() => ({
        verify: vi.fn(),
        sendMail: vi.fn(() => ({ messageId: 'messageId' })),
        use: vi.fn(),
    })),
}));

vi.mock('fs', async () => ({
    ...(await vi.importActual<typeof import('fs')>('fs')),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ''),
}));

// Mock the SMTPError interface to allow for code property
class MockNodeMailerSmtpError
    extends Error
    implements SMTPConnection.SMTPError
{
    code: string | undefined;

    constructor(message: string, { code }: { code: string | undefined }) {
        super(message);
        this.code = code;
    }
}

describe('EmailClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('Create transporter', () => {
        test('should not create a transporter when there is no smtp configs', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithNoSMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(0);
            expect(client.transporter).toBeUndefined();
        });
        test('should create transporter when there is smtp configs', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedTransporterArgs,
            );
        });
        test('should create transported with secure connection when using port 465', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithSecurePortSMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedTransporterWithSecurePortArgs,
            );
        });
        test('should create transported with Oauth2', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithOauth2SMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedTransporterWithOauth2Args,
            );
        });
    });
    describe('Send emails', () => {
        test('should send email when there is smtp configs', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendPasswordRecoveryEmail(passwordResetLinkMock);
            expect(client.transporter?.sendMail).toHaveBeenCalledTimes(1);
        });

        test('should sanitize scheduler name in delivery failure emails', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendScheduledDeliveryFailureEmail(
                'recipient@example.com',
                'daily <img src=x onerror=alert(1)>',
                'https://example.com/scheduler',
                'something went wrong',
            );
            expect(
                vi.mocked(client.transporter!.sendMail),
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({
                        message: expect.not.stringContaining('<img'),
                    }),
                }),
            );
        });

        test('should sanitize markdown message in notification emails', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendChartCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                'Hello **world** <script>alert(1)</script>',
                'date',
                'frequency',
                {
                    path: 'https://example.com/file.csv',
                    filename: 'file.csv',
                    localPath: '',
                    truncated: false,
                },
                'https://example.com/chart',
                'https://example.com/scheduler',
                true,
            );
            const sentOptions = vi.mocked(client.transporter!.sendMail).mock
                .calls[0][0] as unknown as { context?: { message?: string } };
            const sentMessage = sentOptions.context?.message ?? '';
            expect(sentMessage).not.toContain('<script>');
            expect(sentMessage).toContain('<strong>world</strong>');
        });

        test('should render app delivery failures with a name the template can print', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendDashboardCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                undefined,
                'date',
                'frequency',
                [
                    {
                        path: 'https://example.com/file.csv',
                        filename: 'file.csv',
                        localPath: '',
                        truncated: false,
                    },
                ],
                'https://example.com/app',
                'https://example.com/scheduler',
                true,
                7,
                false,
                SchedulerFormat.CSV,
                [
                    {
                        type: PartialFailureType.APP_QUERY,
                        stage: 'download',
                        captureKey: 'v1:a',
                        label: 'Revenue by month',
                        error: 'storage unavailable',
                    },
                    {
                        type: PartialFailureType.APP_CAPTURE_OVERFLOW,
                        droppedCount: 3,
                    },
                ],
                [{ type: 'limit_reached', label: 'Sessions', rowCount: 5000 }],
            );

            const sentContext = (
                vi.mocked(client.transporter!.sendMail).mock
                    .calls[0][0] as unknown as {
                    context: {
                        failures: { chartName?: string; error: string }[];
                        failureCountPhrase: string;
                        notices: { label: string; rowCount: number }[];
                        hasNotices: boolean;
                    };
                }
            ).context;

            expect(sentContext.failures).toEqual([
                {
                    chartName: 'Revenue by month',
                    error: 'storage unavailable',
                },
                {
                    chartName: undefined,
                    error: '3 queries were dropped from capture (limit 50)',
                },
            ]);
            expect(sentContext.failureCountPhrase).toBe('1 query and 1 issue');
            // Notices ride their own context key so the template can render them
            // outside the failure block.
            expect(sentContext.hasNotices).toBe(true);
            expect(sentContext.notices).toEqual([
                { type: 'limit_reached', label: 'Sessions', rowCount: 5000 },
            ]);
        });

        test('should show the query name rather than the download filename when present', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendDashboardCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                undefined,
                'date',
                'frequency',
                [
                    {
                        path: 'https://example.com/revenue.csv',
                        filename: 'csv-Revenue by region-2026-08-04.csv',
                        chartName: 'Revenue by region',
                        localPath: '',
                        truncated: false,
                    },
                    {
                        path: 'https://example.com/plain.csv',
                        filename: 'plain.csv',
                        localPath: '',
                        truncated: false,
                    },
                ],
                'https://example.com/app',
                'https://example.com/scheduler',
                true,
            );

            const sentContext = (
                vi.mocked(client.transporter!.sendMail).mock
                    .calls[0][0] as unknown as {
                    context: {
                        csvUrls: { displayName: string; filename: string }[];
                    };
                }
            ).context;

            expect(sentContext.csvUrls.map((file) => file.displayName)).toEqual(
                ['Revenue by region', 'plain.csv'],
            );
            // The download name itself is untouched.
            expect(sentContext.csvUrls[0].filename).toBe(
                'csv-Revenue by region-2026-08-04.csv',
            );
        });

        test('should headline app deliveries with queries rather than dashboard charts', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            const attachments = [
                {
                    path: 'https://example.com/file.csv',
                    filename: 'file.csv',
                    localPath: '',
                    truncated: false,
                },
            ];
            const headlineOf = (callIndex: number) =>
                (
                    vi.mocked(client.transporter!.sendMail).mock.calls[
                        callIndex
                    ][0] as unknown as {
                        context: { resultsHeadline: string };
                    }
                ).context.resultsHeadline;

            await client.sendDashboardCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                undefined,
                'date',
                'frequency',
                attachments,
                'https://example.com/app',
                'https://example.com/scheduler',
                true,
                7,
                false,
                SchedulerFormat.CSV,
                undefined,
                undefined,
                undefined,
                true,
            );
            await client.sendDashboardCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                undefined,
                'date',
                'frequency',
                attachments,
                'https://example.com/dashboard',
                'https://example.com/scheduler',
                true,
            );

            expect(headlineOf(0)).toBe(
                'The latest results for the queries in this app are ready to download!',
            );
            expect(headlineOf(1)).toBe(
                'The latest results for the charts in this dashboard are ready to download!',
            );
        });

        test('should not flag notices when an app delivery had none', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendDashboardCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'title',
                'description',
                undefined,
                'date',
                'frequency',
                [
                    {
                        path: 'https://example.com/file.csv',
                        filename: 'file.csv',
                        localPath: '',
                        truncated: false,
                    },
                ],
                'https://example.com/app',
                'https://example.com/scheduler',
                true,
                7,
                false,
                SchedulerFormat.CSV,
            );

            const sentContext = (
                vi.mocked(client.transporter!.sendMail).mock
                    .calls[0][0] as unknown as {
                    context: { hasNotices?: boolean; notices?: unknown };
                }
            ).context;

            expect(sentContext.hasNotices).toBeUndefined();
            expect(sentContext.notices).toBeUndefined();
        });

        test('should use the setup invitation template for setup invites', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendInviteEmail(
                {
                    firstName: 'Taylor',
                    lastName: 'Smith',
                    email: 'taylor@example.com',
                    organizationName: 'Acme',
                },
                {
                    email: 'expert@example.com',
                    expiresAt: new Date('2026-07-21T00:00:00Z'),
                    inviteCode: 'invite-code',
                    inviteUrl: 'https://example.com/invite/invite-code',
                    organizationUuid: 'organization-uuid',
                    userUuid: 'user-uuid',
                    purpose: InviteLinkPurpose.Setup,
                },
            );

            expect(
                vi.mocked(client.transporter!.sendMail),
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'expert@example.com',
                    subject:
                        'Taylor Smith needs your help setting up Lightdash for Acme',
                    template: 'setupInvitation',
                    context: expect.objectContaining({
                        inviterName: 'Taylor Smith',
                        orgName: 'Acme',
                        inviteUrl:
                            'https://example.com/invite/invite-code?from=email',
                    }),
                }),
            );
        });

        test('should retry email sending on ECONNRESET error', async () => {
            const mockSendMail = vi
                .fn()
                .mockRejectedValueOnce(
                    new MockNodeMailerSmtpError('read ECONNRESET', {
                        code: 'ECONNRESET',
                    }),
                )
                .mockResolvedValueOnce({ messageId: 'test-message-id' });

            (
                nodemailer.createTransport as import('vitest').Mock
            ).mockReturnValue({
                verify: vi.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: vi.fn(),
                close: vi.fn(),
            });

            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendPasswordRecoveryEmail(passwordResetLinkMock);

            // Should have retried once after the initial failure
            expect(mockSendMail).toHaveBeenCalledTimes(2);
        });

        test('should fail after max retries with non-retryable error', async () => {
            const mockSendMail = vi
                .fn()
                .mockRejectedValue(new Error('Authentication failed'));

            (
                nodemailer.createTransport as import('vitest').Mock
            ).mockReturnValue({
                verify: vi.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: vi.fn(),
                close: vi.fn(),
            });

            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await expect(
                client.sendPasswordRecoveryEmail(passwordResetLinkMock),
            ).rejects.toThrow('Failed to send email after 1 attempt');

            // Should not retry non-retryable errors
            expect(mockSendMail).toHaveBeenCalledTimes(1);
        });

        test('should retry up to 3 times with retryable error and recreate transporter on last retry', async () => {
            const mockSendMail = vi.fn().mockRejectedValue(
                new MockNodeMailerSmtpError('read ECONNRESET', {
                    code: 'ECONNRESET',
                }),
            );

            const mockClose = vi.fn();
            const mockCreateTransport =
                nodemailer.createTransport as import('vitest').Mock;

            mockCreateTransport.mockReturnValue({
                verify: vi.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: vi.fn(),
                close: mockClose,
            });

            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await expect(
                client.sendPasswordRecoveryEmail(passwordResetLinkMock),
            ).rejects.toThrow('Failed to send email after 3 attempts');

            // Should have tried 3 times (initial + 2 retries)
            expect(mockSendMail).toHaveBeenCalledTimes(3);

            // Should have recreated transporter on the second attempt (maxRetries - 1)
            expect(mockClose).toHaveBeenCalledTimes(1);
            expect(mockCreateTransport).toHaveBeenCalledTimes(2); // Initial + recreation
        });
    });

    describe('Plain text delivery emails', () => {
        // The retry tests above swap in a failing transport, and clearAllMocks
        // leaves that implementation in place.
        beforeEach(() => {
            (
                nodemailer.createTransport as import('vitest').Mock
            ).mockReturnValue({
                verify: vi.fn(),
                sendMail: vi.fn(() => ({ messageId: 'messageId' })),
                use: vi.fn(),
            });
        });

        const csvAttachment = {
            path: 'https://example.com/file.csv',
            filename: 'file.csv',
            localPath: '/tmp/file.csv',
            truncated: false,
        };

        const sentMailOptions = (client: EmailClient) =>
            vi.mocked(client.transporter!.sendMail).mock
                .calls[0][0] as unknown as {
                text?: string;
                html?: string;
                template?: string;
                context?: Record<string, unknown>;
                attachments?: Array<{ filename: string }>;
            };

        describe('buildPlainTextEmailBody', () => {
            test('should generate a sentence naming the cadence', () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: undefined,
                        cadence: 'weekly',
                        downloads: [],
                        noResults: false,
                    }),
                ).toEqual(
                    'Hello, here is your weekly report for Partner Performance.\n',
                );
            });

            test('should drop the cadence when the cron has no word for it', () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: undefined,
                        cadence: undefined,
                        downloads: [],
                        noResults: false,
                    }),
                ).toEqual(
                    'Hello, here is your report for Partner Performance.\n',
                );
            });

            test("should use the delivery's own message instead of the generated sentence", () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: 'Please find your monthly report attached.',
                        cadence: 'weekly',
                        downloads: [],
                        noResults: false,
                    }),
                ).toEqual('Please find your monthly report attached.\n');
            });

            test('should fall back to the generated sentence for a blank message', () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: '   ',
                        cadence: 'daily',
                        downloads: [],
                        noResults: false,
                    }),
                ).toEqual(
                    'Hello, here is your daily report for Partner Performance.\n',
                );
            });

            test('should list files that could not be attached', () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: undefined,
                        cadence: 'weekly',
                        downloads: [
                            {
                                filename: 'orders',
                                url: 'https://example.com/orders.csv',
                            },
                        ],
                        noResults: false,
                    }),
                ).toEqual(
                    'Hello, here is your weekly report for Partner Performance.\n\norders: https://example.com/orders.csv\n',
                );
            });

            test('should say so when there are no results', () => {
                expect(
                    buildPlainTextEmailBody({
                        title: 'Partner Performance',
                        message: undefined,
                        cadence: 'weekly',
                        downloads: [],
                        noResults: true,
                    }),
                ).toEqual(
                    'Hello, here is your weekly report for Partner Performance.\n\nThis report returned no results.\n',
                );
            });
        });

        test('should send a chart csv delivery with no html and no template', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendChartCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'Partner Performance',
                'description',
                'Please find your report attached.',
                'date',
                'frequency',
                csvAttachment,
                'https://example.com/chart',
                'https://example.com/scheduler',
                true,
                3,
                true,
                SchedulerFormat.CSV,
                null,
                { cadence: 'weekly' },
            );

            const sent = sentMailOptions(client);
            expect(sent.template).toBeUndefined();
            expect(sent.context).toBeUndefined();
            expect(sent.html).toBeUndefined();
            expect(sent.text).toEqual('Please find your report attached.\n');
            expect(sent.attachments).toHaveLength(1);
        });

        test('should link a csv it could not attach rather than delivering nothing', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendChartCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'Partner Performance',
                'description',
                undefined,
                'date',
                'frequency',
                csvAttachment,
                'https://example.com/chart',
                'https://example.com/scheduler',
                true,
                3,
                false, // not attached
                SchedulerFormat.CSV,
                null,
                { cadence: 'weekly' },
            );

            const sent = sentMailOptions(client);
            expect(sent.attachments).toBeUndefined();
            expect(sent.text).toEqual(
                'Hello, here is your weekly report for Partner Performance.\n\nfile.csv: https://example.com/file.csv\n',
            );
        });

        test('should keep the pdf attachment on an image/pdf delivery', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendImageNotificationEmail(
                'recipient@example.com',
                'subject',
                'Partner Performance',
                'description',
                undefined,
                'date',
                'frequency',
                undefined,
                'https://example.com/dashboard',
                'https://example.com/scheduler',
                true,
                '/tmp/report.pdf',
                3,
                undefined,
                undefined,
                null,
                { cadence: 'monthly' },
            );

            const sent = sentMailOptions(client);
            expect(sent.template).toBeUndefined();
            expect(sent.text).toEqual(
                'Hello, here is your monthly report for Partner Performance.\n',
            );
            expect(sent.attachments).toEqual([
                {
                    filename: 'Partner Performance.pdf',
                    path: '/tmp/report.pdf',
                    contentType: 'application/pdf',
                },
            ]);
        });

        test('should still render the branded template when plain text is off', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });
            await client.sendChartCsvNotificationEmail(
                'recipient@example.com',
                'subject',
                'Partner Performance',
                'description',
                'Please find your report attached.',
                'date',
                'frequency',
                csvAttachment,
                'https://example.com/chart',
                'https://example.com/scheduler',
                true,
            );

            const sent = sentMailOptions(client);
            expect(sent.template).toEqual('chartCsvNotification');
            expect(sent.context).toBeDefined();
            expect(sent.text).toEqual('Partner Performance');
        });
    });
});
