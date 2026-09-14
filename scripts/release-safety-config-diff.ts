import { execFileSync } from 'node:child_process';

export type ConfigChange =
    | {
          type: 'removed';
          name: string;
          previousDefault: string | null;
      }
    | {
          type: 'renamed';
          name: string;
          previousName: string;
          defaultValue: string | null;
      }
    | {
          type: 'defaultChanged';
          name: string;
          previousDefault: string | null;
          defaultValue: string | null;
      };

export interface ConfigSurface {
    checked: boolean;
    breaking: boolean | 'unknown';
    changes: ConfigChange[];
}

export interface ExtractedConfigValue {
    defaultValue: string | null;
    usageSignature: string;
}

export type ExtractedConfigSurface = Record<string, ExtractedConfigValue>;

export interface DiffConfigBetweenRefsOptions {
    fromRef: string;
    toRef: string;
    log?: (message: string) => void;
}

type TokenKind =
    | 'identifier'
    | 'string'
    | 'template'
    | 'dynamicTemplate'
    | 'number'
    | 'regex'
    | 'punctuation'
    | 'operator';

interface Token {
    kind: TokenKind;
    value: string;
    start: number;
    end: number;
    depth: number;
}

interface SourceRange {
    start: number;
    end: number;
}

interface DefaultValue extends SourceRange {
    value: string;
}

interface Usage {
    name: string;
    nameRange: SourceRange;
    ownerRange: SourceRange;
    defaultValue: DefaultValue | null;
}

interface ParsedFile {
    name: string;
    source: string;
    usages: Usage[];
}

type EscapedCharacter =
    | '0'
    | 'b'
    | 't'
    | 'n'
    | 'v'
    | 'f'
    | 'r'
    | "'"
    | '"'
    | '`'
    | '\\';

const CONFIG_DIRECTORY = 'packages/backend/src/config';
const UPPERCASE_NAME = /^[A-Z][A-Z0-9_]*$/;

function assertUnreachable(value: never, message: string): never {
    throw new Error(`${message}: ${String(value)}`);
}

function decodeEscapedCharacter(escaped: EscapedCharacter): string {
    switch (escaped) {
        case '0':
            return '\0';
        case 'b':
            return '\b';
        case 't':
            return '\t';
        case 'n':
            return '\n';
        case 'v':
            return '\v';
        case 'f':
            return '\f';
        case 'r':
            return '\r';
        case "'":
        case '"':
        case '`':
        case '\\':
            return escaped;
        default:
            return assertUnreachable(escaped, 'Unexpected escaped character');
    }
}

