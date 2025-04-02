import { LightdashConfig } from '../../config/parseConfig';

type MicrosoftTeamsClientArguments = {
    lightdashConfig: LightdashConfig;
};

export type PostMicrosoftTeamsFile = {
    organizationUuid: string;
    channelId: string;
    file: Buffer;
    title: string;
    comment?: string;
    filename: string;
    fileType?: string;
};

export class MicrosoftTeamsClient {
    lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: MicrosoftTeamsClientArguments) {
        this.lightdashConfig = lightdashConfig;
    }

    static async postImageWithWebhook({
        webhookUrl,
        text,
        image,
    }: {
        webhookUrl: string;
        text: string;
        image: string;
    }): Promise<void> {
        // TODO Check lightdash config to see if this is enabled

        console.info('Sending image to Microsoft Teams');
        const payload = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            summary: 'Lightdash Report',
            themeColor: '0076D7',
            title: '📊 Lightdash Daily Report',
            text: text,
            sections: [
                {
                    activityTitle: '🖼️ Screenshot',
                    images: [
                        {
                            image: image,
                        },
                    ],
                },
            ],
        };

        await fetch(webhookUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }
}
