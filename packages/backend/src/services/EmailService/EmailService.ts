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
            this.transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: 'testAccount.user',
                    pass: 'testAccount.pass',
                },
            });
        }
    }

    public async isTransportValid(): Promise<boolean> {
        if (!this.transporter) {
            return false;
        }

        return this.transporter.verify().catch((e) => {
            Logger.debug(`Failed to verify email transporter: ${e}`);
            return false;
        });
    }

    public async sendEmail() {
        if (this.transporter && (await this.isTransportValid())) {
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
