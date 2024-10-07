import { SES } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';
import EmailClient from './EmailClient';
import {
    expectedSesClientConfig,
    expectedSesClientConfigWithCredentials,
    expectedSesTransporterArgs,
    expectedSesTransporterArgsWithOptions,
    expectedSMTPTransporterArgs,
    expectedSMTPTransporterWithOauth2Args,
    expectedSMTPTransporterWithSecurePortArgs,
    lightdashConfigWithBasicSMTP,
    lightdashConfigWithNoSMTPOrSes,
    lightdashConfigWithOauth2SMTP,
    lightdashConfigWithSecurePortSMTP,
    lightdashConfigWithSes,
    lightdashConfigWithSesCredentials,
    lightdashConfigWithSesOptions,
    passwordResetLinkMock,
} from './EmailClient.mock';

jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        verify: jest.fn(),
        sendMail: jest.fn(() => ({ messageId: 'messageId' })),
        use: jest.fn(),
    })),
}));

jest.mock('@aws-sdk/client-ses', () => ({
    SES: jest.fn(),
}));

describe('EmailClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('Create transporter', () => {
        test('should not create a transporter when there is no smtp or ses configs', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithNoSMTPOrSes,
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
                ...expectedSMTPTransporterArgs,
            );
        });
        test('should create transported with secure connection when using port 465', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithSecurePortSMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedSMTPTransporterWithSecurePortArgs,
            );
        });
        test('should create transported with Oauth2', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithOauth2SMTP,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedSMTPTransporterWithOauth2Args,
            );
        });
        test('should create an SES transporter', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithSes,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedSesTransporterArgs,
            );
            expect(SES).toHaveBeenCalledWith(expectedSesClientConfig);
        });
        test('should create an SES transporter with credentials', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithSesCredentials,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedSesTransporterArgs,
            );
            expect(SES).toHaveBeenCalledWith(
                expectedSesClientConfigWithCredentials,
            );
        });
        test('should create an SES transporter with options', async () => {
            const client = new EmailClient({
                lightdashConfig: lightdashConfigWithSesOptions,
            });
            expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
            expect(nodemailer.createTransport).toHaveBeenCalledWith(
                ...expectedSesTransporterArgsWithOptions,
            );
            expect(SES).toHaveBeenCalledWith(expectedSesClientConfig);
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
    });
});
