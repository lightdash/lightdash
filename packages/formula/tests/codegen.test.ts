import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const columns = { revenue: 'revenue', region: 'region' };

describe('codegen', () => {
    describe('aggregates emit bare SQL by default', () => {
        it('SUM', () => {
            expect(
                compile('=SUM(revenue)', { dialect: 'postgres', columns }),
            ).toBe('SUM("revenue")');
        });

        it('AVG', () => {
            // Postgres-family dialects wrap AVG in a ::DOUBLE PRECISION
            // cast to match production's `PostgresWarehouseClient
            // .getMetricSql` (case AVERAGE) and to prevent Redshift's
            // DECIMAL-truncation quirk from silently dropping fractional
            // values inside the AVG division.
            expect(
                compile('=AVG(revenue)', { dialect: 'postgres', columns }),
            ).toBe('AVG("revenue"::DOUBLE PRECISION)');
        });

        it('AVERAGE (alias of AVG)', () => {
            expect(
                compile('=AVERAGE(revenue)', { dialect: 'postgres', columns }),
            ).toBe('AVG("revenue"::DOUBLE PRECISION)');
        });

        it('COUNT with arg', () => {
            expect(
                compile('=COUNT(revenue)', { dialect: 'postgres', columns }),
            ).toBe('COUNT("revenue")');
        });

        it('COUNT(*)', () => {
            expect(compile('=COUNT()', { dialect: 'postgres', columns })).toBe(
                'COUNT(*)',
            );
        });

        it('1-arg MIN', () => {
            expect(
                compile('=MIN(revenue)', { dialect: 'postgres', columns }),
            ).toBe('MIN("revenue")');
        });

        it('1-arg MAX', () => {
            expect(
                compile('=MAX(revenue)', { dialect: 'postgres', columns }),
            ).toBe('MAX("revenue")');
        });

        it('SUMIF', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(`SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END)`);
        });

        it('AVERAGEIF', () => {
            expect(
                compile('=AVERAGEIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(`AVG(CASE WHEN ("region" = 'EU') THEN "revenue" END)`);
        });

        it('COUNTIF', () => {
            expect(
                compile('=COUNTIF(region = "EU")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(`COUNT(CASE WHEN ("region" = 'EU') THEN 1 END)`);
        });
    });

    describe('scalar functions stay bare', () => {
        it('2-arg MIN emits LEAST', () => {
            expect(
                compile('=MIN(revenue, 100)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('LEAST("revenue", 100)');
        });

        it('2-arg MAX emits GREATEST', () => {
            expect(
                compile('=MAX(revenue, 100)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('GREATEST("revenue", 100)');
        });

        it('ABS stays scalar', () => {
            expect(
                compile('=ABS(revenue)', { dialect: 'postgres', columns }),
            ).toBe('ABS("revenue")');
        });

        it('IF stays scalar', () => {
            expect(
                compile('=IF(revenue > 0, 1, 0)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('CASE WHEN ("revenue" > 0) THEN 1 ELSE 0 END');
        });

        it('arithmetic stays scalar', () => {
            expect(
                compile('=revenue * 2', { dialect: 'postgres', columns }),
            ).toBe('("revenue" * 2)');
        });
    });

    describe('renderAggregate callback', () => {
        // A test-local renderer that demonstrates the protocol — callers own
        // the embedding choice. Kept inline to avoid coupling the package to
        // any particular embedding style.
        const asWindowAggregate = (inner: string) => `${inner} OVER ()`;

        it('is invoked on SUM', () => {
            expect(
                compile('=SUM(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('SUM("revenue") OVER ()');
        });

        it('is invoked on SUMIF', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe(
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END) OVER ()`,
            );
        });

        it('is invoked on COUNTIF', () => {
            expect(
                compile('=COUNTIF(region = "EU")', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe(`COUNT(CASE WHEN ("region" = 'EU') THEN 1 END) OVER ()`);
        });

        it('is invoked on 1-arg MIN but not 2-arg (scalar LEAST)', () => {
            expect(
                compile('=MIN(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('MIN("revenue") OVER ()');
            expect(
                compile('=MIN(revenue, 100)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('LEAST("revenue", 100)');
        });

        it('is not invoked on row-level functions', () => {
            expect(
                compile('=ABS(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('ABS("revenue")');
        });

        it('is not invoked on native window functions (they emit their own OVER)', () => {
            expect(
                compile('=RUNNING_TOTAL(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('SUM("revenue") OVER ( ROWS UNBOUNDED PRECEDING)');
        });

        it('is applied recursively to nested aggregates', () => {
            expect(
                compile('=ABS(SUM(revenue))', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('ABS(SUM("revenue") OVER ())');
        });

        it('wraps each aggregate independently in mixed expressions', () => {
            expect(
                compile('=revenue - AVG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: asWindowAggregate,
                }),
            ).toBe('("revenue" - AVG("revenue"::DOUBLE PRECISION) OVER ())');
        });

        it('lets callers express any embedding (demonstration)', () => {
            // Callers aren't limited to OVER () — the protocol is generic.
            // Here a hypothetical consumer tags aggregates for later processing.
            const tag = (inner: string) => `/*agg*/${inner}`;
            expect(
                compile('=SUM(revenue)', {
                    dialect: 'postgres',
                    columns,
                    renderAggregate: tag,
                }),
            ).toBe('/*agg*/SUM("revenue")');
        });
    });

    describe('ROUND', () => {
        it('emits bare ROUND on dialects that accept floatish inputs', () => {
            expect(
                compile('=ROUND(revenue, 2)', {
                    dialect: 'bigquery',
                    columns,
                }),
            ).toBe('ROUND(`revenue`, 2)');
            expect(
                compile('=ROUND(revenue, 2)', {
                    dialect: 'snowflake',
                    columns,
                }),
            ).toBe('ROUND("revenue", 2)');
            expect(
                compile('=ROUND(revenue, 2)', {
                    dialect: 'duckdb',
                    columns,
                }),
            ).toBe('ROUND("revenue", 2)');
        });

        it('casts value to numeric on Postgres for the 2-arg form', () => {
            // Postgres has no `round(double precision, int)` overload,
            // only `round(numeric, int)`. Any 2-arg ROUND over a
            // Lightdash AVG metric (which PostgresWarehouseClient casts
            // to DOUBLE PRECISION) would otherwise fail with
            // "function round(double precision, integer) does not exist".
            expect(
                compile('=ROUND(revenue, 2)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('ROUND(("revenue")::numeric, 2)');
        });

        it('casts value to numeric on Redshift for the 2-arg form', () => {
            expect(
                compile('=ROUND(revenue, 2)', {
                    dialect: 'redshift',
                    columns,
                }),
            ).toBe('ROUND(("revenue")::numeric, 2)');
        });

        it('leaves the 1-arg form uncast on Postgres', () => {
            // `round(double precision)` and `round(numeric)` both exist
            // on Postgres, so no cast is needed for the single-arg form.
            expect(
                compile('=ROUND(revenue)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('ROUND("revenue")');
        });

        it('casts the AVG result on Postgres, preserving both fixes', () => {
            // The common failure path from production: ROUND(AVG(x), n).
            // AVG widens to DOUBLE PRECISION (existing Postgres behavior),
            // and the 2-arg ROUND casts its value back to numeric so the
            // outer call resolves to round(numeric, int).
            expect(
                compile('=ROUND(AVG(revenue), 2)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('ROUND((AVG("revenue"::DOUBLE PRECISION))::numeric, 2)');
        });
    });

    describe('Redshift dialect', () => {
        it('emits bare aggregates by default (Postgres-equivalent output)', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'redshift',
                    columns,
                }),
            ).toBe(`SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END)`);
        });

        it('window-wraps aggregates when renderAggregate is provided', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'redshift',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe(
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END) OVER ()`,
            );
        });

        it('widens AVG argument to DOUBLE PRECISION to avoid truncation', () => {
            // Redshift's AVG over DECIMAL truncates to the input scale —
            // `AVG(DECIMAL(10,2))` of 200/150/300 returns 216.66 rather
            // than 216.666…, silently dropping the fractional cents.
            // The `::DOUBLE PRECISION` cast preserves precision through
            // the division and matches, byte-for-byte, what
            // `PostgresWarehouseClient.getMetricSql` emits for AVERAGE
            // metrics — so a formula AVG and a metric AVG over the same
            // column produce the same value on Redshift.
            expect(
                compile('=revenue - AVG(revenue)', {
                    dialect: 'redshift',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe('("revenue" - AVG("revenue"::DOUBLE PRECISION) OVER ())');
        });
    });

    describe('Databricks dialect', () => {
        it('emits bare aggregates with backtick quoting by default', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'databricks',
                    columns,
                }),
            ).toBe(`SUM(CASE WHEN (\`region\` = 'EU') THEN \`revenue\` END)`);
        });

        it('window-wraps aggregates when renderAggregate is provided', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'databricks',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe(
                `SUM(CASE WHEN (\`region\` = 'EU') THEN \`revenue\` END) OVER ()`,
            );
        });

        it('handles mixed aggregate and row-level expressions', () => {
            expect(
                compile('=revenue - AVG(revenue)', {
                    dialect: 'databricks',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe('(`revenue` - AVG(`revenue`) OVER ())');
        });
    });

    describe('ClickHouse dialect', () => {
        it('emits bare aggregates with double-quoted identifiers by default', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'clickhouse',
                    columns,
                }),
            ).toBe(`SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END)`);
        });

        it('window-wraps aggregates when renderAggregate is provided', () => {
            expect(
                compile('=SUMIF(revenue, region = "EU")', {
                    dialect: 'clickhouse',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe(
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END) OVER ()`,
            );
        });

        it('handles mixed aggregate and row-level expressions', () => {
            expect(
                compile('=revenue - AVG(revenue)', {
                    dialect: 'clickhouse',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                }),
            ).toBe('("revenue" - AVG("revenue") OVER ())');
        });
    });

    describe('renderAggregate invocation protocol', () => {
        // Identity renderer used to observe invocation count and order
        // without changing the generated SQL.
        const track = (calls: string[]) => (inner: string) => {
            calls.push(inner);
            return inner;
        };

        it('invokes the callback once per aggregate node, in recursion order, with bare SQL', () => {
            const calls: string[] = [];
            compile('=SUM(revenue) + AVG(revenue) - SUM(revenue)', {
                dialect: 'postgres',
                columns,
                renderAggregate: track(calls),
            });
            expect(calls).toEqual([
                'SUM("revenue")',
                'AVG("revenue"::DOUBLE PRECISION)',
                'SUM("revenue")',
            ]);
        });

        it('invokes the callback exactly once for a ConditionalAggregate, with the full CASE WHEN as input', () => {
            const calls: string[] = [];
            compile('=SUMIF(revenue, region = "EU")', {
                dialect: 'postgres',
                columns,
                renderAggregate: track(calls),
            });
            expect(calls).toEqual([
                `SUM(CASE WHEN ("region" = 'EU') THEN "revenue" END)`,
            ]);
        });

        it('does not invoke the callback for formulas with no aggregates', () => {
            const calls: string[] = [];
            compile('=revenue * 2 + IF(region = "EU", 1, 0)', {
                dialect: 'postgres',
                columns,
                renderAggregate: track(calls),
            });
            expect(calls).toEqual([]);
        });
    });

    describe('defaultOrderBy for LAG/LEAD', () => {
        it('uses defaultOrderBy when LAG has no explicit ORDER BY', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'region', direction: 'ASC' }],
                }),
            ).toBe('LAG(`revenue`) OVER (ORDER BY `region` ASC)');
        });

        it('uses defaultOrderBy with multiple columns', () => {
            expect(
                compile('=LAG(revenue, 1)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [
                        { column: 'region', direction: 'DESC' },
                        { column: 'revenue' },
                    ],
                }),
            ).toBe('LAG("revenue", 1) OVER (ORDER BY "region" DESC, "revenue")');
        });

        it('applies to LEAD as well', () => {
            expect(
                compile('=LEAD(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'region' }],
                }),
            ).toBe('LEAD(`revenue`) OVER (ORDER BY `region`)');
        });

        it('emits empty OVER () when no defaultOrderBy and no explicit ORDER BY', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe('LAG("revenue") OVER ()');
        });

        it('does not affect other window functions', () => {
            expect(
                compile('=RUNNING_TOTAL(revenue)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [{ column: 'region' }],
                }),
            ).toBe('SUM("revenue") OVER ( ROWS UNBOUNDED PRECEDING)');
        });
    });
});
