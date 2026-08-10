import * as fs from 'fs';

export type MigrationClassificationKind = 'safe' | 'breaking';

export interface BreakingChangeDeclaration {
    file: string;
    line: number;
    reason: string;
    requiredStop: boolean;
}

export interface MigrationClassificationDeclaration {
    file: string;
    line: number;
    kind: MigrationClassificationKind;
    reason: string;
}

export interface ChangeDeclarationDiagnostic {
    file: string;
    line: number;
    declaration: 'breaking' | 'classification' | 'source';
    message: string;
}

export interface ParsedChangeDeclarations {
    breaking: BreakingChangeDeclaration | null;
    classification: MigrationClassificationDeclaration | null;
    diagnostics: ChangeDeclarationDiagnostic[];
}

export interface ChangeDeclarationSource {
    file: string;
    source: string;
}

export interface CollectedChangeDeclarations {
    breaking: BreakingChangeDeclaration[];
    classifications: MigrationClassificationDeclaration[];
    diagnostics: ChangeDeclarationDiagnostic[];
}

type TargetDeclaration = 'breaking' | 'classification';
type TokenKind = 'identifier' | 'string' | 'template' | 'number' | 'punctuation' | 'invalid';

interface Token {
    kind: TokenKind;
    text: string;
    value: string;
    line: number;
}

interface ParsedObject {
    values: Map<string, Token>;
    next: number;
    valid: boolean;
}

function decodeEscape(source: string, index: number): { value: string; next: number } | null {
    const escaped = source[index];
    const simple: Record<string, string> = {
        "'": "'",
        '"': '"',
        '\\': '\\',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
        '0': '\0',
    };
    if (escaped in simple) return { value: simple[escaped], next: index + 1 };
    if (escaped === '\n') return { value: '', next: index + 1 };
    if (escaped === '\r' && source[index + 1] === '\n') return { value: '', next: index + 2 };
    if (escaped === 'x') {
        const hex = source.slice(index + 1, index + 3);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
            return { value: String.fromCharCode(Number.parseInt(hex, 16)), next: index + 3 };
        }
        return null;
    }
    if (escaped === 'u' && source[index + 1] === '{') {
        const close = source.indexOf('}', index + 2);
        if (close < 0) return null;
        const hex = source.slice(index + 2, close);
        if (!/^[0-9a-f]{1,6}$/i.test(hex)) return null;
        const codePoint = Number.parseInt(hex, 16);
        if (codePoint > 0x10ffff) return null;
        return { value: String.fromCodePoint(codePoint), next: close + 1 };
    }
    if (escaped === 'u') {
        const hex = source.slice(index + 1, index + 5);
        if (/^[0-9a-f]{4}$/i.test(hex)) {
            return { value: String.fromCharCode(Number.parseInt(hex, 16)), next: index + 5 };
        }
        return null;
    }
    return { value: escaped, next: index + 1 };
}

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    let line = 1;

    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) {
            if (char === '\n') line += 1;
            index += 1;
            continue;
        }
        if (char === '/' && source[index + 1] === '/') {
            index += 2;
            while (index < source.length && source[index] !== '\n') index += 1;
            continue;
        }
        if (char === '/' && source[index + 1] === '*') {
            index += 2;
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                if (source[index] === '\n') line += 1;
                index += 1;
            }
            index = Math.min(source.length, index + 2);
            continue;
        }
        if (char === "'" || char === '"') {
            const tokenLine = line;
            const quote = char;
            const start = index;
            let value = '';
            let valid = true;
            index += 1;
            while (index < source.length && source[index] !== quote) {
                if (source[index] === '\n' || source[index] === '\r') {
                    valid = false;
                    break;
                }
                if (source[index] === '\\') {
                    const decoded = decodeEscape(source, index + 1);
                    if (!decoded) {
                        valid = false;
                        index += 1;
                        continue;
                    }
                    value += decoded.value;
                    index = decoded.next;
                    continue;
                }
                value += source[index];
                index += 1;
            }
            if (source[index] === quote) index += 1;
            else valid = false;
            tokens.push({
                kind: valid ? 'string' : 'invalid',
                text: source.slice(start, index),
                value,
                line: tokenLine,
            });
            continue;
        }
        if (char === '`') {
            const tokenLine = line;
            const start = index;
            index += 1;
            while (index < source.length) {
                if (source[index] === '\n') line += 1;
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (source[index] === '`') {
                    index += 1;
                    break;
                }
                index += 1;
            }
            tokens.push({
                kind: 'template',
                text: source.slice(start, index),
                value: source.slice(start + 1, Math.max(start + 1, index - 1)),
                line: tokenLine,
            });
            continue;
        }
        if (/[A-Za-z_$]/.test(char)) {
            const start = index;
            index += 1;
            while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
            const text = source.slice(start, index);
            tokens.push({ kind: 'identifier', text, value: text, line });
            continue;
        }
        if (/[0-9]/.test(char)) {
            const start = index;
            index += 1;
            while (index < source.length && /[0-9A-Za-z_.]/.test(source[index])) index += 1;
            const text = source.slice(start, index);
            tokens.push({ kind: 'number', text, value: text, line });
            continue;
        }
        const punctuation = source.startsWith('...', index) ? '...' : char;
        tokens.push({ kind: 'punctuation', text: punctuation, value: punctuation, line });
        index += punctuation.length;
    }

    return tokens;
}

