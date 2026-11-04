#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote

from api import Api, ApiError


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description='Register scale projects as GitHub dbt sources, or delete matching sources.')
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--branch')
    parser.add_argument('--repo', default='lightdash/lightdash')
    parser.add_argument('--subpath-prefix', default='/examples/cross-source-dbt-refs/scale/projects')
    parser.add_argument('--cookie-jar', type=Path, default=Path('/tmp/ld.jar'))
    parser.add_argument('--registry', type=Path, default=ROOT / 'projects/register.json')
    parser.add_argument('--delete', action='store_true')
    args = parser.parse_args()
    if not args.delete and (not args.branch or not os.environ.get('GITHUB_TOKEN')):
        parser.error('--branch and the GITHUB_TOKEN environment variable are required to register sources')
    registry = json.loads(args.registry.read_text())
    api = Api(args.api_url, args.project, args.cookie_jar)
    failed = False
    if args.delete:
        _, sources = api.request('GET', '/dbt-sources')
        wanted = {entry['name'] for entry in registry}
        for source in sources:
            if source['name'] in wanted:
                if source['isPrimary']:
                    print(f"{source['name']} skipped_primary")
                    failed = True
                    continue
                try:
                    status, _ = api.request('DELETE', '/dbt-sources/' + quote(source['projectDbtSourceUuid'], safe=''))
                    print(f"{source['name']} http_status={status}", flush=True)
                except ApiError as error:
                    print(f"{source['name']} {error}", flush=True)
                    failed = True
    else:
        for entry in registry:
            body = {'name': entry['name'], 'dbtConnection': {
                'type': 'github', 'authorization_method': 'personal_access_token',
                'personal_access_token': os.environ['GITHUB_TOKEN'], 'repository': args.repo,
                'branch': args.branch, 'project_sub_path': args.subpath_prefix.rstrip('/') + '/' + entry['subpath'],
                'host_domain': 'github.com'}}
            try:
                status, _ = api.request('POST', '/dbt-sources', body)
                print(f"{entry['name']} http_status={status}", flush=True)
            except ApiError as error:
                print(f"{entry['name']} {error}", flush=True)
                failed = True
    return int(failed)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ApiError, OSError, ValueError) as error:
        print(f'Registration failed: {type(error).__name__}')
        raise SystemExit(1)
