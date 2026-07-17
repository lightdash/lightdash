#!/usr/bin/env python3

import argparse
import json
import re
from collections import Counter
from pathlib import Path

REQUIRED_HEADINGS = (
    '## Classification',
    '## Test inventory',
    '## Cypress command expansion',
    '## State, seed, and environment assumptions',
    '## Synchronization and timeout requirements',
    '## Locator and strictness risks',
    '## Nonstandard or surprising behavior',
    '## Coordination requirements',
    '## Exact port plan',
    '## Verification plan',
    '## Open questions',
    '## Port history',
)

CLASSIFICATION_FIELDS = {
    'recommendedRunner': 'Recommended runner',
    'executionLane': 'Execution lane',
    'activeTests': 'Active tests',
    'skippedTests': 'Skipped tests',
    'persistentMutation': 'Persistent mutation',
    'sharedPreviewDualRunSafe': 'Shared-preview dual-run safe',
    'difficulty': 'Difficulty total',
    'coordinationKeysRaw': 'Coordination keys',
    'analysisStatus': 'Analysis status',
}

ALLOWED_STATUSES = {
    'analyzed',
    'clarification-required',
    'coordination-required',
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--manifest',
        type=Path,
        default=Path('packages/e2e/migration/playwright/manifest.json'),
    )
    parser.add_argument('--update', action='store_true')
    return parser.parse_args()


def parse_classification(path: Path, text: str) -> dict[str, str]:
    prefix = text.split('## Test inventory', maxsplit=1)[0]
    parsed: dict[str, str] = {}

    for key, label in CLASSIFICATION_FIELDS.items():
        match = re.search(
            rf'^\s*(?:-\s*)?{re.escape(label)}:\s*(.+?)\s*$',
            prefix,
            re.MULTILINE,
        )
        if match is not None:
            parsed[key] = match.group(1).strip()

    if 'analysisStatus' not in parsed:
        raise ValueError(f'{path}: missing analysis status')

    normalized_status = parsed['analysisStatus'].strip('` .').split()[0]
    if normalized_status not in ALLOWED_STATUSES:
        raise ValueError(
            f'{path}: invalid analysis status {parsed["analysisStatus"]!r}',
        )

    parsed['analysisStatus'] = normalized_status
    return parsed


def main() -> None:
    args = parse_args()
    manifest = json.loads(args.manifest.read_text())
    failures: list[str] = []

    for item in manifest['files']:
        findings_path = Path(item['findings'])
        if not findings_path.exists():
            failures.append(f'{findings_path}: missing')
            continue

        text = findings_path.read_text()
        missing = [heading for heading in REQUIRED_HEADINGS if heading not in text]
        if missing:
            failures.append(f'{findings_path}: missing {missing}')
            continue

        try:
            classification = parse_classification(findings_path, text)
        except ValueError as error:
            failures.append(str(error))
            continue

        if args.update:
            item['status'] = classification['analysisStatus']
            item['classification'] = classification

    if failures:
        raise SystemExit('\n'.join(failures))

    if args.update:
        args.manifest.write_text(json.dumps(manifest, indent=2) + '\n')

    counts = Counter(item['status'] for item in manifest['files'])
    print(f'Validated {len(manifest["files"])} findings: {dict(counts)}')


if __name__ == '__main__':
    main()
