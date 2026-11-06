#!/usr/bin/env python3
import argparse
import collections
import json
import random
from pathlib import Path


COLUMNS = [('id', 'number'), ('label', 'string'), ('amount', 'number'),
           ('active', 'boolean'), ('event_date', 'date')]
KINDS = ['fanout', 'leaf', 'samename', 'hub', 'hub', 'chain', 'chain',
         'diamond', 'versioned', 'mixed', 'large', 'fanin', 'leaf', 'leaf',
         'chain', 'chain', 'chain', 'diamond', 'diamond', 'samename']


def reference(project, model, version=None):
    return {'project': project, 'model': model, 'version': version}


def create_topology(count, large_models, seed):
    rng = random.Random(seed)
    kinds = [KINDS[i] if i < len(KINDS) else
             ['leaf', 'hub', 'chain', 'samename'][i % 4] for i in range(count)]
    names = [f'scale_{i:02d}_{kind}' for i, kind in enumerate(kinds)]
    projects = {}
    for index, (name, kind) in enumerate(zip(names, kinds)):
        size = large_models if kind == 'large' else 50 if kind == 'hub' else 1
        models = []
        for number in range(size):
            model_name = ('customers' if kind in ('fanout', 'samename') or index == 1
                          else f'{name}_{number:04d}')
            models.append({'name': model_name, 'file': model_name, 'access': 'public',
                           'version': None, 'refs': [], 'local_refs': [],
                           'rows': rng.randint(8, 20), 'value': rng.randint(1, 1000),
                           'materialized': 'table'})
        projects[name] = {'kind': kind, 'model_details': models, 'resources': []}

    def first(index):
        return reference(names[index], projects[names[index]]['model_details'][0]['name'])

    def add_ref(index, ref, model_index=0):
        refs = projects[names[index]]['model_details'][model_index]['refs']
        if ref not in refs:
            refs.append(ref)

    for index, kind in enumerate(kinds):
        if index and kind != 'leaf':
            add_ref(index, first(0))
    if count > 4:
        add_ref(4, first(3))
    chain = [i for i, kind in enumerate(kinds) if kind == 'chain']
    previous = 4 if count > 4 else 0
    for index in chain:
        add_ref(index, first(previous))
        previous = index
    diamonds = [i for i, kind in enumerate(kinds) if kind == 'diamond']
    if diamonds:
        add_ref(diamonds[0], first(3))
        add_ref(diamonds[0], first(4))
    if len(diamonds) >= 3:
        add_ref(diamonds[2], first(diamonds[1]))
        add_ref(diamonds[2], first(diamonds[0]))

    if count > 8:
        project = projects[names[8]]
        product = project['model_details'][0]
        product['name'] = f'{names[8]}_product'
        product['file'] = product['name'] + '_v1'
        product['version'] = 1
        second = dict(product, file=product['name'] + '_v2', version=2,
                      refs=list(product['refs']), value=product['value'] + 2000)
        private = dict(product, name=f'{names[8]}_private', version=None,
                       file=f'{names[8]}_private', access='private', refs=[])
        protected = dict(private, name=f'{names[8]}_protected',
                         file=f'{names[8]}_protected', access='protected')
        consumer = dict(private, name=f'{names[8]}_internal',
                        file=f'{names[8]}_internal', access='public',
                        local_refs=[private['name'], protected['name']])
        project['model_details'] = [product, second, private, protected, consumer]
    if count > 9:
        project = projects[names[9]]
        template = project['model_details'][0]
        template['materialized'] = 'incremental'
        template['local_refs'] = [f'{names[9]}_seed']
        for suffix, version in [('explicit_v2', 2), ('latest', None)]:
            model = dict(template, name=f'{names[9]}_{suffix}',
                         file=f'{names[9]}_{suffix}', materialized='table', local_refs=[],
                         refs=[reference(names[8], projects[names[8]]['model_details'][0]['name'], version)])
            project['model_details'].append(model)
        project['resources'] = [
            {'name': f'{names[9]}_seed', 'type': 'seed'},
            {'name': f'{names[9]}_snapshot', 'type': 'snapshot'}]
    if count > 10:
        candidates = [first(i) for i in range(count) if i not in (10, 11)]
        for index, model in enumerate(projects[names[10]]['model_details'][:20]):
            model['refs'] = [candidates[index % len(candidates)]]
    if count > 11:
        for index in range(count):
            if index != 11:
                add_ref(11, first(index))
    for index in range(3, count):
        if kinds[index] == 'hub':
            for model in projects[names[index]]['model_details'][1:]:
                model['refs'] = [first(0)]

    owners = collections.defaultdict(set)
    for name, project in projects.items():
        for model in project['model_details']:
            owners[model['name']].add(name)
    for name, project in projects.items():
        for model in project['model_details']:
            model['explore'] = (f"{name}__{model['name']}" if len(owners[model['name']]) > 1
                                else model['name'])
            for ref in model['refs']:
                ref['explore'] = (f"{ref['project']}__{ref['model']}"
                                  if len(owners[ref['model']]) > 1 else ref['model'])
        project['models'] = sorted({m['name'] for m in project['model_details']})
        project['refs'] = sorted({(r['project'], r['model'])
                                  for m in project['model_details'] for r in m['refs']})
    order = []
    pending = dict(projects)
    while pending:
        ready = sorted(name for name, project in pending.items()
                       if all(ref[0] in order for ref in project['refs']))
        if not ready:
            raise ValueError('Generated topology contains a cycle')
        order.extend(ready)
        for name in ready:
            del pending[name]
    return projects, order


