import argparse
import contextlib
import json
import os
import shlex
import sys
from pathlib import Path
from types import SimpleNamespace

CHECKOUT = Path(__file__).resolve().parents[2]
ROOT = CHECKOUT / 'examples/multi-repo-dbt-sim'
sys.path.insert(0,str(ROOT))
from run import Runner, observe_cli_http, trust_local_git, sanitise, read_json
from tooling import check_load, command, load_env, serve_git, CommandError
from generate import model_schema

WORK = Path(os.environ.get('EXPLORATORY_WORK_DIR', CHECKOUT/'scratch-exploratory/e1/.work')).resolve()
OUT = WORK/'evidence'
OLD_CLI = shlex.join(['node',str(WORK/'old-cli/dist/index.js')])
RELEASE_CLI = shlex.join(['node',str(WORK/'cli-3.19.0/dist/index.js')])
PARAM = {'retained': {'type': 'number', 'label': 'Retained', 'default': 7, 'allow_custom_values': True}}
REPLACEMENT = {'replacement': {'type': 'string', 'label': 'Replacement', 'default': 'test', 'allow_custom_values': True}}
CONFIGS = {'none': None, 'partial': 'spotlight:\n  default_visibility: hide\n', 'null': 'parameters:\n', 'empty': 'parameters: {}\n', 'present': json.dumps({'parameters': REPLACEMENT})}


def cli(r, project, source, action='deploy', flags=(), executable=None, env_extra=None):
    check_load()
    executable = executable or r.args.cli
    dbt = r.args.dbt19 if source == 'growth' else r.args.dbt
    env = {**r.env, 'LIGHTDASH_URL': r.args.url, 'LIGHTDASH_PROJECT': project, 'CI': 'true', 'NODE_PATH': str(CHECKOUT/'node_modules'), 'NODE_OPTIONS': '--max-old-space-size=4096 --require='+json.dumps(str(CHECKOUT/'scratch-exploratory/e1/cli-home.cjs')), 'DBT_SEND_ANONYMOUS_USAGE_STATS': 'false', 'DBT_PARTIAL_PARSE': 'false', 'PATH': str(Path(dbt).parent) + os.pathsep + r.env['PATH'], **(env_extra or {})}
    argv = [*shlex.split(executable), action, '--project-dir', str(r.root/'repos'/source), '--profiles-dir', str(r.root/'profiles'), '--profile', 'multi_repo_sim', '--target', 'dev', '--target-path', 'target', '--threads', '1']
    if action == 'deploy':
        argv += ['--project',project]
    if action != 'compile':
        argv += ['--assume-yes', '--use-batched-deploy']
    argv += list(flags)
    with observe_cli_http(r.args.url) as (proxy, events):
        env['LIGHTDASH_URL'] = proxy
        try:
            result = command(argv, r.root/'repos'/source, env, 900)
            code, stdout, stderr = 0, result.stdout, result.stderr
        except CommandError as error:
            code, stdout, stderr = error.returncode, error.stdout, error.stderr
    return {'command': shlex.join(argv), 'exit_code': code, 'success': code == 0, 'stdout': stdout, 'stderr': stderr, 'http': events}


@contextlib.contextmanager
def config(r, source, value):
    path = r.root/'repos'/source/'lightdash.config.yml'
    original = path.read_text() if path.exists() else None
    if value is None:
        path.unlink(missing_ok=True)
    else:
        path.write_text(value)
    r.republish(source)
    try:
        yield
    finally:
        if original is None:
            path.unlink(missing_ok=True)
        else:
            path.write_text(original)
        r.republish(source)


def remote_head(r,source):
    return command(['git','--git-dir',str(r.root/'remotes/sim'/(source+'.git')),'rev-parse','main'],r.root,r.env,10).stdout.strip()


@contextlib.contextmanager
def local_model(r,source,model):
    repo=r.root/'repos'/source
    sql=repo/'models'/f'{source}_base.sql'
    if not sql.exists():
        sql=repo/'models/ledger.sql'
    files={repo/'models'/f'{model}.sql':sql.read_text(),repo/'models'/f'{model}.yml':json.dumps({'version':2,'models':[model_schema(model)]})}
    if any(file.exists() for file in files):
        raise RuntimeError('CLI-only model already exists')
    before=remote_head(r,source)
    for file,value in files.items():
        file.write_text(value)
    try:
        check_load()
        command([r.args.dbt,'--no-use-colors','--no-partial-parse','run','--project-dir',str(repo),'--profiles-dir',str(r.root/'profiles'),'--profile','multi_repo_sim','--target','dev','--target-path','target','--select',model,'--threads','1'],repo,r.env,600)
        if remote_head(r,source)!=before:
            raise RuntimeError('CLI-only probe changed remote Git')
        yield {'remote_head_before':before,'remote_head_during':remote_head(r,source)}
    finally:
        for file in files:
            file.unlink(missing_ok=True)
        if remote_head(r,source)!=before:
            raise RuntimeError('CLI-only probe changed remote Git')


