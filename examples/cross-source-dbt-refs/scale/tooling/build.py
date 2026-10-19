#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def export_nodes(manifest, project):
    nodes = [node for node in manifest['nodes'].values()
             if node['resource_type'] == 'model' and node['package_name'] == project
             and node.get('original_file_path')]
    local_ids = {node['unique_id'] for node in nodes}
    return [{'name': node['name'], 'package_name': node['package_name'],
             'identifier': node.get('alias') or node['name'], 'schema': node['schema'],
             'database': node.get('database'), 'relation_name': node.get('relation_name'),
             'version': node.get('version'), 'latest_version': node.get('latest_version'),
             'access': node.get('access'),
             'depends_on_nodes': [item for item in node.get('depends_on', {}).get('nodes', [])
                                  if item in local_ids]} for node in nodes]


def main():
    parser = argparse.ArgumentParser(description='Build generated projects sequentially with external dbt nodes.')
    parser.add_argument('--projects', type=Path, default=ROOT / 'projects')
    parser.add_argument('--profiles-dir', type=Path, default=ROOT.parent / 'profiles')
    parser.add_argument('--dbt', default='dbt1.12')
    parser.add_argument('--clean', action='store_true', help='Remove generated dbt outputs and .work; keep source files and warehouse tables.')
    parser.add_argument('--dry-run', action='store_true', help='List cleanup paths without removing them (with --clean).')
    args = parser.parse_args()
    projects = args.projects.resolve()
    order = json.loads((projects / 'build_order.json').read_text())
    if args.clean:
        for path in [projects / name / directory for name in order
                     for directory in ('target', 'logs', 'dbt_packages')] + [ROOT / '.work']:
            if path.exists():
                if args.dry_run:
                    print(path)
                else:
                    shutil.rmtree(path)
        return 0
    if args.dry_run:
        parser.error('--dry-run requires --clean')
    missing = [name for name in ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')
               if not os.environ.get(name)]
    if missing:
        parser.error('Required environment variables: ' + ', '.join(missing))
    work = ROOT / '.work'
    work.mkdir(exist_ok=True)
    external_path = work / 'external_nodes.json'
    env = dict(os.environ)
    env['PYTHONPATH'] = str(ROOT / 'tooling') + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
    env['LIGHTDASH_DBT_EXTERNAL_NODES'] = str(external_path)
    env['DBT_SEND_ANONYMOUS_USAGE_STATS'] = 'false'
    env['DBT_PARTIAL_PARSE'] = 'false'
    external = []
    timings = []
    started = time.monotonic()
    for name in order:
        external_path.write_text(json.dumps(external))
        project = projects / name
        code = 0
        project_started = time.monotonic()
        stages = []
        with (work / f'{name}.log').open('w') as log:
            for stage in ('seed', 'snapshot', 'run'):
                command = [args.dbt, '--no-use-colors', stage, '--project-dir', str(project),
                           '--profiles-dir', str(args.profiles_dir.resolve()), '--threads', '1']
                if stage != 'snapshot':
                    command.append('--full-refresh')
                stage_started = time.monotonic()
                result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
                stages.append({'stage': stage, 'elapsed_ms': round((time.monotonic() - stage_started) * 1000),
                               'exit_code': result.returncode})
                code = result.returncode
                if code:
                    break
        elapsed = round((time.monotonic() - project_started) * 1000)
        timings.append({'project': name, 'elapsed_ms': elapsed, 'exit_code': code, 'stages': stages})
        print(f'{name} elapsed_ms={elapsed} exit_code={code}', flush=True)
        if code:
            print(f'Dbt failed; inspect {work / (name + ".log")}', flush=True)
            break
        manifest = json.loads((project / 'target/manifest.json').read_text())
        external.extend(export_nodes(manifest, name))
    total = round((time.monotonic() - started) * 1000)
    success = len(timings) == len(order) and all(item['exit_code'] == 0 for item in timings)
    summary = {'projects_built': sum(t['exit_code'] == 0 for t in timings), 'projects_total': len(order),
               'elapsed_ms': total, 'exit_code': 0 if success else 1, 'timings': timings}
    (work / 'timings.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(f"SUMMARY projects={summary['projects_built']}/{len(order)} elapsed_ms={total} exit_code={summary['exit_code']}", flush=True)
    return summary['exit_code']


if __name__ == '__main__':
    raise SystemExit(main())
