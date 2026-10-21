import os
import secrets
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
work = root / 'scratch-exploratory/e1'
work.mkdir(parents=True, exist_ok=True)
env = {
    'NODE_ENV': 'development',
    'TZ': 'UTC',
    'PORT': '18981',
    'SITE_URL': 'http://127.0.0.1:18981',
    'PGHOST': '127.0.0.1',
    'PGPORT': '15981',
    'PGUSER': 'postgres',
    'PGPASSWORD': secrets.token_hex(20),
    'PGDATABASE': 'lightdash',
    'LIGHTDASH_SECRET': secrets.token_hex(32),
    'SECURE_COOKIES': 'false',
    'TRUST_PROXY': 'false',
    'SCHEDULER_ENABLED': 'false',
    'EXPERIMENTAL_CACHE': 'false',
    'NATS_ENABLED': 'false',
    'LIGHTDASH_LICENSE_KEY': '',
    'LIGHTDASH_PROMETHEUS_ENABLED': 'false',
    'LIGHTDASH_ENABLE_FEATURE_FLAGS': 'multi-dbt-sources,cross-source-dbt-refs,multiple-warehouse-connections',
    'LIGHTDASH_LOG_LEVEL': 'info',
    'RUDDERSTACK_WRITE_KEY': '',
    'RUDDERSTACK_DATA_PLANE_URL': '',
    'DISABLE_ANONYMOUS_ANALYTICS': 'true',
    'S3_ENDPOINT': 'http://127.0.0.1:19981',
    'S3_REGION': 'us-east-1',
    'S3_BUCKET': 'default',
    'S3_ACCESS_KEY': 'thunder-local',
    'S3_SECRET_KEY': secrets.token_hex(20),
    'S3_FORCE_PATH_STYLE': 'true',
    'AUTH_DISABLE_PASSWORD_AUTHENTICATION': 'false',
    'ALLOW_MULTIPLE_ORGS': 'true',
    'NODE_OPTIONS': '--max-old-space-size=6144',
    'PATH': str(root / '.venv-dbt/bin') + ':' + os.environ['PATH'],
}
envfile = work / '.env'
envfile.write_text(''.join(f'{key}={value}\n' for key, value in env.items()))
envfile.chmod(0o600)
pgfile = work / '.pg.env'
pgfile.write_text(f"POSTGRES_PASSWORD={env['PGPASSWORD']}\nPOSTGRES_DB=lightdash\n")
pgfile.chmod(0o600)
s3file = work / '.s3.env'
s3file.write_text(f"MINIO_ROOT_USER={env['S3_ACCESS_KEY']}\nMINIO_ROOT_PASSWORD={env['S3_SECRET_KEY']}\n")
s3file.chmod(0o600)
subprocess.run(['docker', 'run', '-d', '--name', 'thunder-expl-e1-pg', '-p', '127.0.0.1:15981:5432', '--env-file', str(pgfile), 'pgvector/pgvector:pg18'], check=True, stdout=subprocess.DEVNULL)
subprocess.run(['docker', 'run', '-d', '--name', 'thunder-expl-e1-s3', '-p', '127.0.0.1:19981:9000', '--env-file', str(s3file), 'coollabsio/minio:latest', 'server', '/data'], check=True, stdout=subprocess.DEVNULL)
print('Started thunder-expl-e1-pg:15981 and thunder-expl-e1-s3:19981')