function decodeEscaped(value: string): string {
    return value.replace(
        /\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|([0btnvfr'"`\\]))/g,
        (_match, codePoint, unicode, hex, escaped: string | undefined) => {
            if (codePoint !== undefined) {
                return String.fromCodePoint(Number.parseInt(codePoint, 16));
            }
            if (unicode !== undefined || hex !== undefined) {
                return String.fromCharCode(
                    Number.parseInt(unicode ?? hex, 16),
                );
            }
            return escaped === undefined
                ? ''
                : decodeEscapedCharacter(escaped as EscapedCharacter);
        },
    );
}

function canStartRegex(previous: Token | undefined): boolean {
    if (previous === undefined || previous.kind === 'operator') return true;
    if (previous.kind === 'punctuation') {
        return ['(', '[', '{', ',', ';', ':'].includes(previous.value);
    }
    return (
        previous.kind === 'identifier' &&
        ['case', 'delete', 'return', 'throw', 'typeof', 'void'].includes(
            previous.value,
        )
    );
}

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    const stack: string[] = [];
    let index = 0;
    let valid = true;

    const add = (
        kind: TokenKind,
        value: string,
        start: number,
        end: number,
    ): void => {
        tokens.push({ kind, value, start, end, depth: stack.length });
    };

    while (index < source.length) {
        const character = source[index];
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (source.startsWith('//', index)) {
            const newline = source.indexOf('\n', index + 2);
            index = newline < 0 ? source.length : newline + 1;
            continue;
        }
        if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            if (end < 0) {
                valid = false;
                break;
            }
            index = end + 2;
            continue;
        }
        if (character === "'" || character === '"' || character === '`') {
            const start = index;
            const quote = character;
            let dynamic = false;
            index += 1;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (quote === '`' && source.startsWith('${', index)) {
                    dynamic = true;
                }
                if (source[index] === quote) break;
                index += 1;
            }
            if (index >= source.length) {
                valid = false;
                break;
            }
            index += 1;
            const raw = source.slice(start + 1, index - 1);
            add(
                quote === '`'
                    ? dynamic
                        ? 'dynamicTemplate'
                        : 'template'
                    : 'string',
                decodeEscaped(raw),
                start,
                index,
            );
            continue;
        }
        if (/[A-Za-z_$]/.test(character)) {
            const start = index;
            index += 1;
            while (index < source.length && /[\w$]/.test(source[index])) {
                index += 1;
            }
            add('identifier', source.slice(start, index), start, index);
            continue;
        }
        if (/\d/.test(character)) {
            const start = index;
            index += 1;
            while (index < source.length && /[\w.]/.test(source[index])) {
                index += 1;
            }
            add('number', source.slice(start, index), start, index);
            continue;
        }
        if (character === '/' && canStartRegex(tokens.at(-1))) {
            const start = index;
            let inClass = false;
            index += 1;
            while (index < source.length) {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (source[index] === '[') inClass = true;
                if (source[index] === ']') inClass = false;
                if (source[index] === '/' && !inClass) break;
                if (source[index] === '\n') break;
                index += 1;
            }
            if (index >= source.length || source[index] !== '/') {
                valid = false;
                break;
            }
            index += 1;
            while (index < source.length && /[a-z]/i.test(source[index])) {
                index += 1;
            }
            add('regex', source.slice(start, index), start, index);
            continue;
        }

        const operator = [
            '===',
            '!==',
            '>>>',
            '**=',
            '??=',
            '&&=',
            '||=',
            '=>',
            '??',
            '||',
            '&&',
            '?.',
            '==',
            '!=',
            '<=',
            '>=',
            '++',
            '--',
            '**',
            '+=',
            '-=',
            '*=',
            '/=',
            '<<',
            '>>',
        ].find((candidate) => source.startsWith(candidate, index));
        if (operator !== undefined) {
            add('operator', operator, index, index + operator.length);
            index += operator.length;
            continue;
        }
        if ('()[]{}.,;:'.includes(character)) {
            const closing = new Map([
                [')', '('],
                [']', '['],
                ['}', '{'],
            ]).get(character);
            if (closing !== undefined) {
                if (stack.pop() !== closing) valid = false;
            }
            add('punctuation', character, index, index + 1);
            if (['(', '[', '{'].includes(character)) stack.push(character);
            index += 1;
            continue;
        }
        add('operator', character, index, index + 1);
        index += 1;
    }

    if (stack.length > 0) valid = false;
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
        const token = tokens[tokenIndex];
        const next = tokens[tokenIndex + 1];
        if (
            token.kind === 'operator' &&
            token.value === '=' &&
            (next === undefined ||
                (next.kind === 'punctuation' &&
                    [')', ']', '}', ',', ';'].includes(next.value)))
        ) {
            valid = false;
        }
    }
    if (!valid) throw new Error('Could not parse TypeScript source');
    return tokens;
}

function isToken(
    token: Token | undefined,
    kind: TokenKind,
    value?: string,
): token is Token {
    return (
        token !== undefined &&
        token.kind === kind &&
        (value === undefined || token.value === value)
    );
}

function literalName(token: Token | undefined): string | null {
    if (
        token === undefined ||
        !['string', 'template'].includes(token.kind) ||
        !UPPERCASE_NAME.test(token.value)
    ) {
        return null;
    }
    return token.value;
}

