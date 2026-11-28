import { findAccessRule, readRule } from './integration';

describe('findAccessRule', () => {
    const report = readRule('POST', '/v1/report');
    const objects = readRule('GET', '/v1/objects', { exact: true });
    const record = readRule('GET', '/v1/objects/{object}/records/{id}', {
        exact: true,
    });
    const deals = readRule('POST', '/v1/objects/deals/report', {
        exact: true,
        entry: 'deals',
    });
    const rules = [report, objects, record, deals];
    const find = (method: 'GET' | 'POST', path: string) =>
        findAccessRule(rules, { method, path });

    it('matches a plain rule as a path prefix, as before', () => {
        expect(find('POST', '/v1/report')).toBe(report);
        expect(find('POST', '/v1/report/')).toBe(report);
        expect(find('POST', '/v1/report/extra')).toBe(report);
        expect(find('POST', '/v1/reports')).toBeUndefined();
    });

    it('matches an exact rule only on its own path', () => {
        expect(find('GET', '/v1/objects')).toBe(objects);
        expect(find('GET', '/v1/objects/')).toBe(objects);
        expect(find('GET', '/v1/objects/deals')).toBeUndefined();
    });

    it('matches a template segment against one non-empty segment', () => {
        expect(find('GET', '/v1/objects/deals/records/42')).toBe(record);
        expect(find('GET', '/v1/objects//records/42')).toBeUndefined();
        expect(find('GET', '/v1/objects/deals/records/42/x')).toBeUndefined();
    });

    it('pairs the method with the path', () => {
        expect(find('POST', '/v1/objects/deals/report')).toBe(deals);
        expect(find('GET', '/v1/objects/deals/report')).toBeUndefined();
        expect(find('POST', '/v1/objects/other/report')).toBeUndefined();
    });
});
