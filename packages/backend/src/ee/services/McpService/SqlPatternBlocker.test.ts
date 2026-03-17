import { matchesBlockedPattern } from './SqlPatternBlocker';

describe('SqlPatternBlocker', () => {
    const clearPatterns = [
        '(?:from|join)\\s+(?:\\w+\\.)*\\w+_clear\\b',
        '(?:from|join)\\s+(?:\\w+\\.)*\\w*_clear__\\w+',
    ];

    describe('with sanitisation enabled (default)', () => {
        it('returns false when no patterns configured', () => {
            expect(matchesBlockedPattern('SELECT * FROM foo', [])).toBe(false);
        });

        it('returns false for safe queries', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT id, name FROM analytics.users',
                    clearPatterns,
                ),
            ).toBe(false);
        });

        it('detects _clear schema in FROM clause', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM ddcase_clear.dd_case',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('detects _clear schema with database prefix', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM analytics_db.ddcase_clear.dd_case',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('detects _clear schema in JOIN clause', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT a.* FROM users a JOIN ddcase_clear.cases b ON a.id = b.user_id',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('detects staging clear tables with _clear__ pattern', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM stg_servicing_core_kafka_clear__verificationevent',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks uppercase evasion', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM DDCASE_CLEAR.DD_CASE',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks quoted identifier evasion', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM "ddcase_clear"."dd_case"',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks backtick identifier evasion', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM `ddcase_clear`.`dd_case`',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks evasion via single-line comments', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM -- bypass\nddcase_clear.dd_case',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks evasion via multi-line comments', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM /* bypass */ ddcase_clear.dd_case',
                    clearPatterns,
                ),
            ).toBe(true);
        });

        it('blocks mixed case with comments and quotes', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM /* trick */ "DDCASE_CLEAR"."DD_CASE"',
                    clearPatterns,
                ),
            ).toBe(true);
        });
    });

    describe('with sanitisation disabled', () => {
        it('does not strip comments or quotes', () => {
            // With quotes intact, the pattern won't match the quoted version
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM "ddcase_clear"."dd_case"',
                    clearPatterns,
                    false,
                ),
            ).toBe(false);
        });

        it('still matches case-insensitively', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT * FROM DDCASE_CLEAR.DD_CASE',
                    clearPatterns,
                    false,
                ),
            ).toBe(true);
        });
    });

    describe('with simple keyword patterns', () => {
        const keywordPatterns = ['\\bsalary\\b', '\\bssn\\b'];

        it('blocks keyword anywhere in query', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT salary FROM employees',
                    keywordPatterns,
                ),
            ).toBe(true);
        });

        it('does not false-positive on partial matches', () => {
            expect(
                matchesBlockedPattern(
                    'SELECT salaried_flag FROM employees',
                    keywordPatterns,
                ),
            ).toBe(false);
        });
    });
});
