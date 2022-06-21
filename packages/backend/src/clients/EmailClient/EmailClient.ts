import {
    CreateProjectMember,
    InviteLink,
    PasswordResetLink,
    SessionUser,
    SmptError,
} from '@lightdash/common';
import * as nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import Mail from 'nodemailer/lib/mailer';
import { AuthenticationType } from 'nodemailer/lib/smtp-connection';
import path from 'path';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';

type Dependencies = {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl'>;
};

export default class EmailClient {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl'>;

    transporter: nodemailer.Transporter | undefined;

    constructor({ lightdashConfig }: Dependencies) {
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
            subject: `You've been invited to join Lightdash`,
            template: 'invite',
            context: {
                orgName: userThatInvited.organizationName,
                inviteUrl: `${invite.inviteUrl}?from=email`,
                host: this.lightdashConfig.siteUrl,
            },
            text: `Your teammates at ${userThatInvited.organizationName} are using Lightdash to discover and share data insights. Click on the link below within the next 72 hours to join your team and start exploring your data! ${invite.inviteUrl}?from=email`,
        });
    }

    public async sendProjectAccessEmail(
        userThatInvited: Pick<
            SessionUser,
            'firstName' | 'lastName' | 'organizationName'
        >,
        projectMember: CreateProjectMember,
        projectName: string,
        projectUrl: string,
    ) {
        return this.sendEmail({
            to: projectMember.email,
            subject: `You have access to project ${projectName}`,
            template: 'projectAccess',
            context: {
                orgName: userThatInvited.organizationName,
                projectUrl,
                host: this.lightdashConfig.siteUrl,
                projectName,
            },
            text: `Your teammates at ${userThatInvited.organizationName} are using Lightdash to discover and share data insights. Click on the link below within the next 72 hours to join your team and start exploring your data! ${projectUrl}`,
        });
    }
}
