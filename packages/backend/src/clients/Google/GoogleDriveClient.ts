import { lightdashConfig } from '../../config/lightdashConfig';
import Logger from '../../logging/logger';

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

    private static async changeTabTitle(
        sheets: any,
        fileId: string,
        title: string,
    ) {
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: fileId,
        });
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: fileId,
            resource: {
                requests: [
                    {
                        updateSheetProperties: {
                            properties: {
                                sheetId:
                                    spreadsheet.data.sheets[0].properties
                                        .sheetId,
                                title,
                            },
                            fields: 'title',
                        },
                    },
                ],
            },
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

        // Clear first sheet before writting
        // The method "SheetId: 0" only works if the first default sheet tab still exists (it's not deleted by the user)
        // So instead we select all the cells in the first tab by its name
        try {
            const spreadsheet = await sheets.spreadsheets.get({
                spreadsheetId: fileId,
            });
            const firstSheetName = spreadsheet.data.sheets[0].properties.title;
            Logger.debug(`Clearing sheet name ${firstSheetName}}`);
            await sheets.spreadsheets.values.clear({
                spreadsheetId: fileId,
                range: firstSheetName,
            });
        } catch (error) {
            Logger.error('Unable to clear the sheet', error);
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: fileId,
            range: 'A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: sheetRows,
            },
        });

        const updatedTimestamp = new Date()
            .toLocaleString()
            .replaceAll(':', '.');
        await GoogleDriveClient.changeTabTitle(
            sheets,
            fileId,
            updatedTimestamp,
        );
    }
}