def source_patch(r, project, name, selector=None, environment=None):
    sources = r.api.call('GET', f'/api/v1/projects/{project}/dbt-sources')
    source = next(s for s in sources if s['name'] == name or (s['isPrimary'] and name == 'primary'))
    connection = r.source_config('payments' if source['isPrimary'] else name, selector)
    if environment:
        connection['environment'] = [{'key': k, 'value': v} for k,v in environment.items()]
    r.api.call('PATCH', f"/api/v1/projects/{project}/dbt-sources/{source['projectDbtSourceUuid']}", {'dbtConnection': connection})


class Cases:
    def __init__(self, r, suite):
        self.r, self.suite = r, suite
        previous=OUT/(suite+'.json')
        self.rows=json.loads(previous.read_text())['rows'] if previous.exists() else []
    def add(self, name, fn):
        wanted=os.environ.get('FILTER_CASE')
        if wanted and name not in wanted.split(','):
            return
        print('CASE '+name, flush=True)
        try:
            result = fn()
        except Exception as error:
            result = {'harness_error': type(error).__name__+': '+str(error)}
        self.rows=[row for row in self.rows if row['case'] != name]
        self.rows.append({'case': name, **result})
        (OUT/(self.suite+'.json')).write_text(json.dumps(sanitise({'sha': self.r.args.code_sha, 'rows': self.rows}, self.r.env), indent=2)+'\n')
        print('RECORDED '+name, flush=True)


def manifest_dependencies(r,p,model='settlement_report'):
    import gzip
    import urllib.request
    import urllib.error
    headers={'User-Agent':'Lightdash synthetic fixture'}
    if r.api.token:
        headers['Authorization']='ApiKey '+r.api.token
    request=urllib.request.Request(r.args.url+f'/api/v1/projects/{p}/dbt/manifest',headers=headers)
    try:
        with r.api.opener.open(request,timeout=30) as response:
            raw=response.read()
        if raw.startswith(b'\x1f\x8b'):
            raw=gzip.decompress(raw)
        nodes=json.loads(raw)['nodes']
        return {key:{'refs':node.get('refs'),'dependencies':node.get('depends_on',{}).get('nodes',[])} for key,node in nodes.items() if node.get('package_name')=='finance' and node.get('name')==model}
    except urllib.error.HTTPError as error:
        return {'manifest_unavailable':error.code}


