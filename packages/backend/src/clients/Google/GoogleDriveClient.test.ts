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

        test('should format BigInt values safely', () => {
            // Small BigInt values within safe integer range should become numbers
            expect(GoogleDriveClient.formatCell(BigInt(55))).toEqual(55);
            expect(GoogleDriveClient.formatCell(BigInt(0))).toEqual(0);
            expect(GoogleDriveClient.formatCell(BigInt(-123))).toEqual(-123);
            expect(
                GoogleDriveClient.formatCell(BigInt(9007199254740991)),
            ).toEqual(9007199254740991); // MAX_SAFE_INTEGER

            // Very large BigInt values should become strings to preserve precision
            expect(
                GoogleDriveClient.formatCell(BigInt('9223372036854775807')),
            ).toEqual('9223372036854775807'); // Beyond safe integer range
            expect(
                GoogleDriveClient.formatCell(BigInt('-9223372036854775808')),
            ).toEqual('-9223372036854775808'); // Beyond safe integer range
            expect(
                GoogleDriveClient.formatCell(BigInt('9007199254740992')),
            ).toEqual('9007199254740992'); // MAX_SAFE_INTEGER + 1

            // Ensure the returned numbers are actual numbers (not strings)
            expect(typeof GoogleDriveClient.formatCell(BigInt(55))).toEqual(
                'number',
            );
            expect(
                typeof GoogleDriveClient.formatCell(
                    BigInt('9223372036854775807'),
                ),
            ).toEqual('string');
        });
    });
});
