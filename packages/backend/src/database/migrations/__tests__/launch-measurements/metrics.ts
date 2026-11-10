import { type Knex } from 'knex';
import assert from 'node:assert/strict';

export type Sample = {
    ms: number;
    statements: number;
    reads: number;
    rows: number;
    readBytes: number;
    responseBytes: number;
    sql: Record<
        string,
        { count: number; rows: number; bytes: number; tables: string[] }
    >;
};
export const byteSize = (value: unknown) =>
    Buffer.byteLength(
        JSON.stringify(value, (_key, item: unknown) =>
            typeof item === 'bigint' ? item.toString() : item,
        ) ?? '',
    );
export const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
        median:
            sorted.length % 2
                ? sorted[middle]
                : (sorted[middle - 1] + sorted[middle]) / 2,
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
};
export const measure = async <T>(
    database: Knex,
    operation: () => Promise<T>,
    prepare: () => Promise<unknown> = async () => {},
) => {
    await prepare();
    const sample: Sample = {
        ms: 0,
        statements: 0,
        reads: 0,
        rows: 0,
        readBytes: 0,
        responseBytes: 0,
        sql: {},
    };
    const query = ({ sql }: { sql: string }) => {
        sample.statements += 1;
        if (/^\s*(select|with)\b/i.test(sql)) sample.reads += 1;
        const normalized = sql
            .replace(/\$(\d+)/g, '?')
            .replace(/\?(, \?)+/g, '?…');
        sample.sql[normalized] ??= {
            count: 0,
            rows: 0,
            bytes: 0,
            tables: [
                ...new Set(
                    [
                        ...sql.matchAll(
                            /(?:from|join|update|into)\s+"([^"\s]+)"/gi,
                        ),
                    ].map((match) => match[1]),
                ),
            ],
        };
        sample.sql[normalized].count += 1;
    };
    let listenerError: unknown;
    const response = (
        value: unknown,
        { sql, method }: { sql: string; method: string },
    ) => {
        try {
            if (!/^\s*(select|with)\b/i.test(sql)) return;
            let rows: unknown[] = [];
            if (method === 'raw') rows = (value as { rows: unknown[] }).rows;
            else if (Array.isArray(value)) rows = value;
            else if (value !== undefined) rows = [value];
            const bytes = byteSize(rows);
            const normalized = sql
                .replace(/\$(\d+)/g, '?')
                .replace(/\?(, \?)+/g, '?…');
            sample.rows += rows.length;
            sample.readBytes += bytes;
            sample.sql[normalized].rows += rows.length;
            sample.sql[normalized].bytes += bytes;
        } catch (error) {
            listenerError = error;
        }
    };
    database.on('query', query);
    database.on('query-response', response);
    const start = performance.now();
    try {
        const value = await operation();
        if (listenerError) throw listenerError;
        sample.ms = performance.now() - start;
        sample.responseBytes = byteSize(value);
        return { value, sample };
    } finally {
        database.removeListener('query', query);
        database.removeListener('query-response', response);
    }
};
export const summarize = (samples: Sample[]) => {
    assert(samples.length > 0);
    const signature = (sample: Sample) =>
        JSON.stringify({
            statements: sample.statements,
            reads: sample.reads,
            rows: sample.rows,
            sql: Object.fromEntries(
                Object.entries(sample.sql)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([sql, group]) => [
                        sql,
                        { count: group.count, rows: group.rows },
                    ]),
            ),
        });
    assert(
        samples.every((sample) => signature(sample) === signature(samples[0])),
        'SQL counts changed within a scenario',
    );
    return {
        runs: samples.length,
        ms: stats(samples.map((sample) => sample.ms)),
        statements: samples[0].statements,
        reads: samples[0].reads,
        rows: samples[0].rows,
        readBytes: stats(samples.map((sample) => sample.readBytes)),
        responseBytes: stats(samples.map((sample) => sample.responseBytes)),
        sql: samples[0].sql,
    };
};
export type Measurement = ReturnType<typeof summarize>;
export const repeat = async <T>(
    database: Knex,
    count: number,
    operation: () => Promise<T>,
    prepare: () => Promise<unknown> = async () => {},
) => {
    await operation();
    await operation();
    const samples: Sample[] = [];
    for await (const _ of Array.from({ length: count }))
        samples.push((await measure(database, operation, prepare)).sample);
    return summarize(samples);
};