def merged(r, c):
    p = r.project('extra-refs', 'server')
    c.add('refs-idempotent', lambda: {'first': r.refresh(p), 'second': r.refresh(p), 'after': r.snapshot(p)})
    def same_consumer():
        with r.edit('finance', 'models/settlement_report.sql', lambda _: "select a.* from {{ ref('settlement') }} a join {{ ref('merchants', 'settlement') }} b on a.id=b.id\n"):
            return {'first': r.refresh(p), 'second': r.refresh(p), 'after': r.snapshot(p),'dependencies':manifest_dependencies(r,p)}
    c.add('refs-same-consumer', same_consumer)
    def third():
        with r.edit('finance', 'models/settlement_report.sql', lambda _: "select a.* from {{ ref('settlement') }} a join {{ ref('merchants', 'settlement') }} b on a.id=b.id\n"), r.add_model('marketing','settlement'):
            return {'refresh': r.refresh(p), 'after': r.snapshot(p)}
    c.add('refs-three-owners', third)
    primary = r.project('primary-qualified', 'server', ['merchants', 'payments', 'finance', 'risk', 'growth', 'marketing'])
    def primary_case():
        with r.edit('finance', 'models/settlement_report.sql', lambda _: "select a.* from {{ ref('settlement') }} a join {{ ref('merchants', 'settlement') }} b on a.id=b.id\n"):
            return {'refresh': r.refresh(primary), 'after': r.snapshot(primary),'dependencies':manifest_dependencies(r,primary)}
    c.add('refs-explicit-primary', primary_case)
    def versions():
        import yaml
        schema = yaml.safe_load((r.root/'repos/merchants/models/schema.yml').read_text())
        rate = next(m for m in schema['models'] if m['name'] == 'rate')
        with contextlib.ExitStack() as stack:
            for v in (1,2):
                stack.enter_context(r.edit('payments', f'models/rate_v{v}.sql', lambda _: (r.root/'repos/payments/models/ledger.sql').read_text()))
            stack.enter_context(r.edit('payments', 'models/extra_rate.yml', lambda _: json.dumps({'version': 2, 'models': [rate]})))
            parts=[]
            for keyword in ('v=1','version=2',''):
                arg=', '+keyword if keyword else ''
                parts.append("select a.* from {{ ref('rate'"+arg+") }} a join {{ ref('merchants', 'rate'"+arg+") }} b on a.id=b.id")
            stack.enter_context(r.edit('finance','models/settlement_report.sql',lambda _: '\nunion all\n'.join(parts)+'\n'))
            check_load()
            command([r.args.dbt,'--no-use-colors','run','--project-dir',str(r.root/'repos/payments'),'--profiles-dir',str(r.root/'profiles'),'--profile','multi_repo_sim','--target','dev','--select','payments.rate','--threads','1'],r.root,r.env,600)
            return {'first': r.refresh(p), 'second': r.refresh(p), 'after': r.snapshot(p),'dependencies':manifest_dependencies(r,p)}
    c.add('refs-versioned-mixed', versions)
    def cycle():
        with r.edit('risk', 'models/risk_base.sql', lambda _: "select * from {{ ref('finance', 'finance_report') }}\n"):
            return {'refresh': r.refresh(p)}
    c.add('refs-model-cycle', cycle)
    empty = r.project('extra-empty', 'server')
    c.add('empty-baseline', lambda: {'refresh': r.refresh(empty), 'after': r.snapshot(empty)})
    def empty_env():
        source_patch(r, empty, 'marketing', 'tag:sim_missing_tag', {'DBT_WARN_ERROR_OPTIONS': '{"error":["NoNodesForSelectionCriteria"]}'})
        return {'refresh': r.refresh(empty), 'after': r.snapshot(empty)}
    c.add('empty-env-warn-error', empty_env)
    def empty_referenced():
        source_patch(r, empty, 'marketing')
        source_patch(r, empty, 'merchants', 'tag:sim_missing_tag')
        return {'refresh': r.refresh(empty), 'after': r.snapshot(empty)}
    c.add('empty-referenced-source', empty_referenced)
    single = r.project('empty-single', 'server', ['merchants'])
    def empty_single():
        sources = r.api.call('GET', f'/api/v1/projects/{single}/dbt-sources')
        s = next(s for s in sources if s['isPrimary'])
        r.api.call('PATCH', f"/api/v1/projects/{single}/dbt-sources/{s['projectDbtSourceUuid']}", {'dbtConnection': r.source_config('merchants', 'tag:sim_missing_tag')})
        return {'refresh': r.refresh(single), 'after': r.snapshot(single)}
    c.add('empty-single-source', empty_single)
    for action in ('compile', 'deploy'):
        c.add('empty-cli-'+action, lambda action=action: cli(r, empty, 'marketing', action, ['--select', 'tag:sim_missing_tag']))
    def broken():
        source_patch(r, empty, 'merchants')
        with r.edit('marketing', 'models/broken.sql', lambda _: "select * from {{ ref('does_not_exist') }}\n"):
            return {'refresh': r.refresh(empty), 'after': r.snapshot(empty)}
    c.add('broken-dbt-ls', broken)


def seed_controls(r,p):
    r.api.call('PUT', f'/api/v1/projects/{p}/tags/yaml', [{'name': 'Retained category', 'color': 'blue', 'yamlReference': 'retained'}])
    r.api.call('PUT', f'/api/v1/projects/{p}/table-groups', {'retained': {'label': 'Retained group'}})
    r.api.call('PUT', f'/api/v2/projects/{p}/defaults', {'case_sensitive': False, 'column_totals': True})