function literalDefault(
    tokens: Token[],
    operatorIndex: number,
): DefaultValue | null {
    const token = tokens[operatorIndex + 1];
    if (token === undefined) return null;
    if (
        ['string', 'template', 'number'].includes(token.kind) ||
        (token.kind === 'identifier' &&
            ['true', 'false', 'null'].includes(token.value))
    ) {
        return { start: token.start, end: token.end, value: token.value };
    }
    const operand = tokens[operatorIndex + 2];
    if (
        token.kind === 'operator' &&
        ['-', '+'].includes(token.value) &&
        operand?.kind === 'number'
    ) {
        return {
            start: token.start,
            end: operand.end,
            value: `${token.value}${operand.value}`,
        };
    }
    return null;
}

function findDefault(
    tokens: Token[],
    referenceEndIndex: number,
): DefaultValue | null {
    const referenceDepth = tokens[referenceEndIndex].depth;
    for (
        let index = referenceEndIndex + 1;
        index < Math.min(tokens.length, referenceEndIndex + 12);
        index += 1
    ) {
        const token = tokens[index];
        if (
            token.kind === 'operator' &&
            ['??', '||'].includes(token.value)
        ) {
            return literalDefault(tokens, index);
        }
        if (
            (token.kind === 'punctuation' &&
                [',', ';', '{'].includes(token.value) &&
                token.depth <= referenceDepth) ||
            (token.kind === 'operator' &&
                !['!', '?', '<', '>'].includes(token.value))
        ) {
            return null;
        }
    }
    return null;
}

function findOwnerRange(tokens: Token[], referenceIndex: number): SourceRange {
    const reference = tokens[referenceIndex];
    let boundaryIndex = -1;
    let propertyColonIndex = -1;
    let declarationIndex = -1;
    for (let index = referenceIndex - 1; index >= 0; index -= 1) {
        const token = tokens[index];
        if (
            token.kind === 'identifier' &&
            ['const', 'let', 'var'].includes(token.value) &&
            token.depth <= reference.depth
        ) {
            declarationIndex = index;
            break;
        }
        if (
            token.kind === 'punctuation' &&
            ((token.value === ';' && token.depth <= reference.depth) ||
                (token.value === '{' && token.depth === reference.depth - 1))
        ) {
            break;
        }
    }
    for (let index = referenceIndex - 1; index >= 0; index -= 1) {
        const token = tokens[index];
        if (
            token.kind === 'punctuation' &&
            token.value === ':' &&
            token.depth === reference.depth
        ) {
            propertyColonIndex = index;
        }
        if (
            token.kind === 'punctuation' &&
            (([',', ';'].includes(token.value) &&
                token.depth === reference.depth) ||
                (token.value === '{' && token.depth === reference.depth - 1))
        ) {
            boundaryIndex = index;
            break;
        }
    }
    if (propertyColonIndex > boundaryIndex && declarationIndex < 0) {
        let endIndex = tokens.length;
        for (let index = referenceIndex + 1; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (
                token.kind === 'punctuation' &&
                ((token.value === ',' && token.depth === reference.depth) ||
                    (token.value === '}' &&
                        token.depth === reference.depth - 1))
            ) {
                endIndex = index;
                break;
            }
        }
        return {
            start: tokens[boundaryIndex + 1]?.start ?? reference.start,
            end: tokens[endIndex]?.start ?? tokens.at(-1)?.end ?? reference.end,
        };
    }

    const startIndex =
        declarationIndex >= 0 ? declarationIndex + 1 : boundaryIndex + 1;
    const ownerDepth = tokens[startIndex]?.depth ?? reference.depth;
    let endIndex = tokens.length;
    for (let index = referenceIndex + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (
            token.kind === 'punctuation' &&
            ((token.value === ';' && token.depth <= reference.depth) ||
                (token.value === ',' && token.depth === ownerDepth))
        ) {
            endIndex = index;
            break;
        }
    }
    return {
        start: tokens[startIndex]?.start ?? reference.start,
        end: tokens[endIndex]?.start ?? tokens.at(-1)?.end ?? reference.end,
    };
}