function diagnostic(
    diagnostics: ChangeDeclarationDiagnostic[],
    file: string,
    line: number,
    declaration: ChangeDeclarationDiagnostic['declaration'],
    message: string,
): void {
    diagnostics.push({ file, line, declaration, message });
}

function parseExactObject(
    tokens: readonly Token[],
    start: number,
    expected: readonly string[],
    declaration: TargetDeclaration,
    file: string,
    diagnostics: ChangeDeclarationDiagnostic[],
): ParsedObject {
    const values = new Map<string, Token>();
    const startToken = tokens[start];
    if (!startToken || startToken.text !== '{') {
        diagnostic(
            diagnostics,
            file,
            startToken?.line ?? 1,
            declaration,
            `export const ${declaration} must be an object literal with ${expected.join(' and ')}`,
        );
        return { values, next: start + 1, valid: false };
    }

    let index = start + 1;
    let valid = true;
    while (index < tokens.length && tokens[index].text !== '}') {
        const name = tokens[index];
        if (name.kind !== 'identifier' || !expected.includes(name.text)) {
            diagnostic(
                diagnostics,
                file,
                name.line,
                declaration,
                `export const ${declaration} has unsupported property ${JSON.stringify(name.text)}; expected exactly ${expected.join(' and ')}`,
            );
            valid = false;
        }
        if (tokens[index + 1]?.text !== ':') {
            diagnostic(
                diagnostics,
                file,
                name.line,
                declaration,
                `export const ${declaration} must use explicit property assignments`,
            );
            return { values, next: index + 1, valid: false };
        }
        const value = tokens[index + 2];
        if (!value) {
            diagnostic(
                diagnostics,
                file,
                name.line,
                declaration,
                `export const ${declaration}.${name.text} is missing a literal value`,
            );
            return { values, next: index + 2, valid: false };
        }
        if (values.has(name.text)) {
            diagnostic(
                diagnostics,
                file,
                name.line,
                declaration,
                `export const ${declaration} declares ${name.text} more than once`,
            );
            valid = false;
        } else if (expected.includes(name.text)) {
            values.set(name.text, value);
        }
        index += 3;
        if (tokens[index]?.text === ',') {
            index += 1;
        } else if (tokens[index]?.text !== '}') {
            diagnostic(
                diagnostics,
                file,
                tokens[index]?.line ?? name.line,
                declaration,
                `export const ${declaration} properties must be separated by commas`,
            );
            return { values, next: index, valid: false };
        }
    }

    if (tokens[index]?.text !== '}') {
        diagnostic(
            diagnostics,
            file,
            startToken.line,
            declaration,
            `export const ${declaration} object literal is not closed`,
        );
        valid = false;
    } else {
        index += 1;
    }
    for (const name of expected) {
        if (!values.has(name)) {
            diagnostic(
                diagnostics,
                file,
                startToken.line,
                declaration,
                `export const ${declaration} is missing required property ${name}`,
            );
            valid = false;
        }
    }
    return { values, next: index, valid };
}