def params(r,c):
    p = r.project('parameters', 'cli', ['marketing'])
    sources = r.api.call('GET', f'/api/v1/projects/{p}/dbt-sources')
    for s in sources:
        if not s['isPrimary']:
            r.api.call('DELETE', f"/api/v1/projects/{p}/dbt-sources/{s['projectDbtSourceUuid']}")
    def run_one(kind, value, executable=None, target=p, action='deploy', preview_name=None):
        r.api.call('PUT', f'/api/v2/projects/{target}/parameters', PARAM)
        seed_controls(r,target)
        before = r.snapshot(target)
        flags = ['--skip-copy-content', '--name', preview_name] if preview_name else []
        with config(r, 'marketing', value):
            operation = cli(r, target, 'marketing', action, flags, executable)
            after = r.snapshot(target)
        return {'before': before, 'operation': operation, 'after': after}
    for kind,value in CONFIGS.items():
        c.add('new-cli-'+kind, lambda kind=kind,value=value: run_one(kind,value))
    for kind,value in CONFIGS.items():
        c.add('old-cli-'+kind, lambda kind=kind,value=value: run_one(kind,value, OLD_CLI))
    for kind in ('none','partial','null','empty'):
        c.add('npm-3.19.0-'+kind, lambda kind=kind: run_one(kind,CONFIGS[kind], RELEASE_CLI))
    single = r.project('parameters-refresh', 'server', ['merchants'])
    for kind,value in CONFIGS.items():
        def refresh_case(value=value):
            r.api.call('PUT', f'/api/v2/projects/{single}/parameters', PARAM)
            seed_controls(r,single)
            before=r.snapshot(single)
            with config(r, 'merchants', value):
                return {'before':before,'refresh': r.refresh(single), 'after': r.snapshot(single)}
        c.add('refresh-'+kind, refresh_case)
    multi = r.project('parameters-multi', 'server')
    def multi_case():
        with contextlib.ExitStack() as stack:
            for source in r.sources:
                if source['name'] != 'payments':
                    stack.enter_context(config(r,source['name'], None))
            r.api.call('PUT', f'/api/v2/projects/{multi}/parameters', PARAM)
            return {'refresh': r.refresh(multi), 'after': r.snapshot(multi)}
    c.add('refresh-multi-one-config', multi_case)
    preview_name = 'synthetic-params-preview'
    def create_preview():
        r.api.call('PUT',f'/api/v2/projects/{p}/parameters',PARAM)
        return cli(r,p,'marketing','start-preview',['--skip-copy-content','--name',preview_name])
    c.add('preview-create',create_preview)
    projects = r.api.call('GET','/api/v1/org/projects')
    preview = next((item for item in projects if item['name'] == preview_name),None)
    if preview:
        preview_id = preview.get('projectUuid') or preview.get('uuid')
        c.add('preview-created-state',lambda: {'after':r.snapshot(preview_id)})
        for kind,value in CONFIGS.items():
            c.add('preview-'+kind, lambda kind=kind,value=value: run_one(kind,value,target=preview_id,action='start-preview',preview_name=preview_name))


def deploy_raw(r,c):
    p=r.project('deploy-raw','server',['merchants','marketing'])
    c.add('raw-baseline',lambda:{'refresh':r.refresh(p),'after':r.snapshot(p)})
    for name,executable,flags in [('raw-inferred',None,[]),('raw-explicit',None,['--source','marketing']),('raw-old-cli',OLD_CLI,[])]:
        c.add(name,lambda executable=executable,flags=flags:{'before':r.snapshot(p),'operation':cli(r,p,'marketing',flags=flags,executable=executable),'after':r.snapshot(p)})


