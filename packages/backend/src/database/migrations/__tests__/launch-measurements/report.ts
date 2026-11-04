import { type Results } from './launch.measurement';
import { type Measurement } from './metrics';

const number = (value: number) => value.toFixed(2);
const duration = (measurement: Measurement) =>
    `${number(measurement.ms.median)} (${number(measurement.ms.min)}–${number(measurement.ms.max)})`;
const table = (headers: string[], rows: (string | number)[][]) =>
    `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;

const growth = (data: Results) => {
    const small = data.B.find((row) => row.projects === 50);
    const large = data.B.find((row) => row.projects === 500);
    if (!small || !large)
        return 'Run all default sizes for the growth comparison.';
    const smallA = data.A.find(
        (row) => row.projects === 50 && row.credential === 'connection',
    )!;
    const largeA = data.A.find(
        (row) => row.projects === 500 && row.credential === 'connection',
    )!;
    const narrow = data.A.find(
        (row) => row.credential === 'connection-fixed-person-control',
    )!;
    const listOne = large.list.find(
        (row) => row.connections === 1,
    )?.measurement;
    const listMany = large.list.find(
        (row) => row.connections === 50,
    )?.measurement;
    const firstC = data.C[0];
    const lastC = data.C[data.C.length - 1];
    const firstD = data.D.find((row) => row.mode === 'buffered');
    const lastD = data.D.filter((row) => row.mode === 'buffered').at(-1);
    return `- A: the connection request uses ${smallA.measurement.reads} reads / ${smallA.measurement.rows} returned rows with 50 person projects and ${largeA.measurement.reads} reads / ${largeA.measurement.rows} rows with 500. Holding the person at 500 projects, the one-project grant uses ${narrow.measurement.reads} reads / ${narrow.measurement.rows} rows versus ${largeA.measurement.reads} reads / ${largeA.measurement.rows} for the 500-project grant. SQL count is constant; fresh-person rows grow with memberships and grant bytes grow with selection.\n- B approval: ${small.approval.total.reads} reads at 50 projects and ${large.approval.total.reads} at 500; returned rows grow from ${small.approval.total.rows} to ${large.approval.total.rows}. The query count is ${small.approval.total.reads === large.approval.total.reads ? 'constant' : 'size-dependent'} in these runs.\n- B status: ${small.status.reads} reads at 50 and ${large.status.reads} at 500. Status repeats policy checks for each approved project and capability; its read count grows linearly for this fixed three-capability shape. Returned rows grow from ${small.status.rows} to ${large.status.rows}: every repeated role lookup returns all of the person's project memberships. This is quadratic in N when both the selection and the person's memberships grow to N; more generally the repeated membership rows grow with selected projects times person memberships times capabilities.\n- B storage: constraints text grows from ${small.grantBytes.constraints_text} bytes at 50 to ${large.grantBytes.constraints_text} at 500. Logical size is linear in project selection; PostgreSQL compression changes stored datum growth.\n- B list: at 500 projects, one connection returns ${listOne?.responseBytes.median} response bytes with ${listOne?.reads} reads; 50 connections return ${listMany?.responseBytes.median} bytes with ${listMany?.reads} reads. Response bytes grow with projects times connections while read count stays fixed. request project resolution and list project naming both search an array for each selected project, giving a quadratic comparison bound when organization size grows with selection. The timings alone do not establish a quadratic runtime curve.\n- C: each stored-explore load returns ${firstC.load.rows} rows / ${firstC.load.readBytes.median} decoded bytes at ${firstC.explores} explores and ${lastC.load.rows} rows / ${lastC.load.readBytes.median} decoded bytes at ${lastC.explores}; returned rows and bytes are constant; database JSON inspection scales with explores.\n- D: buffered retained heap grows from ${firstD?.retainedHeapDelta} bytes at ${firstD?.explores} explores to ${lastD?.retainedHeapDelta} at ${lastD?.explores}. The helper retains the whole input array; the ordinary consumer receives its first explore after one production step, independent of total input size.`;
};

// Only what a reader needs to weigh the numbers; no host identifiers.
const environmentLines = (environment: Record<string, unknown>): string => {
    const operatingSystems: Record<string, string> = {
        Darwin: 'macOS',
        Linux: 'Linux',
        Windows_NT: 'Windows',
    };
    const osName = String(environment.os ?? '').split(' ')[0];
    const postgres = /PostgreSQL [0-9.]+/.exec(
        String(environment.postgres ?? ''),
    );
    return [
        ['CPU', environment.cpu],
        ['Logical CPUs', environment.logicalCpus],
        [
            'Memory',
            `${Math.round(Number(environment.memoryBytes) / 1024 ** 3)} GiB`,
        ],
        ['Operating system', operatingSystems[osName] ?? osName],
        ['Node', environment.node],
        ['Postgres', postgres ? postgres[0] : environment.postgres],
        ['Commit', environment.commit],
        ['Date', String(environment.date).slice(0, 10)],
        ['Warm-up runs excluded', environment.warmups],
        ['Approved actions', (environment.capabilities as string[]).join(', ')],
        ['Dimensions per explore', environment.dimensionsPerExplore],
        ['Metrics per explore', environment.metricsPerExplore],
        ['Stored explores per project', environment.baseExploresPerProject],
    ]
        .map(([label, value]) => `- ${label}: ${String(value)}`)
        .join('\n');
};

export const renderReport = (data: Results) => {
    const owner = data.B.filter((row) => [50, 200, 500].includes(row.projects));
    return `# Agent connection launch measurements