function collectUsages(source: string): Usage[] {
    const tokens = tokenize(source);
    const references: Array<{
        name: string;
        nameIndex: number;
        startIndex: number;
        endIndex: number;
    }> = [];

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (
            isToken(token, 'identifier', 'process') &&
            isToken(tokens[index + 1], 'punctuation', '.') &&
            isToken(tokens[index + 2], 'identifier', 'env')
        ) {
            const separator = tokens[index + 3];
            const nameToken = tokens[index + 4];
            if (
                isToken(separator, 'punctuation', '.') &&
                isToken(nameToken, 'identifier') &&
                UPPERCASE_NAME.test(nameToken.value)
            ) {
                references.push({
                    name: nameToken.value,
                    nameIndex: index + 4,
                    startIndex: index,
                    endIndex: index + 4,
                });
            } else if (
                isToken(separator, 'punctuation', '[') &&
                literalName(nameToken) !== null &&
                isToken(tokens[index + 5], 'punctuation', ']')
            ) {
                references.push({
                    name: nameToken.value,
                    nameIndex: index + 4,
                    startIndex: index,
                    endIndex: index + 5,
                });
            }
        }
        if (
            token.kind === 'identifier' &&
            token.value.includes('EnvironmentVariable') &&
            isToken(tokens[index + 1], 'punctuation', '(')
        ) {
            const nameToken = tokens[index + 2];
            const name = literalName(nameToken);
            if (name !== null) {
                references.push({
                    name,
                    nameIndex: index + 2,
                    startIndex: index,
                    endIndex: index + 2,
                });
            }
        }
    }

    return references.map((reference) => {
        const nameToken = tokens[reference.nameIndex];
        return {
            name: reference.name,
            nameRange: { start: nameToken.start, end: nameToken.end },
            ownerRange: findOwnerRange(tokens, reference.startIndex),
            defaultValue: findDefault(tokens, reference.endIndex),
        };
    });
}

function normalizedOwnerText(
    source: string,
    owner: SourceRange,
    usages: Usage[],
): string {
    const ownerStart = owner.start;
    const replacements = usages
        .filter(
            (usage) =>
                usage.nameRange.start >= ownerStart &&
                usage.nameRange.end <= owner.end,
        )
        .flatMap((usage) => [
            {
                start: usage.nameRange.start - ownerStart,
                end: usage.nameRange.end - ownerStart,
                value: '<ENV>',
            },
            ...(usage.defaultValue === null
                ? []
                : [
                      {
                          start: usage.defaultValue.start - ownerStart,
                          end: usage.defaultValue.end - ownerStart,
                          value: '<DEFAULT>',
                      },
                  ]),
        ])
        .sort((left, right) => right.start - left.start);

    let normalized = source.slice(owner.start, owner.end);
    for (const replacement of replacements) {
        normalized = `${normalized.slice(0, replacement.start)}${replacement.value}${normalized.slice(replacement.end)}`;
    }
    return normalized.replace(/\s+/g, ' ').trim();
}

function combinedDefault(usages: Usage[]): string | null {
    const values = [
        ...new Set(
            usages.flatMap((usage) =>
                usage.defaultValue === null
                    ? []
                    : [usage.defaultValue.value],
            ),
        ),
    ].sort();
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];
    return JSON.stringify(values);
}

function extractParsedFiles(files: Record<string, string>): ParsedFile[] {
    const entries = Object.entries(files).sort(([left], [right]) =>
        left.localeCompare(right),
    );
    return entries.map(([name, source]) => ({
        name,
        source,
        usages: collectUsages(source),
    }));
}

export function extractConfigSurface(
    files: Record<string, string>,
): ExtractedConfigSurface {
    const parsedFiles = extractParsedFiles(files);
    const byName = new Map<string, { defaults: Usage[]; signatures: string[] }>();

    for (const parsedFile of parsedFiles) {
        for (const usage of parsedFile.usages) {
            const entry = byName.get(usage.name) ?? {
                defaults: [],
                signatures: [],
            };
            entry.defaults.push(usage);
            entry.signatures.push(
                `${parsedFile.name}:${normalizedOwnerText(parsedFile.source, usage.ownerRange, parsedFile.usages)}`,
            );
            byName.set(usage.name, entry);
        }
    }

    return Object.fromEntries(
        [...byName.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, value]) => [
                name,
                {
                    defaultValue: combinedDefault(value.defaults),
                    usageSignature: JSON.stringify(value.signatures.sort()),
                },
            ]),
    );
}

