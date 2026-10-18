// Shared helpers for the viz-unification QA tools: argument parsing, a
// cookie-session API client and async query polling. Node 20+, no deps.

export const parseArgs = (argv = process.argv.slice(2)) =>
    Object.fromEntries(
        argv.reduce((acc, arg, i, all) => {
            if (arg.startsWith('--')) {
                const next = all[i + 1];
                acc.push([arg.slice(2), next && !next.startsWith('--') ? next : true]);
            }
            return acc;
        }, []),
    );

export const requireArg = (args, name, envName) => {
    const value = args[name] ?? process.env[envName];
    if (!value) {
        process.stderr.write(`missing --${name} (or ${envName})\n`);
        process.exit(2);
    }
    return value;
};

export const createClient = (base) => {
    let cookie = '';
    const raw = async (method, path, body, version = 'v1') => {
        const res = await fetch(`${base}/api/${version}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(cookie ? { Cookie: cookie } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
            json = { raw: text };
        }
        return { status: res.status, headers: res.headers, json };
    };
    const api = async (method, path, body, version = 'v1') => {
        const { status, json } = await raw(method, path, body, version);
        if (status >= 400) {
            throw new Error(
                `${method} /api/${version}${path} -> ${status} ${JSON.stringify(json).slice(0, 500)}`,
            );
        }
        return json.results;
    };
    const login = (email, password) => api('POST', '/login', { email, password });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /** Polls an async query and returns { rows, page } with every row (pages of 2500, the API maximum). */
    const results = async (projectUuid, queryUuid, timeoutMs = 120000) => {
        const start = Date.now();
        const get = (n) =>
            api('GET', `/projects/${projectUuid}/query/${queryUuid}?page=${n}&pageSize=2500`, undefined, 'v2');
        while (Date.now() - start < timeoutMs) {
            const page = await get(1);
            if (page.status === 'ready') {
                const rows = [...page.rows];
                for (let n = 2; n <= (page.totalPageCount ?? 1); n += 1) {
                    rows.push(...(await get(n)).rows);
                }
                return { rows, page };
            }
            if (page.status === 'error' || page.status === 'expired' || page.status === 'cancelled') {
                throw new Error(`query ${queryUuid} ${page.status}: ${page.error ?? ''}`);
            }
            await sleep(250);
        }
        throw new Error(`query ${queryUuid} timed out`);
    };
    return { raw, api, login, results, sleep };
};

/** Raw values of a result row, whatever the row shape ({ field: { value: { raw } } } or plain). */
export const rawRow = (row) =>
    Object.fromEntries(
        Object.entries(row).map(([key, cell]) => [
            key,
            cell && typeof cell === 'object' && 'value' in cell ? cell.value.raw : cell,
        ]),
    );

/**
 * Sum of every numeric value in the columns that carry a measure, whatever the
 * result shape: the raw column (`amount`), the previous release's aggregated
 * and pivoted SQL chart columns (`amount_sum`, `amount_sum_completed`) and the
 * new field ids (`sql_amount`, `aggregated_amount_sum`,
 * `aggregated_amount_sum_any_completed`). With an aggregation only the
 * `<column>_<aggregation>` columns count.
 */
export const columnTotal = (rows, column, aggregation) => {
    const token = aggregation ? `${column}_${aggregation}` : column;
    const matches = (key) =>
        aggregation
            ? new RegExp(`(^|_)${token}(_|$)`).test(key)
            : key === column || key.endsWith(`_${column}`);
    return rows.map(rawRow).reduce((sum, row) => {
        Object.entries(row).forEach(([key, value]) => {
            if (!matches(key)) return;
            const n = Number(value);
            if (value !== null && value !== '' && Number.isFinite(n)) sum += n;
        });
        return sum;
    }, 0);
};

/** Repeated query parameters (`ids=a&ids=b`): the API does not split comma lists. */
export const repeatParam = (name, values) => values.map((v) => `${name}=${encodeURIComponent(v)}`).join('&');
