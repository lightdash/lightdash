import { isTabularThreadFileName } from './threadFileTypes';

describe('isTabularThreadFileName', () => {
    it('treats csv and tsv as tabular regardless of case', () => {
        expect(isTabularThreadFileName('orders.csv')).toBe(true);
        expect(isTabularThreadFileName('ORDERS.TSV')).toBe(true);
    });

    it('treats everything else as a document', () => {
        expect(isTabularThreadFileName('notes.md')).toBe(false);
        expect(isTabularThreadFileName('csv-notes.txt')).toBe(false);
        expect(isTabularThreadFileName('report')).toBe(false);
    });
});
