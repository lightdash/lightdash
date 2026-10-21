import json
import os
import sys
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parent))
from api import Api,ApiError,redact
api=Api()
try:
 api.req('POST','/api/v1/user',{'firstName':'Synthetic','lastName':'Explorer','email':'explorer@example.test','password':os.environ['PGPASSWORD']})
except ApiError as e:
 if e.status not in [400,409]:raise
 api.login()
try:api.req('PUT','/api/v1/org',{'name':'Synthetic exploration'})
except ApiError as e:
 print(json.dumps(redact(e.body)))
print('Synthetic user and organisation ready')
