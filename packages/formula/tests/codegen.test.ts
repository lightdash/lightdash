import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const columns = { revenue: 'revenue', region: 'region' };

describe('codegen aggregateContext', () => {
    describe('SUM', () => {
        it('emits bare SUM by default', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
            });
            expect(sql).toBe('SUM("revenue")');
        });

        it('emits bare SUM when aggregateContext is explicitly bare', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'bare',
            });
            expect(sql).toBe('SUM("revenue")');
        });

        it('emits window SUM when aggregateContext is window', () => {
            const sql = compile('=SUM(revenue)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'window',
            });
            expect(sql).toBe('SUM("revenue") OVER ()');
        });
    });

    describe('AVG / AVERAGE', () => {
        it('emits bare AVG by default', () => {
            expect(
                compile('=AVG(revenue)', { dialect: 'postgres', columns }),
            ).toBe('AVG("revenue")');
        });

        it('emits window AVG in window context', () => {
            expect(
                compile('=AVG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('AVG("revenue") OVER ()');
        });

        it('treats AVERAGE as an alias for AVG', () => {
            expect(
                compile('=AVERAGE(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('AVG("revenue") OVER ()');
        });
    });

    describe('COUNT', () => {
        it('emits bare COUNT(x) by default', () => {
            expect(
                compile('=COUNT(revenue)', { dialect: 'postgres', columns }),
            ).toBe('COUNT("revenue")');
        });

        it('emits window COUNT(x) in window context', () => {
            expect(
                compile('=COUNT(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('COUNT("revenue") OVER ()');
        });

        it('emits bare COUNT(*) by default', () => {
            expect(
                compile('=COUNT()', { dialect: 'postgres', columns }),
            ).toBe('COUNT(*)');
        });

        it('emits window COUNT(*) in window context', () => {
            expect(
                compile('=COUNT()', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('COUNT(*) OVER ()');
        });
    });

    describe('MIN / MAX (1-arg aggregate form)', () => {
        it('emits bare MIN(x) by default', () => {
            expect(
                compile('=MIN(revenue)', { dialect: 'postgres', columns }),
            ).toBe('MIN("revenue")');
        });

        it('emits window MIN(x) in window context', () => {
            expect(
                compile('=MIN(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('MIN("revenue") OVER ()');
        });

        it('emits bare MAX(x) by default', () => {
            expect(
                compile('=MAX(revenue)', { dialect: 'postgres', columns }),
            ).toBe('MAX("revenue")');
        });

        it('emits window MAX(x) in window context', () => {
            expect(
                compile('=MAX(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('MAX("revenue") OVER ()');
        });
    });

    describe('MIN / MAX (2-arg scalar form)', () => {
        it('emits LEAST regardless of context', () => {
            const bare = compile('=MIN(revenue, 100)', {
                dialect: 'postgres',
                columns,
            });
            const window = compile('=MIN(revenue, 100)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'window',
            });
            expect(bare).toBe('LEAST("revenue", 100)');
            expect(window).toBe('LEAST("revenue", 100)');
        });

        it('emits GREATEST regardless of context', () => {
            const bare = compile('=MAX(revenue, 100)', {
                dialect: 'postgres',
                columns,
            });
            const window = compile('=MAX(revenue, 100)', {
                dialect: 'postgres',
                columns,
                aggregateContext: 'window',
            });
            expect(bare).toBe('GREATEST("revenue", 100)');
            expect(window).toBe('GREATEST("revenue", 100)');
        });
    });

    describe('SUMIF / AVERAGEIF / COUNTIF', () => {
        it('emits bare SUMIF by default', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END)`,
            );
        });

        it('emits window SUMIF in window context', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe(
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END) OVER ()`,
            );
        });

        it('emits bare AVERAGEIF by default', () => {
            expect(
                compile('=AVERAGEIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(
                `AVG(CASE WHEN ("region" = 'EU') THEN "revenue" END)`,
            );
        });

        it('emits window AVERAGEIF in window context', () => {
            expect(
                compile('=AVERAGEIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe(
                `AVG(CASE WHEN ("region" = 'EU') THEN "revenue" END) OVER ()`,
            );
        });

        it('emits bare COUNTIF by default', () => {
            expect(
                compile('=COUNTIF(region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(`COUNT(CASE WHEN ("region" = 'EU') THEN 1 END)`);
        });

        it('emits window COUNTIF in window context', () => {
            expect(
                compile('=COUNTIF(region = "EU")', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe(
                `COUNT(CASE WHEN ("region" = 'EU') THEN 1 END) OVER ()`,
            );
        });
    });

    describe('row-level functions are unaffected by context', () => {
        it('ABS stays scalar in window context', () => {
            expect(
                compile('=ABS(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('ABS("revenue")');
        });

        it('IF stays scalar in window context', () => {
            expect(
                compile('=IF(revenue > 0, 1, 0)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('CASE WHEN ("revenue" > 0) THEN 1 ELSE 0 END');
        });

        it('arithmetic stays scalar in window context', () => {
            expect(
                compile('=revenue * 2', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('("revenue" * 2)');
        });
    });

    describe('mixed expressions', () => {
        it('wraps aggregates while leaving row-level pieces scalar', () => {
            expect(
                compile('=revenue - AVG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('("revenue" - AVG("revenue") OVER ())');
        });

        it('wraps SUM in share-of-total with safe division', () => {
            expect(
                compile('=revenue / SUM(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('("revenue" / NULLIF(SUM("revenue") OVER (), 0))');
        });

        it('wraps multiple aggregates in a single expression', () => {
            expect(
                compile('=SUM(revenue) - AVG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('(SUM("revenue") OVER () - AVG("revenue") OVER ())');
        });
    });

    describe('nested aggregates', () => {
        it('wraps the aggregate, not the scalar function around it', () => {
            expect(
                compile('=ABS(SUM(revenue))', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe('ABS(SUM("revenue") OVER ())');
        });

        it('wraps the aggregate inside an IF branch', () => {
            expect(
                compile('=IF(revenue > 0, SUM(revenue), 0)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe(
                'CASE WHEN ("revenue" > 0) THEN SUM("revenue") OVER () ELSE 0 END',
            );
        });

        it('does not double-wrap a native window function', () => {
            expect(
                compile('=RUNNING_TOTAL(revenue)', {
                    dialect: 'postgres',
                    columns,
                    aggregateContext: 'window',
                }),
            ).toBe(
                'SUM("revenue") OVER ( ROWS UNBOUNDED PRECEDING)',
            );
        });
    });
});
