import os
from pathlib import Path
import subprocess
import sys
import time
root=Path(__file__).resolve().parents[1]
while True:
 subprocess.run(['df','-h',str(root)],check=True)
 subprocess.run(['uptime'],check=True)
 available=int(subprocess.check_output(['df','-k',str(root)],text=True).splitlines()[-1].split()[3])*1024
 if available<15*1024**3: raise SystemExit('STOP: disk free is below 15 GiB')
 if os.getloadavg()[0]<=10: break
 print('Waiting for load <= 10',flush=True)
 time.sleep(30)
raise SystemExit(subprocess.call(sys.argv[1:],cwd=root))
