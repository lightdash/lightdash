import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scratch-exploratory/e2'))
from harness import *
with serve_git(ROOT,port=GIT_PORT) as server,trust_local_git(server):
 h=Harness(server)
 try:
  h.setup('minimal-cli-carry',['payments','merchants'])
  initial=h.refresh()
  source=h.source('merchants')['projectDbtSourceUuid']
  def stamp():
   e=h.detail('merchant');t=e['tables'][e['baseTable']]
   return {'present':t.get('dbtSourceUuid') is not None,'matches_merchants':t.get('dbtSourceUuid')==source,'package':t.get('dbtPackageName')}
  before_stamp=stamp()
  chart=h.r.chart(h.project,'merchant')
  deployed=h.deploy('merchants')
  after_stamp=stamp()
  before=h.cache()
  server.unreadable.add('merchants')
  refreshed=h.refresh()
  after=h.cache()
  query=h.r.saved_chart_query(h.project,chart)
  result={'baseline':initial['success'],'deploy':deployed['success'],'stamp_before':before_stamp,'stamp_after':after_stamp,'refresh':refreshed['success'],'carried':all(before.get(n)==after.get(n) and n in after for n in ['merchant','settlement']),'chart_resolves':query['resolves'],'query':query,'warnings':h.warnings(refreshed)}
  h.record('minimal-cli-carry-reproduction',**result)
  print(json.dumps(sanitise(result,h.r.env)),flush=True)
  verdict=0 if result['carried'] and result['chart_resolves'] else 1
 finally:
  h.r.close()
 raise SystemExit(verdict)
