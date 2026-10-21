import json
import sys
from pathlib import Path

from runtime import CHECKOUT as checkout, REAL_DBT
fixture = checkout / 'examples/multi-repo-dbt-sim'
sys.path.insert(0, str(fixture))
from generate import generate, model_schema

root = fixture / '.work/exploratory'
registry = generate(root, 'small', 42)
models = {'payments': ['ledger', 'payments'], 'merchants': ['merchant', 'settlement'], 'finance': ['finance_base'], 'marketing': ['marketing_base']}
registry['sources'] = [s for s in registry['sources'] if s['name'] in models]
for source in registry['sources']:
    name = source['name']
    source.update(models=models[name], upstreams=[])
    repo = root / 'repos' / name
    for p in (repo / 'models').rglob('*'):
        if p.is_file():
            p.unlink()
    for filename in ['dbt_loom.config.yml', 'dbt_loom.config.yml.sim-bootstrap']:
        p = repo / filename
        if p.exists():
            p.unlink()
    (repo / 'dbt_project.yml').write_text(json.dumps({'name': name, 'version': '1.0.0', 'config-version': 2, 'profile': 'multi_repo_sim', 'model-paths': ['models'], 'seed-paths': ['seeds'], 'models': {name: {'+materialized': 'table', '+schema': name}}, 'seeds': {name: {'+schema': name}}}, indent=2))
    schemas = []
    for model in models[name]:
        (repo / 'models' / (model + '.sql')).write_text("select * from {{ ref('" + name + "_seed') }}\n")
        schema = model_schema(model)
        schema['description'] = 'initial synthetic definition'
        schemas.append(schema)
    (repo / 'models/schema.yml').write_text(json.dumps({'version': 2, 'models': schemas}, indent=2))
(root / 'registry.json').write_text(json.dumps(registry, indent=2))
print('Prepared four independent synthetic sources, six models')
