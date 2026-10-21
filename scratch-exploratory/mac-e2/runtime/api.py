import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:18962'
class ApiError(Exception):
 def __init__(self,status,body):
  self.status=status
  self.body=body
  super().__init__(f'HTTP {status}: '+json.dumps(redact(body)))
def redact(value):
 text=json.dumps(value,default=str)
 for key in ['PGPASSWORD','POSTGRES_PASSWORD','LIGHTDASH_SECRET','S3_SECRET_KEY','FIXTURE_GIT_TOKEN','LIGHTDASH_API_KEY']:
  if os.environ.get(key): text=text.replace(os.environ[key],'<secret>')
 text=re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','<id>',text)
 return json.loads(text)
class Api:
 def __init__(self):
  self.jar=http.cookiejar.CookieJar()
  self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def req(self,method,path,body=None):
  request=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'},method=method)
  try:
   with self.opener.open(request,timeout=240) as r: payload=json.load(r)
  except urllib.error.HTTPError as e:
   try: body=json.load(e)
   except ValueError: body={'error':'non-json'}
   raise ApiError(e.code,body)
  return payload.get('results')
 def login(self):
  return self.req('POST','/api/v1/login',{'email':'explorer@example.test','password':os.environ['PGPASSWORD']})
 def project(self,name):
  return next(p for p in self.req('GET','/api/v1/org/projects') if p['name']==name)['projectUuid']
 def sources(self,project): return self.req('GET',f'/api/v1/projects/{project}/dbt-sources')
 def source(self,project,name): return next(s for s in self.sources(project) if s['name']==name)['projectDbtSourceUuid']
 def refresh(self,project):
  started=time.time()
  job=self.req('POST',f'/api/v1/projects/{project}/refresh',{})['jobUuid']
  while time.time()-started<300:
   result=self.req('GET',f'/api/v1/jobs/{job}')
   status=result.get('jobStatus',result.get('status'))
   if status not in ['running','started','pending','queued','scheduled']:
    return result
   time.sleep(1)
  raise RuntimeError('Refresh poll exceeded 300s')
 def explores(self,project): return self.req('GET',f'/api/v1/projects/{project}/explores')
 def explore(self,project,name): return self.req('GET',f'/api/v1/projects/{project}/explores/{name}')
 def query(self,project,name):
  explore=self.explore(project,name)
  base=explore['baseTable']
  metric=next(iter(explore['tables'][base]['metrics']))
  if not metric.startswith(base+'_'): metric=base+'_'+metric
  body={'exploreName':name,'dimensions':[],'metrics':[metric],'filters':{},'sorts':[],'limit':10,'tableCalculations':[],'additionalMetrics':[]}
  return self.req('POST',f'/api/v1/projects/{project}/explores/{name}/runQuery',body)
def gitconfig(name,branch='main',selector=None):
 conf={'type':'github','authorization_method':'personal_access_token','personal_access_token':os.environ['FIXTURE_GIT_TOKEN'],'repository':'neutral/'+name,'host_domain':'fixture.invalid','branch':branch,'project_sub_path':'/'}
 if selector is not None: conf['selector']=selector
 return conf
def sql(query):
 raw=subprocess.check_output(['docker','exec','thunder-expl-e2-db','psql','-U','explorer','-d','explorer','-At','-c',query],text=True)
 return raw.strip()
def rows(query):
 return json.loads(sql('select coalesce(json_agg(q),\'[]\'::json) from ('+query+') q'))
def evidence(name,data):
 (ROOT/'.expl-e2'/f'{name}.json').write_text(json.dumps(redact(data),indent=2,default=str)+'\n')
def snapshot(project):
 return rows(f"select name,md5(explore::text) as hash,table_names,warehouse_connection_uuid from cached_explores where project_uuid='{project}' order by name")
if __name__=='__main__':
 import sys
 a=Api();a.login()
 if sys.argv[1]=='refresh': print(json.dumps(redact(a.refresh(a.project(sys.argv[2]))),indent=2))
 if sys.argv[1]=='explores': print(json.dumps(redact(a.explores(a.project(sys.argv[2]))),indent=2))