These measurements use synthetic data on a development machine. Database statement counts, returned rows and bytes are the primary results. Times are indicative. No credentials are issued by approval. The decision stores an approved selection; connection rows used here are created separately through the grant model.

${data.B.some((row) => row.projects === 500) ? `With three approved capabilities, a status call at 500 projects uses ${data.B.find((row) => row.projects === 500)!.status.reads.toLocaleString('en-US')} read statements and returns ${data.B.find((row) => row.projects === 500)!.status.rows.toLocaleString('en-US')} rows. The repeated role queries return all of the person's memberships for every selected project and capability. This gives quadratic returned-row growth when selection size and person membership count grow together.` : ''}

## What was measured on

${environmentLines(data.environment)}

The machine was under load from other work during the runs.

One organization, one active verified person with an organization member role and a developer role on every project, three groups with that person in all three, and a managed agent policy allowing all capabilities for developers and restricting use to those groups. Each measured connection selects Read and discover, Query, and Deploy and upload. Each project initially stores ten synthetic explores. Project counts increase within one temporary database; the person's memberships increase with them. The 500-project control holds the person constant and selects only one project in the connection. List scenarios contain exactly the stated number of active connections.

Each explore contains 40 dimensions by default and ten metrics, compiled SQL, labels and descriptions. This is a declared medium-width synthetic model, not a sample of production data. The exact generated JSON bytes appear below. UUID inputs and field shapes are deterministic; opaque grants, approval nonces and timestamps are generated by production methods. Two warm-ups are excluded before A/B and stored-load samples. A has at least 20 measured runs; B has at least ten.

Feature-flag lookup is stubbed to enable only agent identity. Group availability is enabled and custom-role licensing is disabled. Policy, person, group, project and grant reads use real models. EXPERIMENTAL_CACHE=true enables the user and PAT caches. The session cache is primed outside each measured interval, then session deserialization calls the real warm user cache; cookie parsing, session-store reads and expiry writes are excluded. PAT authentication and bearer authentication run through the registered middleware. The production controller and project-read service method handle GET /api/v1/projects/{projectUuid}. A query-style endpoint and warehouse execution are not measured. Bearer measurements wait for the real asynchronous last-used update before removing listeners, to keep that write with its request. Timings include listener bookkeeping and decoded-row serialization; integer bigint values are counted as decimal strings.

## Approval and status