function changeSortName(change: ConfigChange): string {
    switch (change.type) {
        case 'removed':
        case 'defaultChanged':
            return change.name;
        case 'renamed':
            return change.previousName;
        default:
            return assertUnreachable(change, 'Unexpected configuration change');
    }
}

function groupedBySignature(
    surface: ExtractedConfigSurface,
): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const [name, value] of Object.entries(surface)) {
        const names = grouped.get(value.usageSignature) ?? [];
        names.push(name);
        grouped.set(value.usageSignature, names);
    }
    return grouped;
}

export function diffConfigSurfaces(
    oldSurface: ExtractedConfigSurface,
    newSurface: ExtractedConfigSurface,
): ConfigSurface {
    const oldBySignature = groupedBySignature(oldSurface);
    const newBySignature = groupedBySignature(newSurface);
    const changes: ConfigChange[] = [];

    for (const name of Object.keys(oldSurface).sort()) {
        const previous = oldSurface[name];
        const current = newSurface[name];
        if (current !== undefined) {
            if (previous.defaultValue !== current.defaultValue) {
                changes.push({
                    type: 'defaultChanged',
                    name,
                    previousDefault: previous.defaultValue,
                    defaultValue: current.defaultValue,
                });
            }
            continue;
        }

        const oldNames = oldBySignature.get(previous.usageSignature) ?? [];
        const newNames = newBySignature.get(previous.usageSignature) ?? [];
        if (
            oldNames.length === 1 &&
            newNames.length === 1 &&
            oldSurface[newNames[0]] === undefined
        ) {
            const renamedTo = newNames[0];
            changes.push({
                type: 'renamed',
                name: renamedTo,
                previousName: name,
                defaultValue: newSurface[renamedTo].defaultValue,
            });
        } else {
            changes.push({
                type: 'removed',
                name,
                previousDefault: previous.defaultValue,
            });
        }
    }

    changes.sort((left, right) => {
        const nameOrder = changeSortName(left).localeCompare(
            changeSortName(right),
        );
        return nameOrder === 0 ? left.type.localeCompare(right.type) : nameOrder;
    });
    return { checked: true, breaking: changes.length > 0, changes };
}

function listConfigFiles(ref: string): string[] {
    const output = execFileSync(
        'git',
        ['ls-tree', '-r', '--name-only', ref, '--', CONFIG_DIRECTORY],
        {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    return output
        .split('\n')
        .filter((fileName) => /\.tsx?$/.test(fileName))
        .sort();
}

function readConfigFiles(ref: string): Record<string, string> {
    const fileNames = listConfigFiles(ref);
    if (fileNames.length === 0) {
        throw new Error(`No tracked TypeScript configuration files at ${ref}`);
    }
    return Object.fromEntries(
        fileNames.map((fileName) => [
            fileName,
            execFileSync('git', ['show', `${ref}:${fileName}`], {
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
                stdio: ['ignore', 'pipe', 'pipe'],
            }),
        ]),
    );
}

export function diffConfigBetweenRefs(
    options: DiffConfigBetweenRefsOptions,
): ConfigSurface {
    const log = options.log ?? (() => undefined);
    try {
        const oldSurface = extractConfigSurface(
            readConfigFiles(options.fromRef),
        );
        const newSurface = extractConfigSurface(readConfigFiles(options.toRef));
        const result = diffConfigSurfaces(oldSurface, newSurface);
        log(
            result.breaking
                ? `config checked: BREAKING (${result.changes.length})`
                : 'config checked: no breaking changes',
        );
        return result;
    } catch (error: unknown) {
        log(
            `config check degraded: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { checked: false, breaking: 'unknown', changes: [] };
    }
}
