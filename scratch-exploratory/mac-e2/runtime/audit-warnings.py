import json
import os
from pathlib import Path
import psycopg2
with psycopg2.connect(host=os.environ['PGHOST'],port=os.environ['PGPORT_APP'],dbname=os.environ['PGDATABASE'],user=os.environ['PGUSER'],password=os.environ['PGPASSWORD']) as db,db.cursor() as c:
 c.execute("select j.job_status,s.step_status,s.step_error,l.report::jsonb->'connectionWarnings' from jobs j join job_steps s using(job_uuid) join project_compile_log l using(job_uuid) where jsonb_array_length(coalesce(l.report::jsonb->'connectionWarnings','[]'::jsonb))>0")
 rows=[(state,step,error,[w for w in values if w.startswith('Source "') and 'failed:' in w]) for state,step,error,values in c.fetchall()]
 rows=[r for r in rows if r[3]]
 warnings=[w for _,_,_,values in rows for w in values]
 result={'jobs_with_report_warnings':len(rows),'warning_count':len(warnings),'all_warnings_on_completed_step':all(state=='DONE' and step=='DONE' and all(w in (error or '') for w in values) for state,step,error,values in rows),'canary_leaks':sum(any(value in w for value in ['fixture-marker','/private/fixture-only','https://fixture-user:']) for w in warnings)}
 Path('.expl-e2/warnings-audit.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
 raise SystemExit(0 if result['all_warnings_on_completed_step'] and result['canary_leaks']==0 else 1)
