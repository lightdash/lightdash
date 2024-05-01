import {
    CreateProjectMember,
    InviteLink,
    PasswordResetLink,
    ProjectMemberRole,
    SessionUser,
    SmptError,
} from '@lightdash/common';
import { marked } from 'marked';
import * as nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import Mail from 'nodemailer/lib/mailer';
import { AuthenticationType } from 'nodemailer/lib/smtp-connection';
import path from 'path';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';

export type AttachmentUrl = {
    path: string;
    filename: string;
    localPath: string;
    truncated: boolean;
};
type EmailClientArguments = {
    lightdashConfig: Pick<
        LightdashConfig,
        | 'smtp'
        | 'siteUrl'
        | 'siteName'
        | 'siteGithubIcon'
        | 'siteGithubUrl'
        | 'siteLinkedinIcon'
        | 'siteLinkedinUrl'
        | 'siteTwitterIcon'
        | 'siteTwitterUrl'
        | 'siteHelpdeskUrl'
        | 'query'
    >;
};

export default class EmailClient {
    lightdashConfig: Pick<
        LightdashConfig,
        | 'smtp'
        | 'siteUrl'
        | 'siteName'
        | 'siteGithubIcon'
        | 'siteGithubUrl'
        | 'siteLinkedinIcon'
        | 'siteLinkedinUrl'
        | 'siteTwitterIcon'
        | 'siteTwitterUrl'
        | 'siteHelpdeskUrl'
        | 'query'
    >;

    transporter: nodemailer.Transporter | undefined;

    constructor({ lightdashConfig }: EmailClientArguments) {
        this.lightdashConfig = lightdashConfig;

        if (this.lightdashConfig.smtp) {
            Logger.debug(`Create email transporter`);

            const auth: AuthenticationType = this.lightdashConfig.smtp.auth
                .accessToken
                ? {
                      type: 'OAuth2',
                      user: this.lightdashConfig.smtp.auth.user,
                      accessToken: this.lightdashConfig.smtp.auth.accessToken,
                  }
                : {
                      user: this.lightdashConfig.smtp.auth.user,
                      pass: this.lightdashConfig.smtp.auth.pass,
                  };

            this.transporter = nodemailer.createTransport(
                {
                    host: this.lightdashConfig.smtp.host,
                    port: this.lightdashConfig.smtp.port,
                    secure: this.lightdashConfig.smtp.port === 465, // false for any port beside 465, other ports use STARTTLS instead.
                    auth,
                    requireTLS: this.lightdashConfig.smtp.secure,
                    tls: this.lightdashConfig.smtp.allowInvalidCertificate
                        ? { rejectUnauthorized: false }
                        : undefined,
                },
                {
                    from: `"${this.lightdashConfig.smtp.sender.name}" <${this.lightdashConfig.smtp.sender.email}>`,
                },
            );

            this.transporter.verify((error: any) => {
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

            this.transporter.use(
                'compile',
                hbs({
                    viewEngine: {
                        partialsDir: path.join(__dirname, './templates/'),
                        defaultLayout: false,
                        extname: '.html',
                    },
                    viewPath: path.join(__dirname, './templates/'),
                    extName: '.html',
                }),
            );
        }
    }

    private async sendEmail(
        options: Mail.Options & {
            template: string;
            context: Record<string, any>;
        },
    ) {
        if (this.transporter) {
            try {
                const info = await this.transporter.sendMail(options);
                Logger.debug(`Email sent: ${info.messageId}`);
            } catch (error) {
                throw new SmptError(`Failed to send email. ${error}`, {
                    error,
                });
            }
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
                siteName: this.lightdashConfig.siteName,
            },
            text: `Forgotten your password? No worries! Just click on the link below within the next 24 hours to create a new one: ${link.url}`,
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
            subject: `You've been invited to join ${this.lightdashConfig.siteName}!`,
            template: 'invitation',
            context: {
                orgName: userThatInvited.organizationName,
                inviteUrl: `${invite.inviteUrl}?from=email`,
                host: this.lightdashConfig.siteUrl,
                siteName: this.lightdashConfig.siteName,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
            },
            text: `Your teammates at ${userThatInvited.organizationName} are using ${this.lightdashConfig.siteName} to discover and share data insights. Click on the link below within the next 72 hours to join your team and start exploring your data! ${invite.inviteUrl}?from=email`,
        });
    }

    public async sendProjectAccessEmail(
        userThatInvited: Pick<SessionUser, 'firstName' | 'lastName'>,
        projectMember: CreateProjectMember,
        projectName: string,
        projectUrl: string,
    ) {
        let roleAction = 'view';
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
        return this.sendEmail({
            to: projectMember.email,
            subject: `${userThatInvited.firstName} ${userThatInvited.lastName} invited you to ${projectName}`,
            template: 'projectAccess',
            context: {
                inviterName: `${userThatInvited.firstName} ${userThatInvited.lastName}`,
                projectUrl,
                host: this.lightdashConfig.siteUrl,
                siteName: this.lightdashConfig.siteName,
                projectName,
                roleAction,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
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
        imageUrl: string,
        url: string,
        schedulerUrl: string,
        pdfFile?: string,
        expirationDays?: number,
        deliveryType: string = 'Scheduled delivery',
    ) {
        return this.sendEmail({
            to: recipient,
            subject,
            template: 'imageNotification',
            context: {
                title,
                hasMessage: !!message,
                message: message && marked(message),
                imageUrl,
                description,
                date,
                frequency,
                url,
                host: this.lightdashConfig.siteUrl,
                siteName: this.lightdashConfig.siteName,
                schedulerUrl,
                expirationDays,
                deliveryType,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
            },
            text: title,
            attachments: pdfFile
                ? [
                      {
                          filename: `${title}.pdf`,
                          path: pdfFile,
                          contentType: 'application/pdf',
                      },
                  ]
                : undefined,
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
        expirationDays?: number,
    ) {
        const csvUrl = attachment.path;
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
                siteName: this.lightdashConfig.siteName,
                schedulerUrl,
                expirationDays,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
            },
            text: title,
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
        expirationDays?: number,
    ) {
        const csvUrls = attachments.filter(
            (attachment) => !attachment.truncated,
        );

        const truncatedCsvUrls = attachments.filter(
            (attachment) => attachment.truncated,
        );

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
                siteName: this.lightdashConfig.siteName,
                schedulerUrl,
                expirationDays,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
            },
            text: title,
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
        Verify your email address by entering the following passcode in ${this.lightdashConfig.siteName}: ${passcode}
            `;
        return this.sendEmail({
            to: recipient,
            subject,
            template: 'oneTimePasscode',
            context: {
                passcode,
                title: subject,
                host: this.lightdashConfig.siteUrl,
                siteName: this.lightdashConfig.siteName,
                githubIcon: this.lightdashConfig.siteGithubIcon,
                githubUrl: this.lightdashConfig.siteGithubUrl,
                linkedinIcon: this.lightdashConfig.siteLinkedinIcon,
                linkedinUrl: this.lightdashConfig.siteLinkedinUrl,
                twitterIcon: this.lightdashConfig.siteTwitterIcon,
                twitterUrl: this.lightdashConfig.siteTwitterUrl,
                helpdeskUrl: this.lightdashConfig.siteHelpdeskUrl,
            },
            text,
        });
    }
}
