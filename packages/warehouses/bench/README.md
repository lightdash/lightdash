# Result pipeline benchmarks

The repeated review benchmark is in `review/`. Its raw samples and summary are
in `review/results/` and `review/RESULTS.md`. These replace the initial three-run
measurements. No sample is discarded. No statistical significance is claimed.

Run on Node 24 from the repository root:

```sh
node packages/warehouses/bench/review/pipeline.cjs
HEAD_REF=working node packages/warehouses/bench/review/pipeline.cjs
HEAD_REF=working LATENCY_MS=10 node packages/warehouses/bench/review/pipeline.cjs
node packages/warehouses/bench/review/herd-runner.cjs
node packages/warehouses/bench/review/summarize.cjs
```

`pipeline.original.cjs` is the supplied pipeline harness with only its SDK
module path made portable. `e3_herd.original.cjs` is the supplied herd harness
with only its nats module path made portable. The replay harness retains the
same 10,000-row fixture: 20 TIMESTAMP, four INTEGER and one STRING column.

`pipeline.cjs` reads the exact base and head source from Git, or the working
files with `HEAD_REF=working`. It loads the real stream utilities and S3 write
callback. It extracts the real BigQuery `streamResults` method and row
converters without loading the rest of the application. It drives an actual
BigQuery SDK Job with synthetic HTTP responses. SDK conversion runs as part of
the timed path, not before it. The baseline response contains 10,000 rows;
the head respects its source page-size constant. Page payloads are created
before timing, as responses would be received from the remote server.

The 16 MiB PassThrough buffer, two AsyncLocalStorage contexts, first-batch field
initialisation, backpressure, JSONL output and ordered SHA-256 check are the same
on both revisions. Each pair runs base then head, ten times, in one Node
process. Fixture creation and module loading are outside timing. End-to-end
stream time includes JSON parsing, SDK conversion, row conversion, writes and
output consumption. Each run has a fresh job, sink, hash and budget state.

The longest delay is the larger of a 1 ms `monitorEventLoopDelay` maximum and
a 1 ms interval's largest callback gap. The latter catches microtask starvation
that the histogram can miss. Both probes are armed before timing. Measurements
include garbage collection and host scheduling, so they bound observed
unresponsiveness rather than measuring CPU in one JavaScript function.
The raw JSON includes the histogram value separately. A continuous immediate
probe is deliberately avoided because it makes the loop spin between pages.

The SDK is 8.3.1 and Node is 24.22.1 on Linux x64. This shared box runs other
workloads. All samples, including cold runs and outliers, remain in the report.
The default synthetic transport has no network latency. `LATENCY_MS=10` adds a
10 ms response delay to every page on both revisions. This sensitivity check
is not a measurement of a remote warehouse.

The selected rework fetches 5,000 raw rows per page with `skipParsing: true`.
It invokes the same SDK converter on at most 64 raw rows at a time, then passes
them through the elapsed-time budget and existing row conversion. This avoids
one large synchronous SDK conversion without forcing tiny HTTP pages. The
10,000-row fixture needs two requests, rather than 100 on the reviewed head.
Memory holds one bounded page, small conversion batches and stream buffers.
One exceptionally large cell, JSON response parsing, GC or the OS can still
exceed the cooperative budget.

The unchanged herd control uses 50 fetch slots, 30 s expiries, 14 boundary
publications and 1,200 steady-load publications. It takes about 8.6 minutes per
run, or 2.9 hours for ten sequential base/head pairs. Each run uses a unique
stream and subject. It never loads application code, so revision labels do not
change its behaviour. Its lost-message and timer-drift numbers are controls,
not evidence that this PR fixes or changes NATS delivery. The harness does not
modify a worker or consumer used by the application.

The pipeline samples all emit 7,132,537 bytes with ordered SHA-256
`03e5abdaf3beaf559d2592e20fd22b494b0b615042d0c05184079c9a05455f16`.
These measurements concern the streaming path. They do not show that fetching
formatted result pages becomes more responsive.

Additional diagnostic blocks are retained, rather than selecting a favourable
block: `final-raw5000.jsonl` repeats the final source without affinity, and
`final-pinned8.jsonl` pins both revisions to CPU 8. The affinity run also records
process CPU time. Pinning is not CPU isolation: other workloads still use that
CPU. The box has 12 allowed CPUs and was busy during collection. The repeated
blocks show substantial wall-time spread; the affinity diagnostic includes a
head delay above 100 ms. Do not infer a hard bound or a statistically established
throughput improvement from these measurements. The report retains all blocks.
The unmodified herd results are kept outside Git while that long run proceeds.
Use `INCLUDE_HERD=1 RESULTS_OUTPUT=/tmp/result-report.md` with the summary command
to include them in a separate report without changing the committed results.

`api-identity.cjs` repeats a seeded Postgres wide-row query 24 times in three
rounds of eight. Pass a seeded preview URL as its sole argument. It checks
5,000 ordered rows per query and prints the exact JSONL byte length and hash.
It reads only synthetic warehouse data and uses the development seed PAT.
