import {
    getErrorMessage,
    isExploreError,
    preAggregateMaterialization,
    QueryExecutionContext,
    type Explore,
    type PreAggregateDef,
    type WarehouseClient,
    type WarehouseResults,
} from '@lightdash/common';
import * as path from 'path';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { compile, type CompileHandlerOptions } from './compile';
import { getDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

type PreAggregateCheckExternalOptions = CompileHandlerOptions & {
    model: string | undefined;
    name: string | undefined;
    all: boolean;
    json: boolean;
    sql: boolean;
    failOnMismatch: boolean;
};

type ColumnCheckStatus = 'match' | 'type_mismatch' | 'missing';

type ColumnCheck = {
    name: string;
    role: string;
    expectedType: string | null;
    actualType: string | null;
    status: ColumnCheckStatus | null; // null when no live table to check against
};

type CheckResult = {
    model: string;
    name: string;
    table: string | null;
    sql: string | null;
    columns: ColumnCheck[];
    extraColumns: { name: string; type: string; didYouMean: string | null }[];
    tableError: string | null;
    error: string | null;
};

const CLI_QUERY_TAGS = { query_context: QueryExecutionContext.CLI };

const probeShape = async (
    warehouseClient: WarehouseClient,
    sql: string,
): Promise<WarehouseResults['fields']> => {
    let fields: WarehouseResults['fields'] = {};
    await warehouseClient.streamQuery(
        sql,
        ({ fields: streamedFields }) => {
            if (Object.keys(streamedFields).length > 0) {
                fields = streamedFields;
            }
        },
        { tags: CLI_QUERY_TAGS },
    );
    return fields;
};

const editDistance = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => {
        const row = Array.from({ length: b.length + 1 }, () => 0);
        row[0] = i;
        return row;
    });
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
    }
    return dp[a.length][b.length];
};

const describeRole = (
    column: preAggregateMaterialization.MaterializationColumn,
): string => {
    switch (column.role) {
        case preAggregateMaterialization.MaterializationColumnRole
            .TIME_DIMENSION:
            return `time dimension (${column.granularity?.toLowerCase()})`;
        case preAggregateMaterialization.MaterializationColumnRole.METRIC:
            return `metric (${column.aggregation})`;
        case preAggregateMaterialization.MaterializationColumnRole
            .METRIC_COMPONENT:
            return 'metric component';
        case preAggregateMaterialization.MaterializationColumnRole.DIMENSION:
        default:
            return 'dimension';
    }
};

const checkPreAggregate = async ({
    explore,
    preAggregateDef,
    warehouseClient,
}: {
    explore: Explore;
    preAggregateDef: PreAggregateDef;
    warehouseClient: WarehouseClient;
}): Promise<CheckResult> => {
    const base: CheckResult = {
        model: explore.name,
        name: preAggregateDef.name,
        table: preAggregateDef.table ?? null,
        sql: null,
        columns: [],
        extraColumns: [],
        tableError: null,
        error: null,
    };

    let rendered: preAggregateMaterialization.MaterializationSql;
    try {
        rendered = preAggregateMaterialization.renderMaterializationSql({
            sourceExplore: explore,
            preAggregateDef,
            warehouseSqlBuilder: warehouseClient,
        });
    } catch (e) {
        return { ...base, error: getErrorMessage(e) };
    }
    base.sql = rendered.sql;

    // LIMIT 0 probe: proves the generated SQL is valid on this warehouse and
    // returns the expected column types without running the aggregation
    let expectedFields: WarehouseResults['fields'];
    try {
        expectedFields = await probeShape(
            warehouseClient,
            `SELECT * FROM (\n${rendered.sql}\n) AS ld_shape_probe LIMIT 0`,
        );
    } catch (e) {
        return {
            ...base,
            error: `Generated materialization SQL failed against the warehouse: ${getErrorMessage(
                e,
            )}`,
        };
    }

    let actualFields: WarehouseResults['fields'] | null = null;
    if (preAggregateDef.table) {
        try {
            actualFields = await probeShape(
                warehouseClient,
                `SELECT * FROM ${preAggregateDef.table} AS ld_shape_probe LIMIT 0`,
            );
        } catch (e) {
            base.tableError = getErrorMessage(
                warehouseClient.parseError(
                    e instanceof Error ? e : new Error(getErrorMessage(e)),
                ),
            );
        }
    }

    base.columns = rendered.columns.map((column) => {
        const expectedType = expectedFields[column.name]?.type ?? null;
        const actualType = actualFields?.[column.name]?.type ?? null;
        let status: ColumnCheckStatus | null = null;
        if (actualFields) {
            if (actualType === null) {
                status = 'missing';
            } else if (expectedType !== null && actualType !== expectedType) {
                status = 'type_mismatch';
            } else {
                status = 'match';
            }
        }
        return {
            name: column.name,
            role: describeRole(column),
            expectedType,
            actualType,
            status,
        };
    });

    if (actualFields) {
        const expectedNames = new Set(base.columns.map((c) => c.name));
        const missingNames = base.columns
            .filter((c) => c.status === 'missing')
            .map((c) => c.name);
        base.extraColumns = Object.entries(actualFields)
            .filter(([name]) => !expectedNames.has(name))
            .map(([name, { type }]) => {
                const closest = missingNames
                    .map((candidate) => ({
                        candidate,
                        distance: editDistance(name, candidate),
                    }))
                    .sort((a, b) => a.distance - b.distance)[0];
                return {
                    name,
                    type,
                    didYouMean:
                        closest &&
                        closest.distance <=
                            Math.max(
                                3,
                                Math.floor(closest.candidate.length / 4),
                            )
                            ? closest.candidate
                            : null,
                };
            });
    }

    return base;
};

