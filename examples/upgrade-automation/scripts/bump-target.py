#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


def split_target(target):
    if '#' not in target:
        raise ValueError('bump_target must use file#path.to.version format')
    filename, value_path = target.split('#', 1)
    file_path = Path(filename)
    if not filename or file_path.is_absolute() or '..' in file_path.parts:
        raise ValueError('bump_target file must be a relative path without ..')
    keys = value_path.split('.')
    if not value_path or any(not key for key in keys):
        raise ValueError('bump_target value path must be dot-separated')
    return file_path, keys


def json_value(data, keys):
    value = data
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            raise ValueError(f'path component not found: {key}')
        value = value[key]
    if not isinstance(value, str):
        raise ValueError('bump_target value must be a string')
    return value


def yaml_scalar_parts(raw_value):
    stripped = raw_value.strip()
    if not stripped:
        raise ValueError('bump_target must point to a scalar on the same line')
    if stripped[0] in {'"', "'"}:
        quote = stripped[0]
        end = 1
        while end < len(stripped):
            end = stripped.find(quote, end)
            if end < 0:
                break
            if quote == "'" and end + 1 < len(stripped) and stripped[end + 1] == "'":
                end += 2
                continue
            if quote == '"':
                backslashes = 0
                cursor = end - 1
                while cursor >= 0 and stripped[cursor] == '\\':
                    backslashes += 1
                    cursor -= 1
                if backslashes % 2 == 1:
                    end += 1
                    continue
            break
        if end < 0:
            raise ValueError('unterminated quoted YAML scalar')
        literal = stripped[: end + 1]
        trailing = stripped[end + 1 :]
        if quote == '"':
            try:
                value = json.loads(literal)
            except json.JSONDecodeError as error:
                raise ValueError(
                    'double-quoted YAML scalar must use JSON-compatible escapes',
                ) from error
        else:
            value = literal[1:-1].replace("''", "'")
        return value, quote, trailing
    marker = re.search(r'\s+#', stripped)
    if marker:
        return stripped[: marker.start()].rstrip(), '', stripped[marker.start() :]
    return stripped, '', ''


def find_yaml_value(lines, keys, replacement=None):
    stack = []
    matcher = re.compile(r'^(?P<indent> *)(?P<quote>["\']?)(?P<key>[^"\':]+)(?P=quote):(?P<space> *)(?P<value>.*)$')
    found = None
    block_scalar_indent = None
    for index, line in enumerate(lines):
        content = line.rstrip('\n')
        indent = len(content) - len(content.lstrip())
        if block_scalar_indent is not None:
            if not content.strip() or indent > block_scalar_indent:
                continue
            block_scalar_indent = None
        if content.lstrip().startswith('#'):
            continue
        match = matcher.match(content)
        if not match:
            continue
        indent = len(match.group('indent'))
        while stack and indent <= stack[-1][0]:
            stack.pop()
        key = match.group('key').strip()
        current_path = [item[1] for item in stack] + [key]
        raw_value = match.group('value')
        if current_path == keys:
            if re.fullmatch(r'[>|][0-9+-]*', raw_value.strip()):
                raise ValueError('bump_target must point to a scalar on the same line')
            value, quote, trailing = yaml_scalar_parts(raw_value)
            if found is not None:
                raise ValueError('bump_target YAML path is duplicated')
            found = (index, line, match, value, quote, trailing)
            continue
        if re.fullmatch(r'[>|][0-9+-]*', raw_value.strip()):
            block_scalar_indent = indent
            continue
        if not raw_value.strip():
            stack.append((indent, key))
    if found is None:
        raise ValueError('bump_target YAML path was not found')
    index, line, match, value, quote, trailing = found
    if replacement is not None:
        if '\n' in replacement or '\r' in replacement:
            raise ValueError('bump_target value must be a single line')
        rendered = replacement
        if quote == '"':
            rendered = json.dumps(replacement)
        elif quote == "'":
            rendered = "'" + replacement.replace("'", "''") + "'"
        elif not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]*', replacement):
            raise ValueError(
                'bump_target value must be a plain YAML-safe token; '
                'quote the value in the target file to write other strings'
            )
        lines[index] = (
            match.group('indent')
            + match.group('quote')
            + match.group('key')
            + match.group('quote')
            + ':'
            + match.group('space')
            + rendered
            + trailing
            + ('\n' if line.endswith('\n') else '')
        )
    return value


def read_value(file_path, keys):
    if file_path.suffix.lower() == '.json':
        return json_value(json.loads(file_path.read_text()), keys)
    return find_yaml_value(file_path.read_text().splitlines(keepends=True), keys)


def write_value(file_path, keys, replacement):
    if file_path.suffix.lower() == '.json':
        data = json.loads(file_path.read_text())
        parent = data
        for key in keys[:-1]:
            if not isinstance(parent, dict) or key not in parent:
                raise ValueError(f'path component not found: {key}')
            parent = parent[key]
        if not isinstance(parent, dict) or keys[-1] not in parent:
            raise ValueError(f'path component not found: {keys[-1]}')
        if not isinstance(parent[keys[-1]], str):
            raise ValueError('bump_target value must be a string')
        parent[keys[-1]] = replacement
        file_path.write_text(json.dumps(data, indent=2) + '\n')
        return
    lines = file_path.read_text().splitlines(keepends=True)
    find_yaml_value(lines, keys, replacement)
    file_path.write_text(''.join(lines))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['read', 'write'])
    parser.add_argument('target')
    parser.add_argument('value', nargs='?')
    args = parser.parse_args()
    file_path, keys = split_target(args.target)
    if args.command == 'read':
        print(read_value(file_path, keys))
        return
    if args.value is None:
        raise ValueError('write requires a value')
    write_value(file_path, keys, args.value)
    if read_value(file_path, keys) != args.value:
        raise ValueError('bump_target value did not round-trip')


if __name__ == '__main__':
    main()
