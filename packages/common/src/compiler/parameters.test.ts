import { getParameterReferences, validateParameterNames } from './parameters';

describe('getParameterReferences', () => {
    describe('Project-level parameters', () => {
        it('should extract project parameter with lightdash.parameters format', () => {
            const sql =
                'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['status']);
        });

        it('should extract project parameter with ld.parameters format', () => {
            const sql =
                'SELECT * FROM orders WHERE region = ${ld.parameters.region}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['region']);
        });

        it('should extract multiple different project parameters', () => {
            const sql =
                'SELECT * FROM orders WHERE region = ${ld.parameters.region} AND status = ${lightdash.parameters.status} AND created_at > ${ld.parameters.date}';
            const result = getParameterReferences(sql);
            expect(result).toContain('region');
            expect(result).toContain('status');
            expect(result).toContain('date');
            expect(result.length).toBe(3);
        });

        it('should return unique parameter names when duplicates exist', () => {
            const sql =
                'SELECT * FROM users WHERE status = ${lightdash.parameters.status} AND created_by = ${lightdash.parameters.status}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['status']);
        });
    });

    describe('Model-level parameters', () => {
        it('should extract model parameter with lightdash.parameters format', () => {
            const sql =
                'SELECT * FROM users WHERE name = ${lightdash.parameters.customers.customer_name}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['customers.customer_name']);
        });

        it('should extract model parameter with ld.parameters format', () => {
            const sql =
                'SELECT * FROM orders WHERE status = ${ld.parameters.orders.status}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['orders.status']);
        });

        it('should extract multiple model parameters', () => {
            const sql =
                'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.name = ${ld.parameters.customers.customer_name} AND o.status = ${lightdash.parameters.orders.status}';
            const result = getParameterReferences(sql);
            expect(result).toContain('customers.customer_name');
            expect(result).toContain('orders.status');
            expect(result.length).toBe(2);
        });

        it('should return unique model parameter names when duplicates exist', () => {
            const sql =
                'SELECT * FROM users WHERE name = ${lightdash.parameters.customers.customer_name} AND created_by = ${ld.parameters.customers.customer_name}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['customers.customer_name']);
        });
    });

    describe('Mixed project and model parameters', () => {
        it('should handle project and model parameters in same SQL', () => {
            const sql =
                'SELECT * FROM users WHERE region = ${ld.parameters.region} AND name = ${ld.parameters.customers.customer_name}';
            const result = getParameterReferences(sql);
            expect(result).toContain('region');
            expect(result).toContain('customers.customer_name');
            expect(result.length).toBe(2);
        });

        it('should extract parameters in CASE statements', () => {
            const sql =
                'SELECT CASE WHEN status = ${ld.parameters.orders.active_status} THEN 1 ELSE 0 END FROM orders WHERE region = ${ld.parameters.region}';
            const result = getParameterReferences(sql);
            expect(result).toContain('orders.active_status');
            expect(result).toContain('region');
            expect(result.length).toBe(2);
        });

        it('should extract parameters in JOIN conditions', () => {
            const sql =
                'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id AND c.region = ${lightdash.parameters.customers.target_region} AND o.status = ${ld.parameters.active_status}';
            const result = getParameterReferences(sql);
            expect(result).toContain('customers.target_region');
            expect(result).toContain('active_status');
            expect(result.length).toBe(2);
        });
    });

    describe('Edge cases and validation', () => {
        it('should return empty array when no parameter references exist', () => {
            const sql = 'SELECT * FROM users WHERE status = "active"';
            const result = getParameterReferences(sql);
            expect(result).toEqual([]);
        });

        it('should handle empty parameter names gracefully', () => {
            const sql = 'SELECT * FROM users WHERE status = ${ld.parameters.}';
            const result = getParameterReferences(sql);
            expect(result).toEqual([]);
        });

        it('should handle malformed parameter syntax', () => {
            const sql = 'SELECT * FROM users WHERE status = ${ld.parameters';
            const result = getParameterReferences(sql);
            expect(result).toEqual([]);
        });

        it('should reject parameters with invalid characters', () => {
            const sql =
                'SELECT * FROM users WHERE status = ${ld.parameters.users.status-invalid}';
            const result = getParameterReferences(sql);
            expect(result).toEqual([]);
        });

        it('should reject parameters with too many dots', () => {
            const sql =
                'SELECT * FROM users WHERE status = ${ld.parameters.users.status.extra}';
            const result = getParameterReferences(sql);
            expect(result).toEqual([]);
        });

        it('should filter out invalid parameters but keep valid ones', () => {
            const sql =
                'SELECT * FROM users WHERE valid = ${ld.parameters.users.status} AND invalid = ${ld.parameters.users.status.extra}';
            const result = getParameterReferences(sql);
            expect(result).toEqual(['users.status']);
        });
    });

    describe('Performance scenarios', () => {
        it('should handle large SQL strings efficiently', () => {
            const baseSQL = 'SELECT * FROM users WHERE ';
            const conditions = Array.from(
                { length: 50 },
                (_, i) => `field${i} = \${ld.parameters.table${i}.param${i}}`,
            ).join(' AND ');
            const sql = baseSQL + conditions;

            const result = getParameterReferences(sql);
            expect(result.length).toBe(50);
            expect(result[0]).toBe('table0.param0');
            expect(result[49]).toBe('table49.param49');
        });

        it('should handle SQL with many duplicate parameter references', () => {
            const conditions = Array.from(
                { length: 20 },
                () => 'status = ${ld.parameters.users.status}',
            ).join(' OR ');
            const sql = `SELECT * FROM users WHERE ${conditions}`;

            const result = getParameterReferences(sql);
            expect(result).toEqual(['users.status']);
        });
    });

    describe('Parameter scoping and name conflicts', () => {
        it('should distinguish between project and model parameters with same name', () => {
            const sql =
                'SELECT * FROM users WHERE region = ${ld.parameters.region} AND user_region = ${ld.parameters.users.region}';
            const result = getParameterReferences(sql);
            expect(result).toContain('region'); // project-level
            expect(result).toContain('users.region'); // model-level
            expect(result.length).toBe(2);
        });

        it('should handle multiple same-named parameters across different scopes', () => {
            const sql =
                'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ' +
                'o.status = ${ld.parameters.status} AND ' + // project-level status
                'o.order_status = ${ld.parameters.orders.status} AND ' + // model-level orders.status
                'c.customer_status = ${lightdash.parameters.customers.status}'; // model-level customers.status
            const result = getParameterReferences(sql);
            expect(result).toContain('status'); // project-level
            expect(result).toContain('orders.status'); // model-level
            expect(result).toContain('customers.status'); // model-level
            expect(result.length).toBe(3);
        });

        it('should correctly scope parameters in complex JOIN conditions', () => {
            const sql =
                'SELECT * FROM orders o ' +
                'LEFT JOIN customers c ON c.id = o.customer_id AND c.region = ${ld.parameters.region} ' + // project-level
                'LEFT JOIN products p ON p.id = o.product_id AND p.category = ${ld.parameters.products.category} ' + // model-level
                'WHERE o.region = ${lightdash.parameters.orders.region}'; // model-level with same name as project
            const result = getParameterReferences(sql);
            expect(result).toContain('region'); // project-level
            expect(result).toContain('products.category'); // model-level
            expect(result).toContain('orders.region'); // model-level with same name
            expect(result.length).toBe(3);
        });

        it('should handle same parameter name across multiple model scopes', () => {
            const sql =
                'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ' +
                'o.created_date >= ${ld.parameters.orders.start_date} AND ' +
                'c.created_date >= ${lightdash.parameters.customers.start_date}';
            const result = getParameterReferences(sql);
            expect(result).toContain('orders.start_date');
            expect(result).toContain('customers.start_date');
            expect(result.length).toBe(2);
        });
    });
});