const hasMismatch = (result: CheckResult): boolean =>
    result.error !== null ||
    result.tableError !== null ||
    result.columns.some((column) => column.status === 'missing');

const renderHuman = (result: CheckResult, log: (line: string) => void) => {
    const tableLabel = result.table
        ? ` → ${result.table}`
        : ` ${styles.secondary('(no table: declared — expected shape only)')}`;
    log('');
    log(`${styles.bold(`${result.model} / ${result.name}`)}${tableLabel}`);

    if (result.error) {
        log(`  ${styles.error('✗')} ${result.error}`);
        return;
    }

    if (result.tableError) {
        log(
            `  ${styles.warning('⚠')} Could not introspect declared table: ${
                result.tableError
            }`,
        );
    }

    const nameWidth = Math.max(
        ...result.columns.map((c) => c.name.length),
        'EXPECTED'.length,
    );
    const typeWidth = Math.max(
        ...result.columns.map((c) => (c.expectedType ?? '').length),
        'TYPE'.length,
    );
    const roleWidth = Math.max(
        ...result.columns.map((c) => c.role.length),
        'ROLE'.length,
    );

    log('');
    log(
        `  ${'EXPECTED'.padEnd(nameWidth)}  ${'TYPE'.padEnd(
            typeWidth,
        )}  ${'ROLE'.padEnd(roleWidth)}${
            result.columns.some((c) => c.status !== null) ? '  ACTUAL' : ''
        }`,
    );
    result.columns.forEach((column) => {
        let actual = '';
        switch (column.status) {
            case 'match':
                actual = `  ${styles.success('✓')} ${column.actualType}`;
                break;
            case 'type_mismatch':
                actual = `  ${styles.warning('⚠')} ${
                    column.actualType
                } ${styles.secondary(`(expected ${column.expectedType})`)}`;
                break;
            case 'missing':
                actual = `  ${styles.error('✗')} missing`;
                break;
            default:
                break;
        }
        log(
            `  ${column.name.padEnd(nameWidth)}  ${(
                column.expectedType ?? '?'
            ).padEnd(typeWidth)}  ${column.role.padEnd(roleWidth)}${actual}`,
        );
    });

    result.extraColumns.forEach((extra) => {
        const hint = extra.didYouMean
            ? styles.secondary(` — did you mean "${extra.didYouMean}"?`)
            : '';
        log(
            `  ${extra.name} ${styles.secondary(
                `(${extra.type})`,
            )} ${styles.warning('unmatched actual column')}${hint}`,
        );
    });

    log('');
    if (result.columns.some((c) => c.status !== null)) {
        const missingCount = result.columns.filter(
            (c) => c.status === 'missing',
        ).length;
        const matchCount = result.columns.length - missingCount;
        if (missingCount > 0) {
            log(
                `  ${styles.error('✗')} ${missingCount} missing column${
                    missingCount === 1 ? '' : 's'
                }. Rebuild ${result.table} with the SQL below, then re-run.`,
            );
        } else {
            log(
                `  ${styles.success('✓')} Table matches — ${matchCount}/${
                    result.columns.length
                } columns.`,
            );
        }
    } else if (!result.tableError) {
        log(
            `  ${styles.secondary(
                'No live table checked — showing expected shape and SQL only.',
            )}`,
        );
    }
};

