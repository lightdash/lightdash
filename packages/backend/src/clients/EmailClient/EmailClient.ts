import {
    AdminNotificationPayload,
    AdminNotificationType,
    CreateProjectMember,
    getErrorMessage,
    InviteLink,
    MissingConfigError,
    PasswordResetLink,
    ProjectMemberRole,
    sanitizeHtml,
    SchedulerFormat,
    SessionUser,
    SmptError,
    type PartialFailure,
} from '@lightdash/common';
import fs from 'fs';
import Handlebars from 'handlebars';
import { marked } from 'marked';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPConnection, {
    AuthenticationType,
} from 'nodemailer/lib/smtp-connection';
import SMTPPool from 'nodemailer/lib/smtp-pool';
import path from 'path';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

function isNodemailerSmtpError(
    error: unknown,
): error is SMTPConnection.SMTPError {
    return error instanceof Error;
}

// Timeout configurations based on Nodemailer defaults, adjusted for scheduler compatibility
export const SMTP_CONNECTION_CONFIG = {
    connectionTimeout: 120000, // 2 minutes - max time to establish connection (default)
    greetingTimeout: 30000, // 30 seconds - max time to wait for greeting (default)
    socketTimeout: 180000, // 3 minutes - reduced from default to allow retry logic within default scheduler timeout (10min)
} as const;

export type AttachmentUrl = {
    path: string;
    filename: string;
    localPath: string;
    truncated: boolean;
};
type EmailClientArguments = {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl' | 'query'>;
};

type EmailTemplate = {
    template: string;
    context: Record<string, unknown>;
    attachments?: (Mail.Attachment | AttachmentUrl)[] | undefined;
};

export default class EmailClient {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl' | 'query'>;

    transporter: nodemailer.Transporter | undefined;

    private initPromise: Promise<void> | undefined;

    constructor({ lightdashConfig }: EmailClientArguments) {
        this.lightdashConfig = lightdashConfig;

        if (this.lightdashConfig.smtp) {
            this.initPromise = this.createTransporter();
        }
    }

    private static createFileAttachment(
        attachment: AttachmentUrl,
        format?: SchedulerFormat,
    ): Mail.Attachment {
        const contentType =
            format === SchedulerFormat.XLSX
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';

        const fileExtension =
            format === SchedulerFormat.XLSX
                ? SchedulerFormat.XLSX
                : SchedulerFormat.CSV;

        const fileName = attachment.filename.endsWith(fileExtension)
            ? attachment.filename
            : `${attachment.filename}.${fileExtension}`;

        return {
            filename: fileName,
            path: attachment.localPath || attachment.path,
            contentType,
        };
    }

