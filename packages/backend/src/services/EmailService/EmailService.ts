import * as nodemailer from 'nodemailer';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';

type EncryptionServiceDependencies = {
    lightdashConfig: LightdashConfig;
};

export class EncryptionService {
    lightdashConfig: LightdashConfig;

    transporter: nodemailer.Transporter | undefined;

    constructor({ lightdashConfig }: EncryptionServiceDependencies) {
        this.lightdashConfig = lightdashConfig;

        // todo
        if (this.lightdashConfig) {
            Logger.debug(`Create email transporter`);
            const transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: 'testAccount.user',
                    pass: 'testAccount.pass',
                },
            });

            transporter.verify((error: any) => {
                if (error) {
                    Logger.debug(
                        `Failed to verify email transporter: ${error}`,
                    );
                    throw new Error();
                } else {
                    Logger.debug(`Email transporter verified with success`);
                    this.transporter = transporter;
                }
            });
        }
    }

    public async sendEmail() {
        if (this.transporter) {
            // send mail with defined transport object
            const info = await this.transporter.sendMail({
                from: '"Fred Foo 👻" <foo@example.com>', // sender address
                to: 'bar@example.com, baz@example.com', // list of receivers
                subject: 'Hello ✔', // Subject line
                text: 'Hello world?', // plain text body
                html: '<b>Hello world?</b>', // html body
            });

            console.log('Message sent: %s', info.messageId);
            // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
        }
    }
}