def sql_for(project, model):
    refs = []
    for ref in model['refs']:
        version = f", v={ref['version']}" if ref['version'] is not None else ''
        refs.append("{{ ref('" + ref['project'] + "', '" + ref['model'] + "'" + version + ') }}')
    refs.extend("{{ ref('" + name + "') }}" for name in model['local_refs'])
    amount = str(model['value']) + ''.join(f' + coalesce(r{i}.amount, 0)' for i in range(len(refs)))
    header = ("{{ config(materialized='incremental', unique_key='id') }}\n"
              if model['materialized'] == 'incremental' else '')
    return (header + f"select b.id::integer as id, '{project}'::text as label,\n"
            f'       ({amount})::numeric as amount, (b.id % 2 = 0) as active,\n'
            "       (date '2026-01-01' + b.id) as event_date\n"
            f"from generate_series(1, {model['rows']}) as b(id)\n" +
            ''.join(f'left join {ref} as r{i} on b.id = r{i}.id\n' for i, ref in enumerate(refs)))


def schema_for(project):
    lines = ['version: 2', 'groups:', '  - name: scale_internal', '    owner:',
             '      name: Scale fixture owner', '      email: scale@example.com', 'models:']
    seen_versions = set()
    for index, model in enumerate(project['model_details']):
        if model['version'] is not None:
            if model['name'] in seen_versions:
                continue
            seen_versions.add(model['name'])
        lines.extend([f"  - name: {model['name']}", f"    access: {model['access']}"])
        if model['access'] == 'private' or model['local_refs'] and project['kind'] == 'versioned':
            lines.append('    group: scale_internal')
        if model['version'] is not None:
            lines.extend(['    latest_version: 2', '    versions:', '      - v: 1', '      - v: 2'])
        lines.extend(['    config:', '      meta:', '        primary_key: id'])
        if index == 0:
            lines.extend(['        metrics: &row_metrics', '          row_count:',
                          '            type: count', '            sql: ${TABLE}.id'])
        else:
            lines.append('        metrics: *row_metrics')
        joins = sorted({r['explore'] for r in model['refs']})
        if joins:
            lines.append('        joins:')
            for joined in joins:
                lines.extend([f'          - join: {joined}',
                              f"            sql_on: ${{{model['explore']}.id}} = ${{{joined}.id}}",
                              '            relationship: one-to-one'])
        if index == 0:
            lines.append('    columns: &typed_columns')
            for name, dimension in COLUMNS:
                lines.extend([f'      - name: {name}', '        meta:', '          dimension:',
                              f'            type: {dimension}'])
        else:
            lines.append('    columns: *typed_columns')
    return '\n'.join(lines) + '\n'


def write_fixture(out, projects, order):
    out.mkdir(parents=True, exist_ok=True)
    generated = []

    def write(relative, text):
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
        generated.append(str(relative))

    for name, project in projects.items():
        config = {'name': name, 'version': '1.0.0', 'config-version': 2,
                  'profile': 'cross_source_refs', 'model-paths': ['models'],
                  'seed-paths': ['seeds'], 'snapshot-paths': ['snapshots'],
                  'models': {name: {'+materialized': 'table', '+access': 'public', '+schema': name}},
                  'seeds': {name: {'+schema': name}},
                  'snapshots': {name: {'+schema': name}}}
        write(Path(name) / 'dbt_project.yml', json.dumps(config, indent=2) + '\n')
        for model in project['model_details']:
            write(Path(name) / 'models' / (model['file'] + '.sql'), sql_for(name, model))
        write(Path(name) / 'models/schema.yml', schema_for(project))
        if project['kind'] == 'mixed':
            seed, snapshot = project['resources']
            write(Path(name) / 'seeds' / (seed['name'] + '.csv'),
                  'id,label,amount,active,event_date\n1,seed_one,10,true,2026-01-02\n2,seed_two,20,false,2026-01-03\n')
            write(Path(name) / 'snapshots' / (snapshot['name'] + '.sql'),
                  '{% snapshot ' + snapshot['name'] + ' %}\n' +
                  "{{ config(strategy='check', check_cols='all', unique_key='id') }}\n" +
                  "select * from {{ ref('" + seed['name'] + "') }}\n{% endsnapshot %}\n")
    for filename, payload in [('topology.json', projects), ('build_order.json', order),
                              ('register.json', [{'name': n, 'subpath': n} for n in order])]:
        write(Path(filename), json.dumps(payload, indent=2) + '\n')
    inventory = out / '.generated-files.json'
    if inventory.exists():
        for stale in set(json.loads(inventory.read_text())) - set(generated):
            path = out / stale
            if out.resolve() in path.resolve().parents and path.is_file():
                path.unlink()
    inventory.write_text(json.dumps(sorted(generated), indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description='Generate deterministic cross-source dbt scale projects.')
    parser.add_argument('--count', type=int, default=20)
    parser.add_argument('--out', type=Path, default=Path(__file__).parent / 'projects')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--large-models', type=int, default=1500)
    args = parser.parse_args()
    if args.count < 1 or args.large_models < 20:
        parser.error('--count must be positive and --large-models must be at least 20')
    projects, order = create_topology(args.count, args.large_models, args.seed)
    write_fixture(args.out, projects, order)
    counts = collections.Counter(p['kind'] for p in projects.values())
    depth = {}
    for name in order:
        depth[name] = 1 + max((depth[r[0]] for r in projects[name]['refs']), default=0)
    print(json.dumps({'projects': len(projects), 'kinds': dict(counts),
                      'model_nodes': sum(len(p['model_details']) for p in projects.values()),
                      'cross_project_refs': sum(len(m['refs']) for p in projects.values()
                                                for m in p['model_details']),
                      'longest_chain_projects': max(depth.values()),
                      'longest_chain_edges': max(depth.values()) - 1}, indent=2))


if __name__ == '__main__':
    main()
