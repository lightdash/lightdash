import { parseGoogleSheetsTabId } from './externalSources';

describe('parseGoogleSheetsTabId', () => {
    it('reads the tab id from a sheet URL', () => {
        const base = 'https://docs.google.com/spreadsheets/d/abc/edit';
        expect(parseGoogleSheetsTabId(`${base}?gid=0#gid=123`)).toBe(0);
        expect(parseGoogleSheetsTabId(`${base}#gid=123`)).toBe(123);
        expect(parseGoogleSheetsTabId(base)).toBeUndefined();
    });
});
