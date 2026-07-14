import { maskSecretValue, parseConnectionPaste } from './parseConnectionPaste';

describe('parseConnectionPaste', () => {
    it('parses a Snowflake connection string', () => {
        const result = parseConnectionPaste(
            'snowflake://alice:s3cret@ab12345.eu-west-1/ANALYTICS/PUBLIC?warehouse=COMPUTE_WH&role=LIGHTDASH_ROLE',
        );
        expect(result).not.toBeNull();
        expect(result?.format).toBe('connection_string');
        expect(result?.values).toEqual({
            user: 'alice',
            password: 's3cret',
            account: 'ab12345.eu-west-1',
            database: 'ANALYTICS',
            schema: 'PUBLIC',
            warehouse: 'COMPUTE_WH',
            role: 'LIGHTDASH_ROLE',
        });
        expect(result?.secretFields).toEqual(['password']);
    });

    it('parses a connection string without a password', () => {
        const result = parseConnectionPaste(
            'snowflake://alice@ab12345/ANALYTICS',
        );
        expect(result?.values).toEqual({
            user: 'alice',
            account: 'ab12345',
            database: 'ANALYTICS',
        });
        expect(result?.secretFields).toEqual([]);
    });

    it('parses a dbt profiles.yml snippet', () => {
        const result = parseConnectionPaste(`
            my_project:
              target: prod
              outputs:
                prod:
                  type: snowflake
                  account: ab12345.eu-west-1
                  user: alice
                  password: s3cret
                  role: LIGHTDASH_ROLE
                  database: ANALYTICS
                  warehouse: COMPUTE_WH
                  schema: PUBLIC
        `);
        expect(result?.format).toBe('profiles_yml');
        expect(result?.values).toMatchObject({
            account: 'ab12345.eu-west-1',
            user: 'alice',
            password: 's3cret',
            role: 'LIGHTDASH_ROLE',
            database: 'ANALYTICS',
            warehouse: 'COMPUTE_WH',
            schema: 'PUBLIC',
        });
        expect(result?.secretFields).toEqual(['password']);
    });

    it('parses key=value pairs', () => {
        const result = parseConnectionPaste(
            'ACCOUNT=ab12345\nUSER=alice\nPWD=s3cret\nDATABASE=ANALYTICS',
        );
        expect(result?.format).toBe('key_values');
        expect(result?.values).toEqual({
            account: 'ab12345',
            user: 'alice',
            password: 's3cret',
            database: 'ANALYTICS',
        });
    });

    it('strips quotes and ignores comments/unknown keys', () => {
        const result = parseConnectionPaste(
            '# my config\naccount: "ab12345"\nfoo: bar\nuser: \'alice\'',
        );
        expect(result?.values).toEqual({
            account: 'ab12345',
            user: 'alice',
        });
    });

    it('returns null for malformed input', () => {
        expect(parseConnectionPaste('')).toBeNull();
        expect(parseConnectionPaste('   ')).toBeNull();
        expect(parseConnectionPaste('just some random prose')).toBeNull();
        expect(parseConnectionPaste('snowflake://')).toBeNull();
    });

    it('reports secret fields so the preview can mask them', () => {
        const result = parseConnectionPaste('account: ab1\npassword: hunter2');
        expect(result?.secretFields).toContain('password');
    });
});

describe('maskSecretValue', () => {
    it('masks non-empty values', () => {
        expect(maskSecretValue('secret')).toBe('••••••');
    });

    it('caps the mask length', () => {
        expect(maskSecretValue('a'.repeat(50))).toBe('•'.repeat(12));
    });

    it('returns empty string for empty input', () => {
        expect(maskSecretValue('')).toBe('');
    });
});
