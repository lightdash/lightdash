// No freeze. 50 slots started together (as production does), so their 30s fetches expire in lockstep.
// Phase A: single messages published around the herd expiry boundary. Phase B: steady load.
const { connect, AckPolicy, RetentionPolicy, StorageType, nanos, StringCodec } = require(require.resolve('nats', { paths: [require('node:path').resolve(__dirname, '../../../backend')] }));
const STREAM='HERD_TEST', SUBJECT='herd.jobs', DURABLE='worker-herd';
const sc = StringCodec(); const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
(async () => {
  const nc = await connect({ servers: 'localhost:14222' }); const pubNc = await connect({ servers: 'localhost:14222' });
  const jsm = await nc.jetstreamManager(); const js = nc.jetstream(); const pjs = pubNc.jetstream();
  await jsm.streams.delete(STREAM).catch(()=>{});
  await jsm.streams.add({ name: STREAM, subjects:[SUBJECT], retention: RetentionPolicy.Workqueue, storage: StorageType.Memory, num_replicas:1 });
  await jsm.consumers.add(STREAM, { durable_name: DURABLE, filter_subjects:[SUBJECT], ack_policy: AckPolicy.Explicit, ack_wait: nanos(30000), max_deliver: 1 });
  const consumer = await js.consumers.get(STREAM, DURABLE);
  let running = true; const handled = new Set(); let maxLag = 0, last = Date.now();
  const iv = setInterval(()=>{ const n=Date.now(); maxLag=Math.max(maxLag,n-last-20); last=n; },20);
  async function slot(){ while(running){ try { const messages = await consumer.fetch({ max_messages:1, expires: 30000 }); for await (const m of messages) { handled.add(sc.decode(m.data)); await sleep(30); m.ack(); } } catch(e){ if(!running) break; } } }
  const t0 = Date.now(); for (let i=0;i<50;i++) slot();
  const published = [];
  const pub = async (id) => { published.push(id); await pjs.publish(SUBJECT, sc.encode(id)); };
  const offsets = [-1600,-1000,-400,-100,-30,-10,-3,0,3,10,30,100,400,1000];
  for (let k=0;k<offsets.length;k++){ const target = t0 + 30000*(k+1) + offsets[k]; await sleep(Math.max(0,target-Date.now())); await pub(`A${k}@${offsets[k]}ms`); }
  await sleep(3000);
  for (let i=0;i<1200;i++){ await pub(`B${i}`); await sleep(50); }
  await sleep(35000);
  const si = await jsm.streams.info(STREAM); const ci = await jsm.consumers.info(STREAM, DURABLE);
  const lost = published.filter(x=>!handled.has(x));
  console.log('SUMMARY', JSON.stringify({ published: published.length, handled: handled.size, lost, streamMessages: si.state.messages, delivered: ci.delivered.consumer_seq, maxEventLoopLagMs: maxLag }));
  running=false; clearInterval(iv); await jsm.streams.delete(STREAM); await nc.close(); await pubNc.close(); process.exit(0);
})().catch(e=>{console.error('ERR',e); process.exit(1);});
