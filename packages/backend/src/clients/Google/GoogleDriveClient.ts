import { lightdashConfig } from '../../config/lightdashConfig';

const { google } = require('googleapis');

export class GoogleDriveClient {
    public isEnabled: boolean = false;

    constructor() {
        this.isEnabled =
            lightdashConfig.auth.google.oauth2ClientId !== undefined &&
            lightdashConfig.auth.google.oauth2ClientSecret !== undefined;
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

    async appendToSheet(
        refreshToken: string,
        fileId: string,
        csvContent: string,
    ) {
        if (!this.isEnabled) {
            throw new Error('Google Drive is not enabled');
        }
        const authClient = await GoogleDriveClient.getCredentials(refreshToken);

        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const sheetRows = csvContent.split('\n').map((row) => row.split(','));
        /*
        // Creates a new tab in the sheet
        // use `'${tabTitle}'!A:B` as range to write to the new tab
        const tabTitle = new Date().toLocaleString().replaceAll(':', '.'); // we can't use ranges with colons in their tab ids
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: fileId,
            resource: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: tabTitle,
                            },
                        },
                    },
                ],
            },
        });
        */

        // Clear sheet before writting
        await sheets.spreadsheets.values.clear({
            spreadsheetId: fileId,
            range: 'A1',
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: fileId,
            range: 'A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: sheetRows,
            },
        });
    }
}
