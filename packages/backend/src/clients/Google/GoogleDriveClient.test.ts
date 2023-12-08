import { GoogleDriveClient } from './GoogleDriveClient';

describe('GoogleDriveClient', () => {
    describe('formatRow', () => {
        test('should format values', async () => {
            expect(GoogleDriveClient.formatCell(1)).toEqual(1);
            expect(GoogleDriveClient.formatCell(1.99)).toEqual(1.99);
            expect(GoogleDriveClient.formatCell('value')).toEqual('value');
            expect(GoogleDriveClient.formatCell(true)).toEqual(true);

            expect(GoogleDriveClient.formatCell(Number(123))).toEqual(123);
            expect(GoogleDriveClient.formatCell(String(123))).toEqual('123');
            expect(GoogleDriveClient.formatCell(Boolean(true))).toEqual(true);
            expect(GoogleDriveClient.formatCell(new Set([1, 2, 3]))).toEqual(
                `1,2,3`,
            );

            expect(GoogleDriveClient.formatCell(null)).toEqual(null);
            expect(GoogleDriveClient.formatCell(/a-z/)).toEqual(`a-z`); // RegExp
            expect(GoogleDriveClient.formatCell([1, 2, 3])).toEqual(`1,2,3`);
            expect(GoogleDriveClient.formatCell({ foo: 'bar' })).toEqual(
                `{"foo":"bar"}`,
            );
            expect(typeof GoogleDriveClient.formatCell(new Date())).toEqual(
                `object`,
            );
        });
    });
});