    private async createTransporter(): Promise<void> {
        if (!this.lightdashConfig.smtp) return;

        Logger.debug(`Create email transporter`);

        let auth: AuthenticationType | undefined;

        if (this.lightdashConfig.smtp.useAuth) {
            if (this.lightdashConfig.smtp.auth.accessToken) {
                auth = {
                    type: 'OAuth2',
                    user: this.lightdashConfig.smtp.auth.user,
                    accessToken: this.lightdashConfig.smtp.auth.accessToken,
                };
            } else {
                auth = {
                    user: this.lightdashConfig.smtp.auth.user,
                    pass: this.lightdashConfig.smtp.auth.pass,
                };
            }
        }

        const options: SMTPPool.Options = {
            host: this.lightdashConfig.smtp.host,
            port: this.lightdashConfig.smtp.port,
            secure: this.lightdashConfig.smtp.port === 465, // false for any port beside 465, other ports use STARTTLS instead.
            ...(auth ? { auth } : {}),
            requireTLS: this.lightdashConfig.smtp.secure, // Forces STARTTTLS. Recommended when port is not 465.
            tls: this.lightdashConfig.smtp.allowInvalidCertificate
                ? { rejectUnauthorized: false }
                : undefined,
            pool: true, // Enable pooled connections
            maxConnections: 5, // Maximum number of connections (default is 5)
            maxMessages: 100, // Maximum number of messages per connection (default is 100)
            connectionTimeout: SMTP_CONNECTION_CONFIG.connectionTimeout,
            greetingTimeout: SMTP_CONNECTION_CONFIG.greetingTimeout,
            socketTimeout: SMTP_CONNECTION_CONFIG.socketTimeout,
        };

        this.transporter = nodemailer.createTransport(options, {
            from: `"${this.lightdashConfig.smtp.sender.name}" <${this.lightdashConfig.smtp.sender.email}>`,
        });
        this.transporter.verify((error) => {
            if (error) {
                throw new SmptError(
                    `Failed to verify email transporter. ${error}`,
                    {
                        error,
                    },
                );
            } else {
                Logger.debug(`Email transporter verified with success`);
            }
        });

        // Register partials from templates directory (files starting with _)
        const templatesDir = path.join(__dirname, './templates/');
        const partialFiles = fs
            .readdirSync(templatesDir)
            .filter((f) => f.startsWith('_') && f.endsWith('.html'));
        partialFiles.forEach((file) => {
            const partialName = file.replace('.html', '');
            const partialContent = fs.readFileSync(
                path.join(templatesDir, file),
                'utf-8',
            );
            Handlebars.registerPartial(partialName, partialContent);
        });

        // Custom nodemailer plugin for Handlebars template compilation
        this.transporter.use('compile', (mail, callback) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mailData = mail.data as any;
            if (mailData.template) {
                try {
                    const templatePath = path.join(
                        templatesDir,
                        `${mailData.template}.html`,
                    );
                    const source = fs.readFileSync(templatePath, 'utf-8');
                    const compiled = Handlebars.compile(source);
                    mailData.html = compiled(mailData.context || {});
                    callback();
                } catch (err) {
                    callback(err as Error);
                }
            } else {
                callback();
            }
        });
    }

    private static readonly STATIC_CID_IMAGES = [
        {
            filename: 'lightdash-logo.png',
            cid: 'lightdash-logo',
            contextKey: 'logoSrc',
            hostPath: '/lightdash-logo.png',
        },
        {
            filename: 'twitter.png',
            cid: 'twitter-logo',
            contextKey: 'twitterSrc',
            hostPath: '/twitter.png',
        },
        {
            filename: 'github.png',
            cid: 'github-logo',
            contextKey: 'githubSrc',
            hostPath: '/github.png',
        },
        {
            filename: 'linkedin.png',
            cid: 'linkedin-logo',
            contextKey: 'linkedinSrc',
            hostPath: '/linkedin.png',
        },
    ] as const;

    private async sendEmail(
        options: Mail.Options & EmailTemplate,
    ): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (this.transporter) {
            const useCid = this.lightdashConfig.smtp?.inlineImageCid === true;
            const host = this.lightdashConfig.siteUrl;

            const imageSources: Record<string, string> = {};
            for (const img of EmailClient.STATIC_CID_IMAGES) {
                imageSources[img.contextKey] = useCid
                    ? `cid:${img.cid}`
                    : `${host}${img.hostPath}`;
            }

            const emailOptions: Mail.Options & EmailTemplate = {
                ...options,
                context: { ...options.context, ...imageSources },
                attachments: [
                    ...(Array.isArray(options.attachments)
                        ? options.attachments
                        : []),
                    ...(useCid
                        ? EmailClient.STATIC_CID_IMAGES.map((img) => ({
                              filename: img.filename,
                              path: path.join(
                                  __dirname,
                                  `./templates/${img.filename}`,
                              ),
                              cid: img.cid,
                              contentDisposition: 'inline' as const,
                          }))
                        : []),
                ],
            };

            const maxRetries = 3;
            const baseDelay = 1000; // 1 second

            /* eslint-disable no-await-in-loop */
            for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
                try {
                    const info = await this.transporter.sendMail(emailOptions);
                    Logger.debug(`Email sent: ${info.messageId}`);
                    return; // Success, exit retry loop
                } catch (error) {
                    const isLastAttempt = attempt === maxRetries;
                    const isRetryableError =
                        isNodemailerSmtpError(error) &&
                        ((error.code &&
                            // Check if the error code is in the list of retryable error codes
                            RETRYABLE_ERROR_CODES.includes(error.code)) ||
                            // Check if the error message contains any of the retryable error codes
                            RETRYABLE_ERROR_CODES.some((code) =>
                                error.message.includes(code),
                            ) ||
                            // It can be either `Connection timeout` or `Timeout`
                            error.message.toLowerCase().includes('timeout'));

                    if (isLastAttempt || !isRetryableError) {
                        const isFileError =
                            error instanceof Error &&
                            error.message.includes('ENOENT');
                        const errorMessage = isFileError
                            ? 'There was an unexpected error when processing the attached file. Please contact your admin or support team.'
                            : getErrorMessage(error);
                        throw new SmptError(
                            `Failed to send email after ${attempt} attempts. ${errorMessage}`,
                            {
                                error, // log the original error
                            },
                        );
                    }

                    // On the last retry attempt, try recreating the transporter to handle stale connections
                    if (
                        attempt === maxRetries - 1 &&
                        isNodemailerSmtpError(error) &&
                        (error.code === 'ECONNRESET' ||
                            error.message.includes('ECONNRESET'))
                    ) {
                        Logger.warn(
                            'Recreating email transporter due to connection reset',
                        );
                        try {
                            await this.recreateTransporter();
                        } catch (recreateError) {
                            Logger.error(
                                `Failed to recreate transporter: ${recreateError}`,
                            );
                        }
                    }

                    // Calculate exponential backoff delay
                    const delay = baseDelay * 2 ** (attempt - 1);
                    Logger.warn(
                        `Email sending failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error}`,
                    );

                    await new Promise((resolve) => {
                        setTimeout(resolve, delay);
                    });
                }
            }
        }
    }

    public canSendEmail() {
        return !!this.transporter;
    }

    public async closeConnections(): Promise<void> {
        if (this.transporter) {
            try {
                this.transporter.close();
                Logger.debug('Email transporter connections closed');
            } catch (error) {
                Logger.warn(`Error closing email transporter: ${error}`);
            }
        }
    }

    public async recreateTransporter(): Promise<void> {
        await this.closeConnections();

        if (this.lightdashConfig.smtp) {
            Logger.debug('Recreating email transporter');
            this.initPromise = this.createTransporter();
            await this.initPromise;
        }
    }

    public async sendPasswordRecoveryEmail(link: PasswordResetLink) {
        return this.sendEmail({
            to: link.email,
            subject: 'Reset your password',
            template: 'recoverPassword',
            context: {
                url: link.url,
                host: this.lightdashConfig.siteUrl,
            },
            text: `Forgotten your password? No worries! Just click on the link below within the next 24 hours to create a new one: ${link.url}`,
        });
    }

    public async sendGoogleSheetsErrorNotificationEmail(
        recipient: string,
        schedulerName: string,
        schedulerUrl: string,
        errorMessage?: string,
        disabledSync: boolean = true,
    ) {
        // Sync failure but not disabled - will be retried
        if (!this.canSendEmail()) {
            Logger.error(
                'Cannot send Google Sheets sync failure email - email transporter not configured',
                {
                    recipient: recipient ? '***@***' : undefined,
                    schedulerName,
                },
            );

            throw new Error('Email transporter not configured');
        }

        // Sync has been disabled
        if (disabledSync) {
            return this.sendEmail({
                to: recipient,
                subject: `Google Sheets sync: "${schedulerName}" disabled due to error`,
                template: 'googleSheetsSyncDisabledNotification',
                context: {
                    host: this.lightdashConfig.siteUrl,
                    subject: 'Google Sheets Sync disabled',
                    description: `There's an error with your Google Sheets "${schedulerName}" sync. We've disabled it to prevent further errors.`,
                    schedulerUrl,
                },
                text: `Your Google Sheets ${schedulerName} sync has been disabled due to an error`,
            });
        }

        const message = `
            <p>Your Google Sheets sync <strong>"${schedulerName}"</strong> failed.</p>
            <br />
            <br />
            <br />
            ${
                errorMessage
                    ? `<p><strong>Error:</strong> ${sanitizeHtml(
                          errorMessage,
                      )}</p><br /><br />`
                    : ''
            }
            <p>Please check your <a href="${schedulerUrl}">Google Sheets sync settings</a> and verify your Google Sheets connection and permissions.</p>
        `;

        return this.sendEmail({
            to: recipient,
            subject: `Failed to sync Google Sheet - "${schedulerName}"`,
            template: 'genericNotification',
            context: {
                host: this.lightdashConfig.siteUrl,
                title: 'Google Sheet sync failure',
                message,
            },
            text: `Warning: Your Google Sheets sync "${schedulerName}" failed. ${
                errorMessage ? `Error: ${errorMessage}.` : ''
            } Please check your settings at ${schedulerUrl}`,
        });
    }

    public async sendScheduledDeliveryFailureEmail(
        recipient: string,
        schedulerName: string,
        schedulerUrl: string,
        errorMessage: string,
    ) {
        if (!this.canSendEmail()) {
            Logger.error(
                'Cannot send scheduled delivery failure email - email transporter not configured',
                {
                    recipient: recipient ? '***@***' : undefined,
                    schedulerName,
                },
            );
            throw new Error('Email transporter not configured');
        }

        const message = `
            <p>Your scheduled delivery <strong>"${schedulerName}"</strong> failed to send.</p>
            <br />
            <br />
            <br />
            <p><strong>Error:</strong> ${sanitizeHtml(errorMessage)}</p>
            <br />
            <br />
            <p>Please check your <a href="${schedulerUrl}">scheduled delivery settings</a> and try again.</p>
        `;

        return this.sendEmail({
            to: recipient,
            subject: `Failed to send scheduled delivery - "${schedulerName}"`,
            template: 'genericNotification',
            context: {
                host: this.lightdashConfig.siteUrl,
                title: 'Scheduled delivery failure',
                message,
            },
            text: `Warning: Your scheduled delivery "${schedulerName}" failed to send. Error: ${errorMessage}. Please check your settings at ${schedulerUrl}`,
        });
    }

    public async sendDeliveryFailureNotificationToRecipient(
        recipient: string,
        contentName: string | null,
        contactSentence: string | null,
    ) {
        if (!this.canSendEmail()) {
            throw new MissingConfigError('Email transporter not configured');
        }

        const baseSentenceHtml = contentName
            ? `The scheduled delivery for <strong>"${sanitizeHtml(
                  contentName,
              )}"</strong> failed to run, and the delivery owner has been notified.`
            : 'A scheduled delivery failed to run, and the delivery owner has been notified.';
        const baseSentenceText = contentName
            ? `The scheduled delivery for "${contentName}" failed to run, and the delivery owner has been notified.`
            : 'A scheduled delivery failed to run, and the delivery owner has been notified.';
        const appendedHtml = contactSentence
            ? ` ${sanitizeHtml(contactSentence)}`
            : '';
        const appendedText = contactSentence ? ` ${contactSentence}` : '';

        return this.sendEmail({
            to: recipient,
            subject: contentName
                ? `Scheduled delivery failed - "${contentName}"`
                : 'Scheduled delivery failed',
            template: 'genericNotification',
            context: {
                host: this.lightdashConfig.siteUrl,
                title: 'Scheduled delivery failure',
                message: `<p>${baseSentenceHtml}${appendedHtml}</p>`,
            },
            text: `${baseSentenceText}${appendedText}`,
        });
    }

    public async sendScheduledDeliveryTargetFailureEmail(
        recipient: string,
        schedulerName: string,
        schedulerUrl: string,
        deliveryType: 'slack' | 'email' | 'msteams' | 'googlechat',
        failedTargets: { target: string; error?: string }[],
        totalTargets: number,
    ) {
        if (!this.canSendEmail()) {
            Logger.error(
                'Cannot send delivery target failure email - email transporter not configured',
                {
                    recipient: recipient ? '***@***' : undefined,
                    schedulerName,
                },
            );
            throw new Error('Email transporter not configured');
        }

        const failedCount = failedTargets.length;
        const isPartial = failedCount < totalTargets;

        const deliveryTypeLabel =
            deliveryType === 'msteams' ? 'Microsoft Teams' : deliveryType;

        const targetList = failedTargets
            .map(
                (t) =>
                    `<li>${sanitizeHtml(t.target)}${
                        t.error ? ` error: ${sanitizeHtml(t.error)}` : ''
                    }</li>`,
            )
            .join('');

        const message = `
            <p>Your scheduled delivery <strong>"${schedulerName}"</strong> failed to deliver to ${failedCount} of ${totalTargets} ${deliveryTypeLabel} target${
                totalTargets > 1 ? 's' : ''
            }.</p>
            <br />
            <br />
            <p><strong>Failed targets:</strong></p> 
            <ul>${targetList}</ul>
            <br />
            <p>Please check your <a href="${schedulerUrl}" target="_blank">scheduled delivery settings</a>.</p>
        `;

        return this.sendEmail({
            to: recipient,
            subject: `${
                isPartial ? 'Partial delivery failure' : 'Delivery failed'
            } - "${schedulerName}"`,
            template: 'genericNotification',
            context: {
                host: this.lightdashConfig.siteUrl,
                title: isPartial
                    ? 'Partial delivery failure'
                    : 'Scheduled delivery failure',
                message,
            },
            text: `Warning: Your scheduled delivery "${schedulerName}" failed to deliver to ${failedCount} ${deliveryTypeLabel} target${
                failedCount > 1 ? 's' : ''
            }. Check settings at ${schedulerUrl}`,
        });
    }

    public async sendInviteEmail(
        userThatInvited: Pick<
            SessionUser,
            'firstName' | 'lastName' | 'organizationName'
        >,
        invite: InviteLink,
    ) {
        return this.sendEmail({
            to: invite.email,
            subject: `You've been invited to join Lightdash`,
            template: 'invitation',
            context: {
                orgName: userThatInvited.organizationName,
                inviteUrl: `${invite.inviteUrl}?from=email`,
                host: this.lightdashConfig.siteUrl,
            },
            text: `Your teammates at ${userThatInvited.organizationName} are using Lightdash to discover and share data insights. Click on the link below within the next 72 hours to join your team and start exploring your data! ${invite.inviteUrl}?from=email`,
        });
    }

    public async sendProjectAccessEmail(
        userThatInvited: Pick<SessionUser, 'firstName' | 'lastName'>,
        projectMember:
            | CreateProjectMember
            | { email: string; customRoleName: string },
        projectName: string,
        projectUrl: string,
    ) {
        let roleAction = '';
        if ('customRoleName' in projectMember) {
            roleAction = ``;
        } else {
            switch (projectMember.role) {
                case ProjectMemberRole.VIEWER:
                    roleAction = 'view';
                    break;
                case ProjectMemberRole.INTERACTIVE_VIEWER:
                    roleAction = 'explore';
                    break;
                case ProjectMemberRole.EDITOR:
                case ProjectMemberRole.DEVELOPER:
                    roleAction = 'edit';
                    break;
                case ProjectMemberRole.ADMIN:
                    roleAction = 'manage';
                    break;
                default:
                    const nope: never = projectMember.role;
            }
        }

        return this.sendEmail({
            to: projectMember.email,
            subject: `${userThatInvited.firstName} ${userThatInvited.lastName} invited you to ${projectName}`,
            template: 'projectAccess',
            context: {
                inviterName: `${userThatInvited.firstName} ${userThatInvited.lastName}`,
                projectUrl,
                host: this.lightdashConfig.siteUrl,
                projectName,
                roleAction,
            },
            text: `${userThatInvited.firstName} ${userThatInvited.lastName} has invited you to ${roleAction} this project: ${projectUrl}`,
        });
    }

    public async sendImageNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        imageUrl: string | undefined,
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        pdfFile?: string,
        expirationDays?: number,
        deliveryType: string = 'Scheduled delivery',
        imageBuffer?: Buffer,
    ) {
        const useCidImage =
            this.lightdashConfig.smtp?.inlineImageCid === true &&
            imageBuffer !== undefined;

        const attachments: Array<{
            filename: string;
            path?: string;
            content?: Buffer;
            contentType?: string;
            cid?: string;
            contentDisposition?: 'inline' | 'attachment';
        }> = [];

        if (useCidImage) {
            attachments.push({
                filename: 'chart-image.png',
                content: imageBuffer,
                cid: 'chart-image',
                contentDisposition: 'inline',
            });
        }

        if (pdfFile) {
            attachments.push({
                filename: `${title}.pdf`,
                path: pdfFile,
                contentType: 'application/pdf',
            });
        }

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'imageNotification',
            context: {
                title,
                hasMessage: !!message,
                message: message && marked(message),
                imageUrl: useCidImage ? 'cid:chart-image' : imageUrl,
                description,
                date,
                frequency,
                url,
                host: this.lightdashConfig.siteUrl,
                schedulerUrl,
                expirationDays,
                expirationDaysLabel:
                    expirationDays !== undefined
                        ? `${expirationDays} ${expirationDays === 1 ? 'day' : 'days'}`
                        : undefined,
                deliveryType,
                includeLinks,
            },
            text: title,
            attachments: attachments.length > 0 ? attachments : undefined,
        });
    }

    public async sendChartCsvNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        attachment: AttachmentUrl,
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        expirationDays?: number,
        asAttachment?: boolean,
        format?: SchedulerFormat,
    ) {
        const csvUrl = attachment.path;
        const attachments =
            asAttachment &&
            (attachment.localPath || attachment.path) &&
            attachment.path !== '#no-results'
                ? [EmailClient.createFileAttachment(attachment, format)]
                : undefined;

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'chartCsvNotification',
            context: {
                title,
                description,
                hasMessage: !!message,
                message: message && marked(message),
                date,
                frequency,
                url,
                csvUrl,
                truncated: attachment.truncated,
                noResults: attachment.path === '#no-results',
                maxCells: this.lightdashConfig.query.csvCellsLimit,
                host: this.lightdashConfig.siteUrl,
                schedulerUrl,
                expirationDays,
                expirationDaysLabel:
                    expirationDays !== undefined
                        ? `${expirationDays} ${expirationDays === 1 ? 'day' : 'days'}`
                        : undefined,
                includeLinks,
                hasAttachment: attachments && attachments.length > 0,
                attachmentCount: attachments?.length || 0,
            },
            text: title,
            attachments,
        });
    }

    public async sendDashboardCsvNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        attachments: AttachmentUrl[],
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        expirationDays?: number,
        asAttachment?: boolean,
        format?: SchedulerFormat,
        failures?: PartialFailure[],
    ) {
        const csvUrls = attachments.filter(
            (attachment) => !attachment.truncated,
        );

        const truncatedCsvUrls = attachments.filter(
            (attachment) => attachment.truncated,
        );

        const emailAttachments = asAttachment
            ? csvUrls
                  .filter(
                      (attachment) =>
                          (attachment.localPath || attachment.path) &&
                          attachment.path !== '#no-results',
                  )
                  .map((attachment) =>
                      EmailClient.createFileAttachment(attachment, format),
                  )
            : undefined;

        const allChartsFailed =
            csvUrls.length === 0 && failures && failures.length > 0;

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'dashboardCsvNotification',
            context: {
                title,
                description,
                hasMessage: !!message,
                message: message && marked(message),
                date,
                frequency,
                csvUrls,
                truncatedCsvUrls,
                truncated: truncatedCsvUrls.length > 0,
                maxCells: this.lightdashConfig.query.csvCellsLimit,
                url,
                host: this.lightdashConfig.siteUrl,
                schedulerUrl,
                expirationDays,
                expirationDaysLabel:
                    expirationDays !== undefined
                        ? `${expirationDays} ${expirationDays === 1 ? 'day' : 'days'}`
                        : undefined,
                includeLinks,
                hasAttachments: emailAttachments && emailAttachments.length > 0,
                attachmentCount: emailAttachments?.length || 0,
                failures,
                hasFailures: failures && failures.length > 0,
                allChartsFailed,
            },
            text: title,
            attachments: emailAttachments,
        });
    }

    async sendOneTimePasscodeEmail({
        recipient,
        passcode,
    }: {
        recipient: string;
        passcode: string;
    }): Promise<void> {
        const subject = 'Verify your email address';
        const text = `
        Verify your email address by entering the following passcode in Lightdash: ${passcode}
            `;
        return this.sendEmail({
            to: recipient,
            subject,
            template: 'oneTimePasscode',
            context: {
                passcode,
                title: subject,
                host: this.lightdashConfig.siteUrl,
            },
            text,
        });
    }

    public async sendSchedulerModifiedByOtherUserEmail({
        recipient,
        modifyingUserName,
        schedulerName,
        actionVerb,
        timestamp,
        resourceUrl,
    }: {
        recipient: string;
        modifyingUserName: string;
        schedulerName: string;
        actionVerb: 'updated' | 'deleted' | 'enabled' | 'disabled';
        timestamp: string;
        resourceUrl: string | undefined;
    }) {
        const safeModifier = sanitizeHtml(modifyingUserName);
        const safeName = sanitizeHtml(schedulerName);
        const message = `
            <p style="margin: 0 0 12px 0;">
                <strong>${safeModifier}</strong>
                ${actionVerb} your scheduled delivery
                <strong>&ldquo;${safeName}&rdquo;</strong>
                on ${sanitizeHtml(timestamp)}.
            </p>${
                resourceUrl
                    ? `\n            <p style="margin: 0;"><a href="${resourceUrl}" style="color: #7262FF; text-decoration: underline;">View the scheduled delivery</a></p>`
                    : ''
            }
        `;
        return this.sendEmail({
            to: recipient,
            subject: `Your scheduled delivery "${schedulerName}" was ${actionVerb}`,
            template: 'genericNotification',
            context: {
                title: `Your scheduled delivery was ${actionVerb}`,
                message,
                host: this.lightdashConfig.siteUrl,
            },
            text: `${modifyingUserName} ${actionVerb} your scheduled delivery "${schedulerName}" on ${timestamp}.${
                resourceUrl ? ` View it at ${resourceUrl}` : ''
            }`,
        });
    }

    public async sendGenericNotificationEmail(
        to: string[],
        subject: string,
        title: string,
        message: string,
        attachments?: Mail.Attachment[],
    ) {
        return this.sendEmail({
            to,
            subject,
            template: 'genericNotification',
            context: {
                title,
                message: marked(message),
                host: this.lightdashConfig.siteUrl,
            },
            text: `${title}\n\n${message}`,
            attachments,
        });
    }

    private static getAdminChangeNotificationText(
        payload: AdminNotificationPayload,
        isRemoval: boolean,
    ): string {
        const changedByName = payload.changedBy.isServiceAccount
            ? `Service Account: ${payload.changedBy.serviceAccountDescription}`
            : `${payload.changedBy.firstName} ${payload.changedBy.lastName}`;

        if (payload.targetUser) {
            const targetName = `${payload.targetUser.firstName} ${payload.targetUser.lastName}`;
            const action = isRemoval ? 'removed as admin' : 'added as admin';
            return `${targetName} was ${action} by ${changedByName}`;
        }

        if (payload.type === AdminNotificationType.CONNECTION_SETTINGS_CHANGE) {
            return `Connection settings updated by ${changedByName}`;
        }

        return `Settings changed by ${changedByName}`;
    }

    public async sendAdminChangeNotificationEmail(
        recipients: string[],
        payload: AdminNotificationPayload,
    ): Promise<void> {
        const subjectMap: Record<AdminNotificationType, string> = {
            [AdminNotificationType.ORG_ADMIN_ADDED]: 'Organization Admin Added',
            [AdminNotificationType.ORG_ADMIN_REMOVED]:
                'Organization Admin Removed',
            [AdminNotificationType.PROJECT_ADMIN_ADDED]: 'Project Admin Added',
            [AdminNotificationType.PROJECT_ADMIN_REMOVED]:
                'Project Admin Removed',
            [AdminNotificationType.CONNECTION_SETTINGS_CHANGE]:
                'Connection Settings Changed',
        };

        const templateMap: Record<AdminNotificationType, string> = {
            [AdminNotificationType.ORG_ADMIN_ADDED]: 'adminChangeNotification',
            [AdminNotificationType.ORG_ADMIN_REMOVED]:
                'adminChangeNotification',
            [AdminNotificationType.PROJECT_ADMIN_ADDED]:
                'adminChangeNotification',
            [AdminNotificationType.PROJECT_ADMIN_REMOVED]:
                'adminChangeNotification',
            [AdminNotificationType.CONNECTION_SETTINGS_CHANGE]:
                'connectionSettingsChange',
        };

        const projectContext = payload.projectName
            ? `${payload.projectName} - ${payload.organizationName}`
            : payload.organizationName;

        const isRemoval =
            payload.type === AdminNotificationType.ORG_ADMIN_REMOVED ||
            payload.type === AdminNotificationType.PROJECT_ADMIN_REMOVED;
        const isConnectionChange =
            payload.type === AdminNotificationType.CONNECTION_SETTINGS_CHANGE;

        return this.sendEmail({
            bcc: recipients,
            subject: `[Lightdash] ${
                subjectMap[payload.type]
            } - ${projectContext}`,
            template: templateMap[payload.type],
            context: {
                type: payload.type,
                organizationName: payload.organizationName,
                projectName: payload.projectName,
                changedBy: payload.changedBy,
                targetUser: payload.targetUser,
                timestamp: payload.timestamp.toISOString(),
                settingsUrl: payload.settingsUrl,
                host: this.lightdashConfig.siteUrl,
                isRemoval,
                isConnectionChange,
            },
            text: EmailClient.getAdminChangeNotificationText(
                payload,
                isRemoval,
            ),
        });
    }
}
