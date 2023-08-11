import { lightdashConfig } from '../../config/lightdashConfig';
import { OpenIdIdentityModel } from '../../models/OpenIdIdentitiesModel';

const { google } = require('googleapis');
// TODO WIP
export class GoogleDriveClient {
    public isEnabled: boolean = false;

    // private openIdIdentityModel: OpenIdIdentityModel;
    constructor(/* openIdIdentityModel: OpenIdIdentityModel) */) {
        this.isEnabled =
            lightdashConfig.auth.google.oauth2ClientId !== undefined &&
            lightdashConfig.auth.google.oauth2ClientSecret !== undefined;

        // this.openIdIdentityModel = openIdIdentityModel
    }

    static async getCredentials(refreshToken: string) {
        try {
            const credentials = {
                type: 'authorized_user',
                client_id: lightdashConfig.auth.google.oauth2ClientId,
                client_secret: lightdashConfig.auth.google.oauth2ClientSecret,
                refresh_token: refreshToken,
            };
            return google.auth.fromJSON(credentials);
        } catch (err) {
            throw new Error(`Failed to get credentials: ${err}`);
        }
    }

    async listFiles(refreshToken: string) {
        if (!this.isEnabled) {
            throw new Error('Google Drive is not enabled');
        }
        const authClient = await GoogleDriveClient.getCredentials(refreshToken);

        console.debug('listing files');
        const drive = google.drive({ version: 'v3', auth: authClient });
        const res = await drive.files.list({
            pageSize: 10,
            fields: 'nextPageToken, files(id, name)',
        });
        const { files } = res.data;
        if (files.length === 0) {
            console.debug('No files found.');
            return;
        }

        console.debug('Files:');
        files.forEach((file: any) => {
            console.debug(`${file.name} (${file.id})`);
        });
    }
}