function parseClassificationType(tokens: readonly Token[], start: number, end: number): boolean {
    if (tokens[start]?.text !== '{' || tokens[end - 1]?.text !== '}') return false;
    const members = new Map<string, Token[]>();
    let index = start + 1;
    while (index < end - 1) {
        const name = tokens[index];
        if (name?.kind !== 'identifier' || tokens[index + 1]?.text !== ':') return false;
        index += 2;
        const value: Token[] = [];
        while (index < end - 1 && tokens[index].text !== ';' && tokens[index].text !== ',') {
            value.push(tokens[index]);
            index += 1;
        }
        if (members.has(name.text)) return false;
        members.set(name.text, value);
        if (tokens[index]?.text === ';' || tokens[index]?.text === ',') index += 1;
    }
    if (members.size !== 2) return false;
    const reason = members.get('reason');
    const kind = members.get('kind');
    if (!reason || reason.length !== 1 || reason[0].text !== 'string' || !kind || kind.length !== 3) {
        return false;
    }
    return (
        kind[0].kind === 'string' &&
        kind[1].text === '|' &&
        kind[2].kind === 'string' &&
        new Set([kind[0].value, kind[2].value]).size === 2 &&
        [kind[0].value, kind[2].value].includes('safe') &&
        [kind[0].value, kind[2].value].includes('breaking')
    );
}

function literalReason(
    token: Token,
    declaration: TargetDeclaration,
    file: string,
    diagnostics: ChangeDeclarationDiagnostic[],
): string | null {
    if (token.kind !== 'string') {
        diagnostic(
            diagnostics,
            file,
            token.line,
            declaration,
            `export const ${declaration}.reason must be a non-empty string literal`,
        );
        return null;
    }
    if (token.value.trim().length === 0) {
        diagnostic(
            diagnostics,
            file,
            token.line,
            declaration,
            `export const ${declaration}.reason must not be empty or whitespace`,
        );
        return null;
    }
    return token.value;
}

function findAssignment(tokens: readonly Token[], start: number): { equals: number; annotationStart: number | null } {
    let index = start;
    let annotationStart: number | null = null;
    let depth = 0;
    while (index < tokens.length) {
        const text = tokens[index].text;
        if (text === ':' && depth === 0 && annotationStart === null) annotationStart = index + 1;
        if (text === '=' && depth === 0) return { equals: index, annotationStart };
        if (text === '{' || text === '(' || text === '[') depth += 1;
        if (text === '}' || text === ')' || text === ']') depth -= 1;
        if ((text === ';' || text === ',') && depth === 0) break;
        index += 1;
    }
    return { equals: -1, annotationStart };
}

