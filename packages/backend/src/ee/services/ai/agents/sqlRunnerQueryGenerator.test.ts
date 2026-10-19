import { stripMarkdownFences } from './sqlRunnerQueryGenerator';

describe('stripMarkdownFences', () => {
    it('removes fences and a trailing semicolon', () => {
        expect(stripMarkdownFences('```sql\nSELECT 1;\n```')).toBe('SELECT 1');
    });
});