Times are median milliseconds (minimum–maximum). Reads mean SELECT/WITH statements, including SELECT calls used to take advisory locks and reads inside transactions; they do not mean physical disk reads. Total statements also include transaction control and writes and are shown in the detailed table. Approval total is the sum of each request, review and decision for the same iteration. Stored bytes use PostgreSQL pg_column_size on the selected row and constraints. This excludes indexes, page overhead and MVCC history; whole-row size is a row datum measurement, not total table or TOAST relation disk usage.

${table(
    [
        'Projects',
        'Create request ms / reads',
        'Load review ms / reads',
        'Approve ms / reads',
        'Approval total ms / reads',
        'One status call ms / reads',
        'Stored connection bytes',
    ],
    owner.map((row) => [
        row.projects,
        ...['request', 'review', 'decision', 'total'].map(
            (key) =>
                `${duration(row.approval[key])} / ${row.approval[key].reads}`,
        ),
        `${duration(row.status)} / ${row.status.reads}`,
        row.grantBytes.whole_row,
    ]),
)}

All approval, status and list measurements drive the real registered HTTP routes using a short-lived loopback test server. Approval checks that the decision stores the selected projects. Status checks that all measured capabilities are allowed. List checks the exact returned connection count. Setup, cleanup and row-size probes are outside the measured intervals.

${table(
    [
        'Projects',
        'Stored constraints bytes',
        'Constraints JSON text bytes',
        'Stored row bytes',
        'Pending request row bytes',
        'Pending selected-project bytes',
    ],
    data.B.map((row) => [
        row.projects,
        row.grantBytes.constraints,
        row.grantBytes.constraints_text,
        row.grantBytes.whole_row,
        row.pendingBytes?.whole_row ?? 'refused',
        row.pendingBytes?.selected_projects ?? 'refused',
    ]),
)}

${table(
    [
        'Projects',
        'Action',
        'All statements',
        'Reads',
        'Returned read rows',
        'Read JSON bytes (median)',
        'Response JSON bytes (median)',
        'ms median (min–max)',
    ],
    data.B.flatMap((row) =>
        [...Object.entries(row.approval), ['status', row.status] as const].map(
            ([action, m]) => [
                row.projects,
                action,
                m.statements,
                m.reads,
                m.rows,
                m.readBytes.median,
                m.responseBytes.median,
                duration(m),
            ],
        ),
    ),
)}

${table(
    [
        'Projects',
        'Connections listed',
        'All statements / reads',
        'Returned read rows',
        'Response JSON bytes',
        'ms median (min–max)',
    ],
    data.B.flatMap((row) =>
        row.list.map(({ connections, measurement: m }) => [
            row.projects,
            connections,
            `${m.statements} / ${m.reads}`,
            m.rows,
            m.responseBytes.median,
            duration(m),
        ]),
    ),
)}

${data.overLimit.map((row) => `At ${row.projects} projects, the grant model refuses Invalid agent connection resource constraints (${row.grant.statements} SQL statements), and the HTTP approval request refuses too_many_projects (${row.approval.statements} SQL statements). No oversized stored grant or pending approval row exists, so status, list and storage are not measured above the limit.`).join('\n')}

### Repeated membership reads in status

${table(
    [
        'Selected projects and person memberships',
        'Membership query calls',
        'Membership rows returned',
        'Total status rows returned',
    ],
    data.B.map((row) => {
        const memberships = Object.values(row.status.sql).find(
            (group) =>
                group.tables.length === 3 &&
                group.tables.includes('project_memberships'),
        );
        return [
            row.projects,
            memberships?.count ?? 0,
            memberships?.rows ?? 0,
            row.status.rows,
        ];
    }),
)}

These are counted query responses, not an estimate of rows scanned. At N projects and three capabilities, this fixture runs the membership query 3N + 1 times and returns N rows each time: N × (3N + 1) membership rows. Status also repeats policy and other role reads. The raw JSON includes every normalized statement and its counts. This observation describes the measured role shape, not every organization configuration.