def deploy(r,c):
    p = r.project('deploy-extra', 'server')
    c.add('baseline', lambda: {'refresh': r.refresh(p), 'after': r.snapshot(p)})
    for source in ['merchants', 'marketing', 'payments']:
        def inferred(source=source):
            before = r.snapshot(p)
            op = cli(r,p,source)
            return {'before':before, 'operation':op,'after':r.snapshot(p)}
        c.add('inferred-'+source,inferred)
    c.add('explicit-single-connection',lambda:{'before':r.snapshot(p),'operation':cli(r,p,'marketing',flags=['--source','marketing']),'after':r.snapshot(p)})
    c.add('old-cli-inferred',lambda:{'before':r.snapshot(p),'operation':cli(r,p,'marketing',executable=OLD_CLI),'after':r.snapshot(p)})
    def unknown():
        with r.edit('marketing','dbt_project.yml',lambda s:s.replace('name: marketing','name: unregistered').replace('  marketing:', '  unregistered:')):
            before=r.snapshot(p)
            op=cli(r,p,'marketing')
            old=cli(r,p,'marketing',executable=OLD_CLI)
            return {'before':before,'operation':op,'old_cli':old,'after':r.snapshot(p)}
    c.add('inference-unknown-safe',unknown)
    def duplicate():
        with r.edit('marketing','dbt_project.yml',lambda s:s.replace('name: marketing','name: growth').replace('  marketing:', '  growth:')):
            before=r.snapshot(p)
            refresh=r.refresh(p)
            op=cli(r,p,'marketing')
            old=cli(r,p,'marketing',executable=OLD_CLI)
            return {'before':before,'refresh':refresh,'operation':op,'old_cli':old,'after':r.snapshot(p)}
    c.add('duplicate-project-name',duplicate)
    def collision():
        chart=r.chart(p)
        before_query=r.saved_chart_query(p,chart)
        with local_model(r,'marketing','ledger') as git_state:
            return {'before':r.snapshot(p),'operation':cli(r,p,'marketing'),'after':r.snapshot(p),'original_query_before':before_query,'original_query_after':r.saved_chart_query(p,chart),'git':git_state}
    c.add('cross-source-collision',collision)
    def refresh_after():
        with local_model(r,'payments','cli_only') as git_state:
            operation=cli(r,p,'payments')
            after_cli=r.snapshot(p)
        return {'operation':operation,'after_cli':after_cli,'refresh':r.refresh(p),'after':r.snapshot(p),'git':{**git_state,'remote_head_after':remote_head(r,'payments')}}
    c.add('refresh-after-cli',refresh_after)
    single = r.project('deploy-single','cli',['marketing'])
    for s in r.api.call('GET',f'/api/v1/projects/{single}/dbt-sources'):
        if not s['isPrimary']:
            r.api.call('DELETE',f"/api/v1/projects/{single}/dbt-sources/{s['projectDbtSourceUuid']}")
    c.add('single-source-deploy',lambda:{'operation':cli(r,single,'marketing'),'after':r.snapshot(single)})
    c.add('single-source-explicit-primary',lambda:{'operation':cli(r,single,'marketing',flags=['--source','primary']),'after':r.snapshot(single)})
    c.add('preview-create',lambda:cli(r,p,'marketing','start-preview',['--skip-copy-content','--name','synthetic-deploy-preview']))
    c.add('preview-explicit-source',lambda:cli(r,p,'marketing','start-preview',['--skip-copy-content','--name','synthetic-deploy-preview','--source','marketing']))
    multi = r.project('deploy-multi','server',['merchants','marketing'])
    c.add('multi-before-binding',lambda:{'refresh':r.refresh(multi),'after':r.snapshot(multi)})
    def bind_multi():
        connection=r.api.call('POST',f'/api/v1/projects/{multi}/warehouse-connections',{'name':'synthetic replica','warehouseConnection':r.warehouse()})
        sources=r.api.call('GET',f'/api/v1/projects/{multi}/dbt-sources')
        source=next(s for s in sources if s['name']=='marketing')
        r.api.call('PUT',f"/api/v1/projects/{multi}/warehouse-connections/dbt-sources/{source['projectDbtSourceUuid']}",{'warehouseConnectionUuid':connection['warehouseConnectionUuid']})
        return {'refresh':r.refresh(multi),'after':r.snapshot(multi)}
    c.add('multi-bind',bind_multi)
    c.add('multi-inferred',lambda:{'before':r.snapshot(multi),'operation':cli(r,multi,'marketing'),'after':r.snapshot(multi)})
    c.add('multi-explicit',lambda:{'before':r.snapshot(multi),'operation':cli(r,multi,'marketing',flags=['--source','marketing']),'after':r.snapshot(multi)})
    def peer():
        import psycopg2
        from psycopg2 import sql
        check_load()
        database='synthetic_e1_replica'
        db=psycopg2.connect(host=r.env['PGHOST'],port=r.env['PGPORT'],dbname=r.env['PGDATABASE_APP'],user=r.env['PGUSER'],password=r.env['PGPASSWORD'])
        try:
            db.autocommit=True
            with db.cursor() as cursor:
                cursor.execute('select 1 from pg_database where datname=%s',(database,))
                exists=cursor.fetchone() is not None
                if exists and r.state.get('replica_database') != database:
                    raise RuntimeError('Replica database already exists outside this harness')
                if not exists:
                    cursor.execute(sql.SQL('create database {}').format(sql.Identifier(database)))
                    r.state['replica_database']=database
                    r.save_state()
        finally:
            db.close()
        replica_env={**r.env,'PGDATABASE':database,'DBT_DATABASE':database,'DBT_SEND_ANONYMOUS_USAGE_STATS':'false'}
        for action,extra in [('seed',[]),('run',['--select','tag:sim_base'])]:
            check_load()
            command([r.args.dbt,'--no-use-colors',action,'--project-dir',str(r.root/'repos/merchants'),'--profiles-dir',str(r.root/'profiles'),'--profile','multi_repo_sim','--target','dev','--threads','1',*extra],r.root,replica_env,600)
        project=r.project('prod-replica','server',['merchants'])
        initial=r.refresh(project)
        connection=r.api.call('POST',f'/api/v1/projects/{project}/warehouse-connections',{'name':'synthetic replica database','warehouseConnection':{**r.warehouse(),'dbname':database}})
        replica=r.api.call('POST',f'/api/v1/projects/{project}/dbt-sources',{'name':'merchants_replica','dbtConnection':r.source_config('merchants')})
        sources=r.api.call('GET',f'/api/v1/projects/{project}/dbt-sources')
        replica=next(source for source in sources if source['name']=='merchants_replica')
        r.api.call('PUT',f"/api/v1/projects/{project}/warehouse-connections/dbt-sources/{replica['projectDbtSourceUuid']}",{'warehouseConnectionUuid':connection['warehouseConnectionUuid']})
        r.state['replica_project']=project
        r.state['replica_connection']=connection['warehouseConnectionUuid']
        r.save_state()
        before=r.snapshot(project)
        refresh=r.refresh(project)
        op=cli(r,project,'merchants')
        replica_op=cli(r,project,'merchants',env_extra={'PGDATABASE':database,'DBT_DATABASE':database})
        explicit=cli(r,project,'merchants',flags=['--source','merchants_replica'],env_extra={'PGDATABASE':database,'DBT_DATABASE':database})
        return {'before':before,'initial':initial,'refresh':refresh,'primary_deploy':op,'replica_deploy':replica_op,'explicit':explicit,'after':r.snapshot(project)}
    c.add('prod-replica-peer',peer)
    def ambiguous_peer():
        project=r.state['replica_project']
        connection=r.state['replica_connection']
        r.api.call('PATCH',f'/api/v1/projects/{project}/warehouse-connections/{connection}',{'warehouseConnection':r.warehouse()})
        refresh=r.refresh(project)
        before=r.snapshot(project)
        current=cli(r,project,'merchants')
        old=cli(r,project,'merchants',executable=OLD_CLI)
        return {'refresh':refresh,'before':before,'operation':current,'old_cli':old,'after':r.snapshot(project)}
    c.add('ambiguous-inference',ambiguous_peer)




