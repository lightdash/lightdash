import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

const columns = {
    revenue: 'revenue',
    region: 'region',
    order_date: 'order_date',
};

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

    describe('LAST_DAY', () => {
        const postgresStyleLastDay = `CAST(DATE_TRUNC('month', "order_date") + INTERVAL '1 month' - INTERVAL '1 day' AS DATE)`;

        it.each([
            ['bigquery', 'LAST_DAY(`order_date`)'],
            ['snowflake', 'LAST_DAY("order_date")'],
            ['duckdb', 'LAST_DAY("order_date")'],
            ['databricks', 'LAST_DAY(`order_date`)'],
            ['postgres', postgresStyleLastDay],
            // Redshift has a native LAST_DAY (unlike Postgres) — and rejects
            // the Postgres-style INTERVAL '1 month' composition outright.
            ['redshift', 'LAST_DAY("order_date")'],
            ['clickhouse', 'toLastDayOfMonth("order_date")'],
        ] as const)('%s → %s', (dialect, expected) => {
            expect(
                compile('=LAST_DAY(order_date)', { dialect, columns }),
            ).toBe(expected);
        });
    });

    describe('DATE_TRUNC', () => {
        it.each([
            // ANSI dialects: one shape across all units.
            ['postgres', 'day', `DATE_TRUNC('day', "order_date")`],
            ['postgres', 'week', `DATE_TRUNC('week', "order_date")`],
            ['postgres', 'month', `DATE_TRUNC('month', "order_date")`],
            ['postgres', 'quarter', `DATE_TRUNC('quarter', "order_date")`],
            ['postgres', 'year', `DATE_TRUNC('year', "order_date")`],
            ['redshift', 'month', `DATE_TRUNC('month', "order_date")`],
            ['snowflake', 'month', `DATE_TRUNC('month', "order_date")`],
            ['duckdb', 'month', `DATE_TRUNC('month', "order_date")`],
            // BigQuery: flipped arg order, bare unit identifier.
            ['bigquery', 'day', 'DATE_TRUNC(`order_date`, DAY)'],
            ['bigquery', 'week', 'DATE_TRUNC(`order_date`, WEEK(MONDAY))'],
            ['bigquery', 'month', 'DATE_TRUNC(`order_date`, MONTH)'],
            ['bigquery', 'quarter', 'DATE_TRUNC(`order_date`, QUARTER)'],
            ['bigquery', 'year', 'DATE_TRUNC(`order_date`, YEAR)'],
            // Databricks: ANSI form.
            ['databricks', 'month', `DATE_TRUNC('month', \`order_date\`)`],
            // ClickHouse: toStartOf* helpers.
            ['clickhouse', 'day', 'toStartOfDay("order_date")'],
            ['clickhouse', 'week', 'toStartOfWeek("order_date", 1)'],
            ['clickhouse', 'month', 'toStartOfMonth("order_date")'],
            ['clickhouse', 'quarter', 'toStartOfQuarter("order_date")'],
            ['clickhouse', 'year', 'toStartOfYear("order_date")'],
        ] as const)('%s DATE_TRUNC("%s", …) → %s', (dialect, unit, expected) => {
            expect(
                compile(`=DATE_TRUNC("${unit}", order_date)`, {
                    dialect,
                    columns,
                }),
            ).toBe(expected);
        });

        describe('non-Monday week start', () => {
            // Sunday = 6 in the formula package's WeekDay type.
            it('Postgres offsets in/out with INTERVAL days', () => {
                expect(
                    compile('=DATE_TRUNC("week", order_date)', {
                        dialect: 'postgres',
                        columns,
                        weekStartDay: 6,
                    }),
                ).toBe(
                    `(DATE_TRUNC('week', ("order_date" - INTERVAL '6 days')) + INTERVAL '6 days')`,
                );
            });

            it('BigQuery passes the day name to WEEK(...)', () => {
                expect(
                    compile('=DATE_TRUNC("week", order_date)', {
                        dialect: 'bigquery',
                        columns,
                        weekStartDay: 6,
                    }),
                ).toBe('DATE_TRUNC(`order_date`, WEEK(SUNDAY))');
            });

            it('Databricks offsets via DATEADD', () => {
                expect(
                    compile('=DATE_TRUNC("week", order_date)', {
                        dialect: 'databricks',
                        columns,
                        weekStartDay: 6,
                    }),
                ).toBe(
                    "DATEADD(DAY, 6, DATE_TRUNC('week', DATEADD(DAY, -6, `order_date`)))",
                );
            });

            it('ClickHouse shifts around the Monday anchor', () => {
                expect(
                    compile('=DATE_TRUNC("week", order_date)', {
                        dialect: 'clickhouse',
                        columns,
                        weekStartDay: 6,
                    }),
                ).toBe(
                    'addDays(toStartOfWeek(addDays("order_date", -6), 1), 6)',
                );
            });

            it('Monday (default) leaves the base form intact on Postgres', () => {
                expect(
                    compile('=DATE_TRUNC("week", order_date)', {
                        dialect: 'postgres',
                        columns,
                    }),
                ).toBe(`DATE_TRUNC('week', "order_date")`);
            });
        });
    });

    describe('DATE_ADD', () => {
        it.each([
            ['postgres', `("order_date" + (3) * INTERVAL '1 month')`],
            // Redshift rejects month/year INTERVAL arithmetic on date columns,
            // so it uses DATEADD (same shape as Snowflake).
            ['redshift', 'DATEADD(MONTH, 3, "order_date")'],
            ['duckdb', `("order_date" + (3) * INTERVAL '1 month')`],
            ['bigquery', 'DATE_ADD(`order_date`, INTERVAL 3 MONTH)'],
            ['snowflake', 'DATEADD(MONTH, 3, "order_date")'],
            ['databricks', 'ADD_MONTHS(`order_date`, 3)'],
            ['clickhouse', 'addMonths("order_date", 3)'],
        ] as const)('%s → %s', (dialect, expected) => {
            expect(
                compile('=DATE_ADD(order_date, 3, "month")', {
                    dialect,
                    columns,
                }),
            ).toBe(expected);
        });

        it.each([
            ['day', 'DATE_ADD(`order_date`, 1)'],
            ['week', 'DATE_ADD(`order_date`, (1) * 7)'],
            ['month', 'ADD_MONTHS(`order_date`, 1)'],
            ['quarter', 'ADD_MONTHS(`order_date`, (1) * 3)'],
            ['year', 'ADD_MONTHS(`order_date`, (1) * 12)'],
        ] as const)(
            'Databricks fans out "%s" to a unit-specific helper',
            (unit, expected) => {
                expect(
                    compile(`=DATE_ADD(order_date, 1, "${unit}")`, {
                        dialect: 'databricks',
                        columns,
                    }),
                ).toBe(expected);
            },
        );

        it('DATE_SUB desugars to DATE_ADD with negated n (Postgres)', () => {
            expect(
                compile('=DATE_SUB(order_date, 3, "month")', {
                    dialect: 'postgres',
                    columns,
                }),
            ).toBe(`("order_date" + ((-(3))) * INTERVAL '1 month')`);
        });

        it('DATE_SUB threads through Snowflake DATEADD', () => {
            expect(
                compile('=DATE_SUB(order_date, 3, "month")', {
                    dialect: 'snowflake',
                    columns,
                }),
            ).toBe('DATEADD(MONTH, (-(3)), "order_date")');
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

    describe('defaultOrderBy', () => {
        // defaultOrderBy backfills the OVER clause ORDER BY when the formula
        // has none. Callers pass their containing query's visual sort order so
        // `LAG(x)` picks the row rendered immediately above the current one —
        // and so BigQuery/Snowflake accept analytic functions that reject a
        // bare `OVER ()`.

        it('injects ORDER BY into LAG when formula has no explicit ordering', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe('LAG(`revenue`) OVER (ORDER BY `order_date` DESC)');
        });

        it('respects user ORDER BY when formula has one, ignoring defaultOrderBy', () => {
            expect(
                compile('=LAG(revenue, ORDER BY region)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe('LAG("revenue") OVER (ORDER BY "region")');
        });

        it('combines user PARTITION BY with default ORDER BY', () => {
            expect(
                compile('=LAG(revenue, PARTITION BY region)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'ASC' }],
                }),
            ).toBe(
                'LAG("revenue") OVER (PARTITION BY "region" ORDER BY "order_date" ASC)',
            );
        });

        it('emits multiple default sort columns in order, each with its direction', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [
                        { column: 'order_date', direction: 'DESC' },
                        { column: 'region', direction: 'ASC' },
                    ],
                }),
            ).toBe(
                'LAG("revenue") OVER (ORDER BY "order_date" DESC, "region" ASC)',
            );
        });

        it('omits direction when not set', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [{ column: 'order_date' }],
                }),
            ).toBe('LAG("revenue") OVER (ORDER BY "order_date")');
        });

        it('is a no-op when defaultOrderBy is empty', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'postgres',
                    columns,
                    defaultOrderBy: [],
                }),
            ).toBe('LAG("revenue") OVER ()');
        });

        it('applies to other window functions that need an order (ROW_NUMBER, FIRST, RUNNING_TOTAL)', () => {
            expect(
                compile('=ROW_NUMBER()', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe('ROW_NUMBER() OVER (ORDER BY `order_date` DESC)');

            expect(
                compile('=FIRST(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe(
                'FIRST_VALUE(`revenue`) OVER (ORDER BY `order_date` DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );

            expect(
                compile('=RUNNING_TOTAL(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'ASC' }],
                }),
            ).toBe(
                'SUM(`revenue`) OVER (ORDER BY `order_date` ASC ROWS UNBOUNDED PRECEDING)',
            );
        });

        it('does not touch `OVER ()` emitted by renderAggregate (aggregate whole-result wrapping is intentionally unordered)', () => {
            expect(
                compile('=SUM(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    renderAggregate: (inner) => `${inner} OVER ()`,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe('SUM(`revenue`) OVER ()');
        });

        it('quotes default sort columns using the dialect — BigQuery backticks', () => {
            expect(
                compile('=LAG(revenue)', {
                    dialect: 'bigquery',
                    columns,
                    defaultOrderBy: [
                        {
                            column: 'organizations_daily_date_day',
                            direction: 'DESC',
                        },
                    ],
                }),
            ).toBe(
                'LAG(`revenue`) OVER (ORDER BY `organizations_daily_date_day` DESC)',
            );
        });

        it('flows through dialect LAG hooks — Redshift 3-arg COALESCE wrapper still gets the default order', () => {
            // Redshift's generateLagLead rewrites to COALESCE(LAG(a, b), default);
            // the inner LAG should still pick up the default ORDER BY.
            expect(
                compile('=LAG(revenue, 1, 0)', {
                    dialect: 'redshift',
                    columns,
                    defaultOrderBy: [{ column: 'order_date', direction: 'DESC' }],
                }),
            ).toBe(
                'COALESCE(LAG("revenue", 1) OVER (ORDER BY "order_date" DESC), 0)',
            );
        });
    });
});