## A. Reads for one project request

${table(
    [
        'Person projects',
        'Connection projects',
        'Credential',
        'All statements / reads',
        'Returned read rows',
        'Read JSON bytes',
        'ms median (min–max)',
    ],
    data.A.map(({ projects, grantProjects, credential, measurement: m }) => [
        projects,
        grantProjects ?? '—',
        credential,
        `${m.statements} / ${m.reads}`,
        m.rows,
        m.readBytes.median,
        duration(m),
    ]),
)}

The bearer path reads the OAuth token, loads the person without the session cache, looks up the active grant, resolves the requested project, and reads agent policy and group eligibility. These are connection-path costs relative to the warm session. The PAT path uses its own warm cache and still loads the person's organization. SQL statements with their referenced tables, per-request counts, returned rows and serialized bytes are recorded under A[].measurement.sql in the raw JSON, without parameter bindings.

${data.A.filter(
    (row) =>
        row.projects === 500 &&
        row.credential !== 'connection-fixed-person-control',
)
    .map(
        (row) =>
            `### ${row.credential}, 500 person projects\n\n${table(
                [
                    'Tables referenced by statement',
                    'Count',
                    'Returned rows',
                    'Serialized bytes',
                ],
                Object.values(row.measurement.sql).map((group) => [
                    group.tables.join(', ') || 'transaction/control',
                    group.count,
                    group.rows,
                    group.bytes,
                ]),
            )}`,
    )
    .join('\n')}

## C. Stored-explore reads for the scheduled-refresh guard

${table(
    [
        'Explores',
        'Source JSON bytes total / mean',
        'Stored Postgres text bytes',
        'Summary statements / rows / decoded bytes',
        'Load ms median (min–max)',
        'Heap growth bytes median (min–max)',
    ],
    data.C.map((row) => [
        row.explores,
        `${row.sourceJsonBytes} / ${Math.round(row.sourceJsonBytes / row.explores)}`,
        row.databaseTextBytes,
        `${row.load.statements} / ${row.load.rows} / ${row.load.readBytes.median}`,
        duration(row.load),
        `${Math.round(row.heapGrowth.median)} (${row.heapGrowth.min}–${row.heapGrowth.max})`,
    ]),
)}

The load calls ProjectModel.getPreAggregateRefreshSummary against real cached_explore and registry rows. PostgreSQL text bytes describe the stored fixture; the query returns only three booleans. Decoded bytes serialize returned Knex rows as compact JSON, excluding protocol framing. Returned rows are not scanned rows. Heap growth is an allocation snapshot with GC before each sample, not a per-load peak. Timings exclude GC and include the result assertion.

${table(
    [
        'Explores',
        'Operation driven',
        'Stored-explore loads',
        'All SQL / reads',
        'Returned read rows',
        'ms (one trace)',
    ],
    data.C.flatMap((row) =>
        row.operations.map((op) => [
            row.explores,
            op.name,
            op.calls,
            `${op.measurement.statements} / ${op.measurement.reads}`,
            op.measurement.rows,
            number(op.measurement.ms.median),
        ]),
    ),
)}

Each guard calls one small summary statement. The stream preparation helper checks incoming content in memory, and final save reuses its checked stream without buffering it again. Default deploy uses one entry guard; parameter replacement keeps its own check.

Compile scheduling uses one summary. Service execution uses four: entry, before consuming the compile stream, parameter replacement, and final explore save. The scheduler wrapper is outside this harness and keeps one more check before STARTED. The earlier measured seven loads were eight in production; the new path uses six statements including scheduling and the worker wrapper. Registry synchronization at the downstream save sink remains a separate effective-cache read, not a guard read.

The harness runs the real orchestration and existing database project lock, parameter writes and table-group writes. It stubs compiler preparation, job records, queue delivery, YAML tags, manifest persistence, connection-effect authorization and the downstream save/index sink. Virtual-view create/update stop at a downstream stub after the guard. These timings exclude those costs and do not cover every multi-connection, preview, failure or parameter configuration. PostgreSQL still inspects every stored explore inside the database.

