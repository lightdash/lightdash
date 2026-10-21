import subprocess
import time
for name,port,image in [('db',25462,'pgvector/pgvector:pg18'),('warehouse',25463,'postgres:16-alpine')]:
 target='thunder-expl-e2-'+name
 subprocess.run(['docker','stop',target],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','rm','-v',target],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','run','-d','--pull','never','--name',target,'--label','thunder-expl-e2=true','--env-file','.env.expl-e2','-e','PGPORT=5432','-p',f'127.0.0.1:{port}:5432',image],check=True,stdout=subprocess.DEVNULL)
 for _ in range(60):
  result=subprocess.run(['docker','exec',target,'pg_isready','-h','127.0.0.1','-p','5432','-U','explorer'],capture_output=True)
  if result.returncode==0:break
  time.sleep(.5)
 else:raise RuntimeError('Own Postgres did not start')
 print(target+' ready',flush=True)
