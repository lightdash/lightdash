const P = require.resolve('@google-cloud/bigquery');
const { BigQuery, BigQueryDate, BigQueryTimestamp, BigQueryDatetime, BigQueryTime } = require(P);
const { performance, monitorEventLoopDelay } = require('perf_hooks');
const { pipeline, Transform, Readable, PassThrough } = require('stream');
const { AsyncLocalStorage } = require('async_hooks');
const N = Number(process.env.N || 10000), TS = Number(process.env.TS || 20), INT = Number(process.env.INT||4), STR = Number(process.env.STR||1);
const YIELD_EVERY = Number(process.env.YIELD_EVERY || 0);
const fields = [];
for (let i=0;i<INT;i++) fields.push({name:`n${i}`, type:'INTEGER', mode:'NULLABLE'});
for (let i=0;i<TS;i++) fields.push({name:`t${i}`, type:'TIMESTAMP', mode:'NULLABLE'});
for (let i=0;i<STR;i++) fields.push({name:`s${i}`, type:'STRING', mode:'NULLABLE'});
const schema = {fields};
const base = 1794398400000000n;
const rowsRaw=[]; for (let r=0;r<N;r++){ const f=[]; for(let i=0;i<INT;i++) f.push({v:String(r*7+i)}); for(let i=0;i<TS;i++) f.push({v:String(base+BigInt(r*1000003+i*977))}); for(let i=0;i<STR;i++) f.push({v:`order-${r}`}); rowsRaw.push({f}); }
const body = JSON.stringify({rows: rowsRaw, schema});
const isT = (c)=> c instanceof BigQueryDate || c instanceof BigQueryTimestamp || c instanceof BigQueryDatetime || c instanceof BigQueryTime;
const parseCell = (cell)=>{ if (cell===undefined||cell===null||typeof cell==='boolean'||typeof cell==='number') return cell; if (isT(cell)) return new Date(cell.value); return `${cell}`; };
const parseRow = (row)=>Object.fromEntries(Object.entries(row).map(([n,v])=>[n,parseCell(v)]));
async function writeWithBackpressure(stream, data){ const ok = stream.write(data); if(!ok) await new Promise(r=>stream.once('drain', r)); }
const als = new AsyncLocalStorage(); const als2 = new AsyncLocalStorage();

async function run() {
  let maxGap = 0, last = performance.now(), ticks = 0;
  const iv = setInterval(()=>{ const n=performance.now(); maxGap=Math.max(maxGap, n-last); last=n; ticks++; }, 10);
  await new Promise(r=>setTimeout(r,100)); maxGap = 0; last = performance.now();
  const passThrough = new PassThrough({ highWaterMark: 16*1024*1024 });
  let consumed = 0;
  const consumer = (async()=>{ for await (const c of passThrough) consumed += c.length; })();
  const write = async (rows) => { for await (const row of rows) { await writeWithBackpressure(passThrough, `${JSON.stringify(row)}\n`); } };
  let unpivoted = {};
  const transformRows = async (rows, f) => { if (!Object.keys(unpivoted).length) unpivoted = Object.fromEntries(Object.keys(rows[0]).map(k=>[k,{reference:k}])); await write(rows); };
  const t0 = performance.now();
  // simulate HTTP response arrival as one I/O callback (setImmediate ~ poll phase callback)
  await new Promise(r=>setImmediate(r));
  const resp = JSON.parse(body);
  const merged = BigQuery.mergeSchemaWithRows_(schema, resp.rows, {wrapIntegers:false, parseJSON:false, listParams:{'formatOptions.useInt64Timestamp':true}});
  const tMerge = performance.now()-t0;
  // paginator ResourceStream pushes every row of the page into the readable in a loop
  const src = new Readable({ objectMode: true, read(){} });
  for (const r of merged) src.push(r); src.push(null);
  let i = 0;
  await als.run({a:1}, () => als2.run({b:2}, () => new Promise((resolve, reject) => {
    pipeline(src, new Transform({ objectMode: true, async transform(chunk, _e, cb) { try { const p = parseRow(chunk); await transformRows([p], schema); if (YIELD_EVERY && (++i % YIELD_EVERY === 0)) await new Promise(r=>setImmediate(r)); cb(); } catch (e) { cb(e); } } }), (err)=> err?reject(err):resolve());
  })));
  const tAll = performance.now()-t0;
  passThrough.end(); await consumer;
  await new Promise(r=>setTimeout(r,50));
  clearInterval(iv);
  console.log(`N=${N} TS=${TS} yieldEvery=${YIELD_EVERY} parse+merge=${tMerge.toFixed(0)}ms total=${tAll.toFixed(0)}ms maxEventLoopGap=${maxGap.toFixed(0)}ms bytes=${consumed}`);
}
(async()=>{ for (let k=0;k<3;k++) await run(); })();
