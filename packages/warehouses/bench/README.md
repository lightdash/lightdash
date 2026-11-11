# Result pipeline benchmark

Run from the repository root with Node 24:

```sh
pnpm -F warehouses build
node packages/warehouses/bench/result-pipeline.cjs
```

The fixture has 10,000 rows, 20 TIMESTAMP columns, four INTEGER columns and one
STRING column. This adapts the supplied `pipeline.js` and `bench.js` harnesses.
The fixture, BigQuery SDK conversion options, cell conversion, JSONL formatting,
16 MiB output buffer and two AsyncLocalStorage contexts match those harnesses.

The baseline converts one 10,000-row response and calls the writer for each row.
The changed path simulates separate response arrivals for each page, uses the
real built `createRowBatchWriter`, and loads the real backend `createJsonlWriter`
with Node's type stripper. A continuous setImmediate probe measures the longest
event-loop turn, including SDK conversion, row conversion and output writes.
Output bytes and SHA-256 are printed for each run. Fixture creation and module
loading are outside the timed region. One warm-up run precedes three interleaved
runs per configuration. The output consumer hashes the bytes in both paths.

Measured on Linux x64, Node 24.22.1. The box also runs other workloads, so timings
vary. Medians below exclude the labelled first warm-up run. The longest turn
column reports the worst of the three measured runs.

| Path | Page rows | Longest turn (ms) | Median total (ms) | Median rows/s |
| --- | ---: | ---: | ---: | ---: |
| Before | 10,000 | 2454.6 | 1736.7 | 5758 |
| After | 500 | 201.8 | 1652.4 | 6052 |
| After | 250 | 92.0 | 1560.9 | 6406 |
| After | 100 | 25.7 | 1698.5 | 5888 |

Use 100 rows per BigQuery page. It keeps the measured warmed turns below 50 ms;
250 and 500 rows exceed that target. Throughput increases by 2.3% against the
baseline median. All configurations produce 7,132,537 bytes with SHA-256
`03e5abdaf3beaf559d2592e20fd22b494b0b615042d0c05184079c9a05455f16`.
The first cold warm-up takes 4475.1 ms with a 77.1 ms longest turn.
The unmodified supplied pipeline, with only its SDK path changed, reports total
1558 ms and longest timer gap 1558 ms at the median of three runs on this box.

The probe includes garbage collection and OS scheduling. A 20 ms cooperative
budget cannot interrupt a single row conversion, SDK page conversion, or GC.
This is a CPU and in-memory pipeline benchmark. It does not measure remote API
latency or quotas. Smaller pages increase API request count, so remote export
throughput can differ from these results. The fixture is fully allocated only
in the benchmark; the application retains a page, a batch of at most 100 rows,
and the stream buffers, rather than the full result.

BigQuery's generic streaming paginator treats `maxResults` as a total limit.
The application instead requests pages with `autoPaginate: false` and follows
all returned page tokens. The multi-page unit test includes an empty page with
a continuation token to guard against truncation.
