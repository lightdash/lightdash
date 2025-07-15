import { getParameterReferences } from './parameters';

describe('getParameterReferences', () => {
    it('should extract parameter references with lightdash.parameters format', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const result = getParameterReferences(sql);
        expect(result).toEqual(['status']);
    });

    it('should extract parameter references with ld.parameters format', () => {
        const sql =
            'SELECT * FROM orders WHERE region = ${ld.parameters.region}';
        const result = getParameterReferences(sql);
        expect(result).toEqual(['region']);
    });

    it('should return empty array when no parameter references exist', () => {
        const sql = 'SELECT * FROM users WHERE status = "active"';
        const result = getParameterReferences(sql);
        expect(result).toEqual([]);
    });

    it('should return unique parameter names when duplicates exist', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status} AND created_by = ${lightdash.parameters.status}';
        const result = getParameterReferences(sql);
        expect(result).toEqual(['status']);
    });

    it('should extract multiple different parameter references', () => {
        const sql =
            'SELECT * FROM orders WHERE region = ${ld.parameters.region} AND status = ${lightdash.parameters.status} AND created_at > ${ld.parameters.date}';
        const result = getParameterReferences(sql);
        expect(result).toContain('region');
        expect(result).toContain('status');
        expect(result).toContain('date');
        expect(result.length).toBe(3);
    });
});
