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
});
