import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { AuthenticationType } from 'nodemailer/lib/smtp-connection';
import { lightdashConfig } from '../config/lightdashConfig';
import { LightdashConfig } from '../config/parseConfig';
import { SmptError } from '../errors';
import Logger from '../logger';

class EmailClient {
    lightdashConfig: LightdashConfig;

    transporter: nodemailer.Transporter | undefined;

    constructor() {
        this.lightdashConfig = lightdashConfig;

        if (this.lightdashConfig.smtp.host) {
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

            this.transporter = nodemailer.createTransport({
                host: this.lightdashConfig.smtp.host,
                port: this.lightdashConfig.smtp.port,
                secure: this.lightdashConfig.smtp.secure,
                auth,
                tls: this.lightdashConfig.smtp.allowInvalidCertificate
                    ? { rejectUnauthorized: false }
                    : undefined,
            });

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
        }
    }

    private async sendEmail(options: Mail.Options) {
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

    public async sendPasswordRecoveryEmail() {
        return this.sendEmail({
            from: '"Lightdash" <test@digest.gethubble.io>',
            to: 'jose@lightdash.com',
            subject: 'Reset Lightdash password',
            text: 'Hello world?',
            html: '<b>Hello world?</b>',
        });
    }
}

export default new EmailClient();