export function parseChangeDeclarations(
    source: string,
    file = '<source>',
): ParsedChangeDeclarations {
    const tokens = tokenize(source);
    const diagnostics: ChangeDeclarationDiagnostic[] = [];
    const seen = new Set<TargetDeclaration>();
    let breaking: BreakingChangeDeclaration | null = null;
    let classification: MigrationClassificationDeclaration | null = null;
    let depth = 0;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.text === '{' || token.text === '(' || token.text === '[') depth += 1;
        if (token.text === '}' || token.text === ')' || token.text === ']') depth -= 1;
        if (depth !== 0) continue;
        if (
            ['const', 'let', 'var'].includes(token.text) &&
            tokens[index - 1]?.text === 'export'
        ) {
            continue;
        }

        const exported = token.text === 'export';
        const declarationKeyword = exported ? tokens[index + 1] : token;
        const nameToken = exported ? tokens[index + 2] : tokens[index + 1];
        if (
            !declarationKeyword ||
            !['const', 'let', 'var'].includes(declarationKeyword.text) ||
            !nameToken ||
            (nameToken.text !== 'breaking' && nameToken.text !== 'classification')
        ) {
            continue;
        }

        const name = nameToken.text as TargetDeclaration;
        if (seen.has(name)) {
            diagnostic(
                diagnostics,
                file,
                nameToken.line,
                name,
                `export const ${name} must be declared exactly once`,
            );
            continue;
        }
        seen.add(name);
        if (!exported || declarationKeyword.text !== 'const') {
            diagnostic(
                diagnostics,
                file,
                nameToken.line,
                name,
                `${name} must be declared as a top-level export const`,
            );
            continue;
        }

        const assignment = findAssignment(tokens, index + 3);
        if (assignment.equals < 0) {
            diagnostic(
                diagnostics,
                file,
                nameToken.line,
                name,
                `export const ${name} must assign an object literal`,
            );
            continue;
        }
        if (name === 'breaking' && assignment.annotationStart !== null) {
            diagnostic(
                diagnostics,
                file,
                tokens[assignment.annotationStart]?.line ?? nameToken.line,
                name,
                'export const breaking must be an unannotated object literal with reason and requiredStop',
            );
            continue;
        }
        if (
            name === 'classification' &&
            assignment.annotationStart !== null &&
            !parseClassificationType(tokens, assignment.annotationStart, assignment.equals)
        ) {
            diagnostic(
                diagnostics,
                file,
                tokens[assignment.annotationStart]?.line ?? nameToken.line,
                name,
                'export const classification type must be exactly { kind: "safe" | "breaking"; reason: string }',
            );
            continue;
        }

        const expected = name === 'breaking' ? ['reason', 'requiredStop'] : ['kind', 'reason'];
        const object = parseExactObject(
            tokens,
            assignment.equals + 1,
            expected,
            name,
            file,
            diagnostics,
        );
        if (tokens[object.next]?.text === ',') {
            diagnostic(
                diagnostics,
                file,
                tokens[object.next].line,
                name,
                `export const ${name} must be the only declaration in its statement`,
            );
            object.valid = false;
        }
        if (!object.valid) continue;

        const reason = literalReason(
            object.values.get('reason') as Token,
            name,
            file,
            diagnostics,
        );
        if (name === 'breaking') {
            const requiredStop = object.values.get('requiredStop') as Token;
            if (
                requiredStop.kind !== 'identifier' ||
                (requiredStop.value !== 'true' && requiredStop.value !== 'false')
            ) {
                diagnostic(
                    diagnostics,
                    file,
                    requiredStop.line,
                    name,
                    'export const breaking.requiredStop must be the boolean literal true or false',
                );
                continue;
            }
            if (reason !== null) {
                breaking = {
                    file,
                    line: nameToken.line,
                    reason,
                    requiredStop: requiredStop.value === 'true',
                };
            }
        } else {
            const kind = object.values.get('kind') as Token;
            if (
                kind.kind !== 'string' ||
                (kind.value !== 'safe' && kind.value !== 'breaking')
            ) {
                diagnostic(
                    diagnostics,
                    file,
                    kind.line,
                    name,
                    'export const classification.kind must be the string literal "safe" or "breaking"',
                );
                continue;
            }
            if (reason !== null) {
                classification = {
                    file,
                    line: nameToken.line,
                    kind: kind.value,
                    reason,
                };
            }
        }
    }

    return { breaking, classification, diagnostics };
}

export const parseBreakingChangeDeclarations = parseChangeDeclarations;

export function collectChangeDeclarationsFromSources(
    sources: readonly ChangeDeclarationSource[],
): CollectedChangeDeclarations {
    const collected: CollectedChangeDeclarations = {
        breaking: [],
        classifications: [],
        diagnostics: [],
    };
    for (const source of sources) {
        const parsed = parseChangeDeclarations(source.source, source.file);
        if (parsed.breaking) collected.breaking.push(parsed.breaking);
        if (parsed.classification) collected.classifications.push(parsed.classification);
        collected.diagnostics.push(...parsed.diagnostics);
    }
    return collected;
}

export function collectChangeDeclarations(
    paths: readonly string[],
    readFile: (path: string) => string = (path) => fs.readFileSync(path, 'utf8'),
): CollectedChangeDeclarations {
    const sources: ChangeDeclarationSource[] = [];
    const diagnostics: ChangeDeclarationDiagnostic[] = [];
    for (const path of paths) {
        try {
            sources.push({ file: path, source: readFile(path) });
        } catch (error) {
            diagnostics.push({
                file: path,
                line: 1,
                declaration: 'source',
                message: `could not read source: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    const collected = collectChangeDeclarationsFromSources(sources);
    collected.diagnostics.unshift(...diagnostics);
    return collected;
}

export const collectBreakingChangeDeclarations = collectChangeDeclarations;

export function formatChangeDeclarationDiagnostic(diagnosticValue: ChangeDeclarationDiagnostic): string {
    return `${diagnosticValue.file}:${diagnosticValue.line} ${diagnosticValue.message}`;
}