describe('validateParameterNames', () => {
    it('should accept valid parameter names (alphanumeric, underscores, hyphens)', () => {
        const result = validateParameterNames({
            status: { label: 'Status', default: 'active' },
            region123: { label: 'Region', default: 'US' },
            USER_ID: { label: 'User ID', default: '1' },
            user_name: { label: 'User Name', default: 'John' },
            _private: { label: 'Private', default: 'value' },
            'user-id': { label: 'User ID', default: '123' },
            'region-code': { label: 'Region Code', default: 'US' },
        });
        expect(result.isInvalid).toBe(false);
        expect(result.invalidParameters).toEqual([]);
    });

    it('should reject invalid parameter names (dots, spaces, special chars)', () => {
        const result = validateParameterNames({
            'user.name': { label: 'User Name', default: 'John' },
            'user name': { label: 'User Name', default: 'John' },
            'user@email': { label: 'User Email', default: 'test' },
            price$amount: { label: 'Price Amount', default: '100' },
            'value#hash': { label: 'Value Hash', default: 'abc' },
            '': { label: 'Empty', default: 'value' },
        });
        expect(result.isInvalid).toBe(true);
        expect(result.invalidParameters).toContain('user.name');
        expect(result.invalidParameters).toContain('user name');
        expect(result.invalidParameters).toContain('user@email');
        expect(result.invalidParameters).toContain('price$amount');
        expect(result.invalidParameters).toContain('value#hash');
        expect(result.invalidParameters).toContain('');
    });

    it('should handle edge cases (undefined, empty)', () => {
        expect(validateParameterNames(undefined).isInvalid).toBe(false);
        expect(validateParameterNames(undefined).invalidParameters).toEqual([]);
        expect(validateParameterNames({}).isInvalid).toBe(false);
        expect(validateParameterNames({}).invalidParameters).toEqual([]);
    });

    it('should identify mixed valid and invalid parameters', () => {
        const result = validateParameterNames({
            validParam1: { label: 'Valid Param 1', default: 'value1' },
            'invalid.param': { label: 'Invalid Param', default: 'value2' },
            valid_param2: { label: 'Valid Param 2', default: 'value3' },
            'another invalid': { label: 'Another Invalid', default: 'value4' },
            'valid-param3': { label: 'Valid Param 3', default: 'value5' },
        });
        expect(result.isInvalid).toBe(true);
        expect(result.invalidParameters).toHaveLength(2);
        expect(result.invalidParameters).toContain('invalid.param');
        expect(result.invalidParameters).toContain('another invalid');
    });
});
