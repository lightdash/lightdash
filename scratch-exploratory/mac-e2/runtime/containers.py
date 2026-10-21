import subprocess
import time
for name,port,image,command in [('db',25462,'pgvector/pgvector:pg18',[]),('warehouse',25463,'postgres:16-alpine',[]),('storage',29462,'coollabsio/minio:latest',['server','/data'])]:
 check=subprocess.run(['lsof','-nP',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 if check.stdout:raise RuntimeError(f'Port {port} is occupied')
 target=5432 if name!='storage' else 9000
 subprocess.run(['python3','.expl-e2/heavy.py','docker','run','-d','--pull','never','--name','thunder-expl-e2-'+name,'--label','thunder-expl-e2=true','--env-file','.env.expl-e2','-e','PGPORT=5432','-p',f'127.0.0.1:{port}:{target}',image,*command],check=True,stdout=subprocess.DEVNULL)
 print('Started thunder-expl-e2-'+name,flush=True)
 if name!='storage':
  for _ in range(50):
   r=subprocess.run(['docker','exec','thunder-expl-e2-'+name,'pg_isready','-h','127.0.0.1','-p','5432','-U','explorer'],capture_output=True)
   if r.returncode==0:break
   time.sleep(.5)
