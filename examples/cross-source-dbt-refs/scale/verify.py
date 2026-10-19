#!/usr/bin/env python3
import argparse
import collections
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent / 'tooling'))
from api import Api, ApiError


class Results:
    def __init__(self):
        self.failed = False

    def record(self, check, passed, detail):
        self.failed |= not passed
        cells = [check, 'PASS' if passed else 'FAIL', str(detail)]
        print('| ' + ' | '.join(cell.replace('|', '\\|').replace('\n', ' ') for cell in cells) + ' |', flush=True)


def metric_id(explore, table_name):
    metrics = explore['tables'][table_name]['metrics']
    for key, metric in metrics.items():
        if metric.get('name') == 'row_count' or key == 'row_count' or key == table_name + '_row_count':
            return table_name + '_' + metric.get('name', 'row_count')
    raise ValueError('row_count metric is missing')


def query_sample(candidates, limit):
    by_kind = collections.defaultdict(list)
    for item in candidates:
        by_kind[item[0]].append(item)
    selected = []
    for kind in sorted(by_kind):
        selected.append(by_kind[kind].pop(0))
        if len(selected) == limit:
            return selected
    for index in range(max((len(items) for items in by_kind.values()), default=0)):
        for kind in sorted(by_kind):
            if index < len(by_kind[kind]):
                selected.append(by_kind[kind][index])
                if len(selected) == limit:
                    return selected
    return selected


def main():
    parser = argparse.ArgumentParser(description='Check scale fixture explores, joins and query results after a refresh.')
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--cookie-jar', type=Path, default=Path('/tmp/ld.jar'))
    parser.add_argument('--topology', type=Path, default=Path(__file__).parent / 'projects/topology.json')
    parser.add_argument('--sample-size', type=int, default=10)
    args = parser.parse_args()
    if args.sample_size < 1:
        parser.error('--sample-size must be positive')
    topology = json.loads(args.topology.read_text())
    api = Api(args.api_url, args.project, args.cookie_jar)
    results = Results()
    print('| Check | Result | Details |\n| --- | --- | --- |', flush=True)
    _, sources = api.request('GET', '/dbt-sources')
    counts = collections.Counter(source['name'] for source in sources)
    missing = [name for name in topology if counts[name] != 1]
    results.record('Sources', not missing,
                   f'{sum(counts[name] == 1 for name in topology)}/{len(topology)} fixture sources; '
                   f'{len(sources)} total; missing or repeated: {", ".join(missing) or "none"}')
    _, summaries = api.request('GET', '/explores')
    summaries = {item['name']: item for item in summaries}
    details = {}
    candidates = []
    expected = set()
    good = 0
    for project_name, project in topology.items():
        for model in project['model_details']:
            if model['access'] == 'private':
                continue
            name = model['explore']
            if name not in expected:
                expected.add(name)
                summary = summaries.get(name)
                passed = summary is not None and not summary.get('errors')
                good += passed
                if not passed:
                    results.record(f'Explore {project_name}.{model["file"]}', False,
                                   'missing' if summary is None else json.dumps(summary['errors']))
            if not model['refs']:
                continue
            if name not in summaries or summaries[name].get('errors'):
                for ref in model['refs']:
                    results.record(f'Join {name} -> {ref["explore"]}', False, 'consuming explore is unavailable')
                continue
            try:
                if name not in details:
                    _, details[name] = api.request('GET', '/explores/' + quote(name, safe=''))
                explore = details[name]
                joins = {join['table'] for join in explore['joinedTables']}
                for ref in model['refs']:
                    target = ref['explore']
                    joined = target in joins and target in explore['tables']
                    table = explore['tables'].get(target, {})
                    package = table.get('dbtPackageName')
                    passed = joined and package == ref['project']
                    results.record(f'Join {name} -> {target}', passed,
                                   f'package={package}' if joined else 'upstream table is missing from joinedTables')
                    if passed:
                        candidates.append((project['kind'], project_name, model, ref, explore))
            except (ApiError, KeyError) as error:
                results.record(f'Joins for {name}', False, str(error))
    results.record('Explores', good == len(expected), f'{good}/{len(expected)} unique model explores without errors')
    samples = query_sample(candidates, args.sample_size)
    results.record('Query sample coverage', len(samples) == args.sample_size,
                   f'{len(samples)}/{args.sample_size} cross-project joins')
    for _, project_name, model, ref, explore in samples:
        name = explore['name']
        try:
            base_metric = metric_id(explore, explore['baseTable'])
            joined_metric = metric_id(explore, ref['explore'])
            body = {'exploreName': name, 'dimensions': [],
                    'metrics': [base_metric, joined_metric], 'filters': {}, 'sorts': [],
                    'limit': 1, 'tableCalculations': [], 'additionalMetrics': []}
            _, response = api.request('POST', '/explores/' + quote(name, safe='') + '/runQuery', body)
            rows = response['rows']
            passed = bool(rows)
            if passed:
                base_count = rows[0][base_metric]['value']['raw']
                joined_count = rows[0][joined_metric]['value']['raw']
                passed = base_count is not None and joined_count is not None and int(base_count) == model['rows'] and int(joined_count) > 0
            results.record(f'Query {project_name}.{model["file"]} -> {ref["model"]}', passed,
                           f'rows={len(rows)}; expected base count={model["rows"]}; values={json.dumps(rows[:1])}')
        except (ApiError, KeyError, ValueError, TypeError) as error:
            results.record(f'Query {name}', False, str(error))
    return int(results.failed)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ApiError, OSError, ValueError, KeyError) as error:
        print(f'| Verification | FAIL | {type(error).__name__}: {error} |')
        raise SystemExit(1)