## D. Incoming compile stream memory

${table(
    [
        'Explores',
        'Path',
        'Source bytes',
        'Baseline heap / RSS bytes',
        'Peak sampled heap / RSS bytes',
        'Peak increase heap / RSS bytes',
        'Retained heap increase before consume',
        'Produced before first consume',
        'ms',
    ],
    data.D.map((row) => [
        row.explores,
        row.mode,
        row.sourceBytes,
        `${row.baselineHeap} / ${row.baselineRss}`,
        `${row.peakHeap} / ${row.peakRss}`,
        `${row.heapDelta} / ${row.rssDelta}`,
        row.retainedHeapDelta,
        row.producedBeforeFirstConsume,
        number(row.durationMs),
    ]),
)}

Each row runs in a fresh Vitest fork with explicit GC. A lazy generator creates the same explore shapes for both paths. The buffered arm calls the production prepareConnectionExploreStream method; its guard dependency is a no-op to isolate incoming-buffer memory from C's database loads. The ordinary arm passes the iterable directly to an identical consumer, as the production branch does. Samples are taken on each production and consumption step, not a continuous allocator trace. A GC after preparing the stream exposes retained incoming data before consumption. Neither dbt nor database persistence, compile orchestration, warehouse work or downstream buffering is included. Baseline includes imported backend modules. RSS reflects allocation retained by the runtime and can be noisy.

## What grows with what

${growth(data)}

## What the numbers do not show

This is not production hardware or a production-size sample. It excludes remote network latency, concurrent workload control, cold caches, real explore-size distributions and database query-plan scanned rows. Other work ran on the machine during these measurements, so times are indicative. Warm session-store costs and feature-flag resolution are excluded. Only three approved capabilities and one direct project role are modeled; other policy/role shapes can change the counts. C substitutes compiler and downstream sinks and stops virtual-view writes after their guard; D isolates one buffer helper, not whole-compile peak memory. PostgreSQL datum sizes do not measure total disk allocation.

## Re-run

From the repository root, with installed dependencies and built common, formula, warehouses and visualization packages:

\`\`\`sh
python3 packages/backend/src/database/migrations/__tests__/launch-measurements/run.py --json /absolute/path/results.json --markdown /absolute/path/results.md
\`\`\`

To compare a second clean run, add --compare /absolute/path/first-results.json with a different --json output. It fails if statement or returned-row counts differ and appends the comparison result to the report.

The launcher reads ldenv-pg's password in memory and uses its localhost:15432 server unless PGHOST is supplied. For another server set PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE. createMigratedDatabase creates and drops a uniquely named database cloned from the repository's migrated template. No existing application database is read or written. The template may need its initial migration build.

Sizes: MEASURE_PROJECT_SIZES=1,50,200,500,1000; MEASURE_LIST_SIZES=1,10,50; MEASURE_EXPLORE_SIZES=10,100,500,2000; MEASURE_COMPILE_SIZES=100,500,2000; MEASURE_DIMENSIONS=40. Repetitions: MEASURE_REQUEST_RUNS=20 and MEASURE_APPROVAL_RUNS=10 (do not lower these for a gate run). For the default sizes, expect about three minutes on this machine with the existing migrated template; initial migrations can take longer. Output includes six adjacent isolated-memory JSON files. The database phase took ${number(Number(data.environment.databasePhaseSeconds))} seconds; allow additional time for six fresh memory forks and initial migration setup.

The harness uses a dedicated measurement.config.ts and launch.measurement.ts under src/database/migrations/__tests__/launch-measurements. The backend production build excludes src/**/__tests__. Normal unit CI selects *.test.ts; schema-compatibility CI selects *.migration.integration.ts under migration folders and one explicitly named membership test. Neither selects this harness. Other integration configs also do not select *.measurement.ts. The launcher and measurement test both refuse CI=true. No package command or CI workflow changes are required.
`;
};