export const preAggregateCheckExternalHandler = async (
    options: PreAggregateCheckExternalOptions,
) => {
    GlobalState.setVerbose(options.verbose);

    if (!options.all && (!options.model || !options.name)) {
        console.error(
            styles.error(
                'Specify --model <model> and --name <pre-aggregate-name>, or --all for every external pre-aggregate.',
            ),
        );
        process.exit(1);
    }

    const dbtVersion = await getDbtVersion();
    if (dbtVersion.isDbtCloudCLI) {
        console.error(
            styles.error(
                'pre-aggregate-check-external needs direct warehouse access and does not support the dbt Cloud CLI.',
            ),
        );
        process.exit(1);
    }

    const explores = await compile(options);
    const validExplores = explores.filter(
        (explore): explore is Explore => !isExploreError(explore),
    );

    const targets: { explore: Explore; preAggregateDef: PreAggregateDef }[] =
        [];
    if (options.all) {
        validExplores.forEach((explore) => {
            (explore.preAggregates ?? []).forEach((preAggregateDef) => {
                if (preAggregateDef.table) {
                    targets.push({ explore, preAggregateDef });
                }
            });
        });
        if (targets.length === 0) {
            console.error(
                styles.warning(
                    'No external pre-aggregates (with a `table:` key) found in the project.',
                ),
            );
            return;
        }
    } else {
        const explore = validExplores.find(
            (candidate) => candidate.name === options.model,
        );
        if (!explore) {
            console.error(
                styles.error(`Model "${options.model}" not found in project.`),
            );
            process.exit(1);
        }
        const preAggregateDef = (explore.preAggregates ?? []).find(
            (candidate) => candidate.name === options.name,
        );
        if (!preAggregateDef) {
            console.error(
                styles.error(
                    `Pre-aggregate "${options.name}" not found on model "${
                        options.model
                    }". Available: ${(explore.preAggregates ?? [])
                        .map((candidate) => candidate.name)
                        .join(', ')}`,
                ),
            );
            process.exit(1);
        }
        targets.push({ explore, preAggregateDef });
    }

    const dbtContext = await getDbtContext({
        projectDir: path.resolve(options.projectDir),
        targetPath: options.targetPath,
    });
    const { warehouseClient } = await getWarehouseClient({
        isDbtCloudCLI: false,
        profilesDir: options.profilesDir,
        profile: options.profile || dbtContext.profileName,
        target: options.target,
        startOfWeek: options.startOfWeek,
    });

    const results: CheckResult[] = [];
    // Sequential on purpose: one warehouse connection, readable progress
    for await (const target of targets) {
        results.push(
            await checkPreAggregate({
                explore: target.explore,
                preAggregateDef: target.preAggregateDef,
                warehouseClient,
            }),
        );
    }

    // --sql keeps stdout machine-readable; humans read stderr
    const log = options.sql
        ? (line: string) => console.error(line)
        : (line: string) => console.log(line);

    if (options.json) {
        console.log(
            JSON.stringify(options.all ? results : results[0], null, 2),
        );
    } else {
        results.forEach((result) => {
            renderHuman(result, log);
            if (result.sql && !options.sql) {
                log('');
                log(
                    `  Materialization SQL (${warehouseClient.getAdapterType()}):`,
                );
                log('');
                log(
                    result.sql
                        .split('\n')
                        .map((line) => `  ${line}`)
                        .join('\n'),
                );
            }
        });
        if (options.sql) {
            results.forEach((result) => {
                if (result.sql) {
                    if (results.length > 1) {
                        console.log(`-- ${result.model} / ${result.name}`);
                    }
                    console.log(result.sql);
                }
            });
        }
    }

    if (options.failOnMismatch && results.some(hasMismatch)) {
        process.exit(1);
    }
};
