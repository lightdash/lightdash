#!/usr/bin/env python3
import json
import re
import sys

CONTROL_CHARACTERS = re.compile(r'[\x00-\x1f\x7f]')
REASON_LIMIT = 600
LABEL_LIMIT = 200
SUMMARY_LIMIT = 700
MIGRATION_FILE_LIMIT = 10
ATTRIBUTION = (
    '_Written by Claude from the release-safety data below. '
    'The per-release facts that follow come straight from the release itself._'
)


def sanitize(value, limit):
    if not isinstance(value, str):
        return ''
    text = CONTROL_CHARACTERS.sub(' ', value)
    text = ' '.join(text.split())
    text = text.replace('`', "'").replace('@', '＠').replace('<', '‹').replace('>', '›')
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + '…'
    return text


def code_span(value, fallback='unknown'):
    text = sanitize(value, LABEL_LIMIT)
    return f'`{text}`' if text else f'`{fallback}`'


def load_summary(path):
    if not path:
        return ''
    try:
        with open(path, encoding='utf-8') as handle:
            return sanitize(handle.read(), SUMMARY_LIMIT)
    except OSError:
        return ''


def as_dict(value):
    return value if isinstance(value, dict) else {}


def as_list(value):
    return value if isinstance(value, list) else []


def as_count(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def heaviness_phrase(heaviness):
    phrases = []
    if heaviness.get('locksTable'):
        phrases.append('locks the table')
    if heaviness.get('rewritesTable'):
        phrases.append('rewrites the table')
    if heaviness.get('scansTable'):
        phrases.append('scans the table')
    return ', '.join(phrases)


def safety_line(safety, compatibility):
    strategy = compatibility.get('recommendedStrategy')
    strategy_sentence = ''
    if isinstance(strategy, str) and strategy:
        strategy_sentence = f' Recommended deploy strategy: {code_span(strategy)}.'
    if safety == 'unknown':
        return (
            '- Rolling update: unknown. The release-safety data for this release is incomplete, '
            'so the gate could not confirm the hop is safe. This is not a known break.'
            + strategy_sentence
        )
    return '- Rolling update: unsafe.' + strategy_sentence


def migration_lines(migrations):
    count = as_count(migrations.get('count'))
    if not count:
        return ['- Migrations: none']
    core = as_count(migrations.get('coreCount'))
    enterprise = as_count(migrations.get('eeCount'))
    lines = [f'- Migrations: {count} ({core} core, {enterprise} EE)']
    files = as_list(migrations.get('files'))
    for migration in files[:MIGRATION_FILE_LIMIT]:
        migration = as_dict(migration)
        entry = f'  - {code_span(migration.get("name"), "unnamed migration")}'
        edition = sanitize(migration.get('edition'), LABEL_LIMIT)
        if edition:
            entry += f' ({edition})'
        tables = [code_span(table) for table in as_list(migration.get('tables')) if isinstance(table, str)]
        if tables:
            entry += ' on ' + ', '.join(tables)
        phrase = heaviness_phrase(as_dict(migration.get('heaviness')))
        if phrase:
            entry += f' — {phrase}'
        lines.append(entry)
    remaining = len(files) - MIGRATION_FILE_LIMIT
    if remaining > 0:
        lines.append(f'  - and {remaining} more migration file(s) not listed')
    return lines


def declared_break_lines(declared_breaks):
    lines = []
    for declared in as_list(declared_breaks):
        declared = as_dict(declared)
        reason = sanitize(declared.get('reason'), REASON_LIMIT)
        entry = f'- Declared break {code_span(declared.get("id"), "unidentified")}'
        if reason:
            entry += f' — {reason}'
        if declared.get('requiredStop'):
            entry += ' (this release is a required stop)'
        lines.append(entry)
    return lines


def api_lines(api):
    lines = []
    rest = as_count(as_dict(api.get('rest')).get('breakingCount'))
    if rest:
        lines.append(f'- Breaking REST API changes: {rest}')
    mcp = as_count(as_dict(api.get('mcp')).get('breakingCount'))
    if mcp:
        lines.append(f'- Breaking MCP tool changes: {mcp}')
    return lines


def render_entry(entry):
    version = sanitize(entry.get('version'), LABEL_LIMIT)
    lines = [f'#### {version}', '']
    detail = entry.get('detail')
    if not isinstance(detail, dict):
        lines.append(
            f'- The release-safety detail for {code_span(version)} could not be read, '
            'so the reason for this hold is unavailable.'
        )
        lines.append('')
        return lines
    lines.append(safety_line(entry.get('rollingUpdateSafe'), as_dict(detail.get('compatibility'))))
    lines.extend(migration_lines(as_dict(detail.get('migrations'))))
    lines.extend(declared_break_lines(detail.get('declaredBreaks')))
    lines.extend(api_lines(as_dict(detail.get('api'))))
    lines.append('')
    return lines


def main():
    with open(sys.argv[1], encoding='utf-8') as handle:
        manifest = json.load(handle)
    entries = as_list(manifest.get('entries'))
    if not entries:
        return 0
    lines = ['### Why this is held', '']
    summary = load_summary(sys.argv[2] if len(sys.argv) > 2 else None)
    if summary:
        lines.extend([summary, '', ATTRIBUTION, ''])
    for entry in entries:
        lines.extend(render_entry(as_dict(entry)))
    remaining = as_count(manifest.get('total')) - len(entries)
    if remaining > 0:
        lines.append(f'{remaining} further release(s) between the current pin and this target are also not safe.')
        lines.append('')
    sys.stdout.write('\n'.join(lines).rstrip() + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
