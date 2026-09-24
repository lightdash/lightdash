import { Pool } from 'pg';
import { z } from 'zod';

// The backend's local connection: DATABASE_URL when set, else the PG* env vars.
export const createPool = () =>
    new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

/** Reads rows and validates them, so a column's type is asserted, not assumed. */
export const queryRows = async <T extends z.ZodType>(
    pool: Pool,
    sql: string,
    params: unknown[],
    row: T,
): Promise<z.output<T>[]> => {
    const result = await pool.query(sql, params);
    const parsed = z.array(row).safeParse(result.rows);
    if (!parsed.success) {
        throw new Error(
            `Rows do not match the expected shape\n${z.prettifyError(parsed.error)}\nSQL: ${sql}`,
        );
    }
    return parsed.data;
};
