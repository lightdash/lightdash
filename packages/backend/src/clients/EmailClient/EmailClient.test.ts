import * as nodemailer from 'nodemailer';
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

jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        verify: jest.fn(),
        sendMail: jest.fn(() => ({ messageId: 'messageId' })),
        use: jest.fn(),
    })),
}));

describe('EmailClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
            const mockSendMail = jest
                .fn()
                .mockRejectedValueOnce(new Error('read ECONNRESET'))
                .mockResolvedValueOnce({ messageId: 'test-message-id' });

            (nodemailer.createTransport as jest.Mock).mockReturnValue({
                verify: jest.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: jest.fn(),
                close: jest.fn(),
            });

            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithBasicSMTP,
            });

            await client.sendPasswordRecoveryEmail(passwordResetLinkMock);

            // Should have retried once after the initial failure
            expect(mockSendMail).toHaveBeenCalledTimes(2);
        });

        test('should fail after max retries with non-retryable error', async () => {
            const mockSendMail = jest
                .fn()
                .mockRejectedValue(new Error('Authentication failed'));

            (nodemailer.createTransport as jest.Mock).mockReturnValue({
                verify: jest.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: jest.fn(),
                close: jest.fn(),
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
            const mockSendMail = jest
                .fn()
                .mockRejectedValue(new Error('read ECONNRESET'));

            const mockClose = jest.fn();
            const mockCreateTransport = nodemailer.createTransport as jest.Mock;

            mockCreateTransport.mockReturnValue({
                verify: jest.fn((callback) => callback()),
                sendMail: mockSendMail,
                use: jest.fn(),
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
