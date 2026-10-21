import json
import signal
import sys
from pathlib import Path
import psycopg2
CHECKOUT=Path(__file__).resolve().parents[2]
ROOT=CHECKOUT/'examples/multi-repo-dbt-sim'
sys.path.insert(0,str(ROOT))
from tooling import _dbt_stage, load_env
from run import sanitise
root=ROOT/'.work/small'
env=load_env(CHECKOUT)
env['PGDATABASE_APP']=env['PGDATABASE']
env['PGDATABASE']=env.get('DBT_DATABASE',env['PGDATABASE'])
env.update(DBT_SEND_ANONYMOUS_USAGE_STATS='false',DBT_PARTIAL_PARSE='false')
sources=json.loads((root/'registry.json').read_text())['sources']
path=root/'build.json'
result=json.loads(path.read_text()) if path.exists() else {'timings':[],'errors':[],'notes':[],'exit_code':1,'full':False,'projects_total':len(sources),'projects_built':0}
if list(root.glob('repos/*/*.sim-bootstrap')):raise RuntimeError('Unrestored bootstrap config')
for s in sources:
 manifest=root/'published'/s['name']/'manifest.json'
 if not manifest.exists():raise RuntimeError('Missing bootstrap manifest')
 nodes=json.loads(manifest.read_text())['nodes']
 if not any(n.get('package_name')==s['projectName'] and n.get('resource_type')=='model' and 'sim_base' in n.get('tags',[]) for n in nodes.values()):raise RuntimeError('Missing base tag')
verified=[]
with psycopg2.connect(host=env['PGHOST'],port=env['PGPORT'],dbname=env['PGDATABASE'],user=env['PGUSER'],password=env['PGPASSWORD']) as db:
 with db.cursor() as cursor:
  for s in sources:
   cursor.execute('select to_regclass(%s)',(f"sim_{s['name']}.{s['name']}_seed",))
   if cursor.fetchone()[0] is None:continue
   from psycopg2 import sql
   cursor.execute(sql.SQL('select count(*) from {}.{}').format(sql.Identifier('sim_'+s['name']),sql.Identifier(s['name']+'_seed')))
   if cursor.fetchone()[0] != 3:raise RuntimeError('Unexpected seed row count')
   verified.append(s['name'])
result['verified_seed_sources']=verified
signal.signal(signal.SIGTERM,lambda *_:sys.exit(130))
step=sys.argv[1]
for s in sources:
 if step=='seed' and s['name'] in verified:
  print('REUSE verified seed '+s['name'],flush=True)
  continue
 if any(t['source']==s['name'] and t['stage']==step and t['exit_code']==0 for t in result['timings']):continue
 action='seed' if step=='seed' else 'run'
 args=['--full-refresh','--threads','1']
 if step=='bases':args+=['--select','tag:sim_base']
 ok=_dbt_stage(root,s,str(ROOT/'.work/venvs/dbt12/bin/dbt'),str(ROOT/'.work/venvs/dbt19/bin/dbt'),env,step,action,args,result)
 path.write_text(json.dumps(sanitise(result,env),indent=2)+'\n')
 if not ok:raise SystemExit(1)
if step=='run':
 result['exit_code']=0
 result['projects_built']=len(sources)
 path.write_text(json.dumps(sanitise(result,env),indent=2)+'\n')