def read_json_from_ldenv(checkout,env):
    return json.loads(command([str(Path.home()/'.ldenv/bin/ldenv'),'status','--json'],checkout,env,30).stdout)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('suite', choices=['merged','params','deploy','deploy_raw'])
    args=ap.parse_args()
    env=load_env(CHECKOUT)
    env['NODE_OPTIONS']='--max-old-space-size=4096'
    env['PGDATABASE_APP']=env['PGDATABASE']
    env['PGDATABASE']=env.get('DBT_DATABASE',env['PGDATABASE'])
    OUT.mkdir(parents=True,exist_ok=True)
    status=read_json_from_ldenv(CHECKOUT,env)
    root=ROOT/'.work/small'
    args=SimpleNamespace(target='current',url=os.environ.get('SIM_URL',f"http://127.0.0.1:{status['ports']['api']}"),server_project=None,cli_project=None,scenarios=['custom'],scale='small',timeout=600,cli=f'node {CHECKOUT}/packages/cli/dist/index.js',dbt=str(ROOT/'.work/venvs/dbt12/bin/dbt'),dbt19=str(ROOT/'.work/venvs/dbt19/bin/dbt'),code_sha=command(['git','rev-parse','HEAD'],CHECKOUT,env,10).stdout.strip(),target_sha=None)
    with serve_git(root) as server, trust_local_git(server):
        r=Runner(args,env,root,server)
        try:
            c=Cases(r,sys.argv[1])
            globals()[sys.argv[1]](r,c)
        finally:
            r.close()

if __name__=='__main__':
    import signal
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(130))
    main()
