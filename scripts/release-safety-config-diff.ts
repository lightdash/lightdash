import { execFileSync } from 'node:child_process';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { API } from 'typescript/unstable/sync';
import {
    isAsExpression,
    isBinaryExpression,
    isCallExpression,
    isElementAccessExpression,
    isIdentifier,
    isNoSubstitutionTemplateLiteral,
    isNonNullExpression,
    isNumericLiteral,
    isParenthesizedExpression,
    isPartiallyEmittedExpression,
    isPrefixUnaryExpression,
    isPropertyAccessExpression,
    isPropertyAssignment,
    isSatisfiesExpression,
    isStatement,
    isStringLiteral,
    isTypeAssertion,
    isVariableDeclaration,
    type Node,
    type SourceFile,
    SyntaxKind,
} from 'typescript/unstable/ast';

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

interface DefaultValue {
    node: Node;
    value: string;
}

interface Usage {
    name: string;
    nameNode: Node;
    owner: Node;
    defaultValue: DefaultValue | null;
}

interface ParsedFile {
    name: string;
    sourceFile: SourceFile;
    usages: Usage[];
}

const CONFIG_DIRECTORY = 'packages/backend/src/config';
const UPPERCASE_NAME = /^[A-Z][A-Z0-9_]*$/;

function assertUnreachable(value: never, message: string): never {
    throw new Error(`${message}: ${String(value)}`);
}

function sameNode(left: Node, right: Node): boolean {
    return (
        left.kind === right.kind &&
        left.pos === right.pos &&
        left.end === right.end
    );
}

function isProcessEnv(node: Node): boolean {
    return (
        isPropertyAccessExpression(node) &&
        isIdentifier(node.expression) &&
        node.expression.text === 'process' &&
        isIdentifier(node.name) &&
        node.name.text === 'env'
    );
}

function literalEnvironmentName(node: Node): string | null {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
        return UPPERCASE_NAME.test(node.text) ? node.text : null;
    }
    return null;
}

function environmentReference(node: Node): {
    name: string;
    nameNode: Node;
} | null {
    if (
        isPropertyAccessExpression(node) &&
        isProcessEnv(node.expression) &&
        isIdentifier(node.name) &&
        UPPERCASE_NAME.test(node.name.text)
    ) {
        return { name: node.name.text, nameNode: node.name };
    }

    if (isElementAccessExpression(node) && isProcessEnv(node.expression)) {
        const name = literalEnvironmentName(node.argumentExpression);
        if (name !== null) {
            return { name, nameNode: node.argumentExpression };
        }
    }

    if (!isCallExpression(node) || node.arguments.length === 0) {
        return null;
    }

    let helperName: string | null = null;
    if (isIdentifier(node.expression)) {
        helperName = node.expression.text;
    } else if (
        isPropertyAccessExpression(node.expression) &&
        isIdentifier(node.expression.name)
    ) {
        helperName = node.expression.name.text;
    }
    if (helperName === null || !helperName.includes('EnvironmentVariable')) {
        return null;
    }

    const nameNode = node.arguments[0];
    const name = literalEnvironmentName(nameNode);
    return name === null ? null : { name, nameNode };
}

function literalDefault(node: Node): string | null {
    if (
        isStringLiteral(node) ||
        isNoSubstitutionTemplateLiteral(node) ||
        isNumericLiteral(node)
    ) {
        return node.text;
    }
    if (node.kind === SyntaxKind.TrueKeyword) return 'true';
    if (node.kind === SyntaxKind.FalseKeyword) return 'false';
    if (node.kind === SyntaxKind.NullKeyword) return 'null';
    if (
        isPrefixUnaryExpression(node) &&
        (node.operator === SyntaxKind.MinusToken ||
            node.operator === SyntaxKind.PlusToken) &&
        isNumericLiteral(node.operand)
    ) {
        return `${node.operator === SyntaxKind.MinusToken ? '-' : '+'}${node.operand.text}`;
    }
    return null;
}

function wrapsExpression(parent: Node, child: Node): boolean {
    if (
        isParenthesizedExpression(parent) ||
        isAsExpression(parent) ||
        isSatisfiesExpression(parent) ||
        isNonNullExpression(parent) ||
        isTypeAssertion(parent) ||
        isPartiallyEmittedExpression(parent)
    ) {
        return sameNode(parent.expression, child);
    }
    return false;
}

function findDefault(referenceNode: Node): DefaultValue | null {
    let expression = referenceNode;
    while (expression.parent && wrapsExpression(expression.parent, expression)) {
        expression = expression.parent;
    }
    const parent = expression.parent;
    if (
        !parent ||
        !isBinaryExpression(parent) ||
        !sameNode(parent.left, expression) ||
        (parent.operatorToken.kind !== SyntaxKind.BarBarToken &&
            parent.operatorToken.kind !== SyntaxKind.QuestionQuestionToken)
    ) {
        return null;
    }
    const value = literalDefault(parent.right);
    return value === null ? null : { node: parent.right, value };
}

function findUsageOwner(node: Node): Node {
    let current = node;
    while (current.parent) {
        current = current.parent;
        if (
            isPropertyAssignment(current) ||
            isVariableDeclaration(current) ||
            isStatement(current)
        ) {
            return current;
        }
    }
    return current;
}

function collectUsages(sourceFile: SourceFile): Usage[] {
    const usages: Usage[] = [];
    const visit = (node: Node): void => {
        const reference = environmentReference(node);
        if (reference !== null) {
            usages.push({
                name: reference.name,
                nameNode: reference.nameNode,
                owner: findUsageOwner(node),
                defaultValue: findDefault(node),
            });
        }
        node.forEachChild(visit);
    };
    visit(sourceFile);
    return usages;
}

function normalizedOwnerText(
    sourceFile: SourceFile,
    owner: Node,
    usages: Usage[],
): string {
    const ownerStart = owner.getStart(sourceFile);
    const replacements = usages
        .filter(
            (usage) =>
                usage.nameNode.getStart(sourceFile) >= ownerStart &&
                usage.nameNode.getEnd() <= owner.getEnd(),
        )
        .flatMap((usage) => [
            {
                start: usage.nameNode.getStart(sourceFile) - ownerStart,
                end: usage.nameNode.getEnd() - ownerStart,
                value: '<ENV>',
            },
            ...(usage.defaultValue === null
                ? []
                : [
                      {
                          start:
                              usage.defaultValue.node.getStart(sourceFile) -
                              ownerStart,
                          end:
                              usage.defaultValue.node.getEnd() - ownerStart,
                          value: '<DEFAULT>',
                      },
                  ]),
        ])
        .sort((left, right) => right.start - left.start);

    let normalized = owner.getText(sourceFile);
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
    if (entries.length === 0) return [];

    const virtualFiles = Object.fromEntries(
        entries.map(([name, contents], index) => [
            `/release-safety-config/${String(index).padStart(6, '0')}${name.endsWith('.tsx') ? '.tsx' : '.ts'}`,
            contents,
        ]),
    );
    const virtualPaths = Object.keys(virtualFiles);
    const api = new API({
        cwd: '/release-safety-config',
        fs: createVirtualFileSystem(virtualFiles),
    });
    try {
        const snapshot = api.updateSnapshot({ openFiles: virtualPaths });
        try {
            return entries.map(([name], index) => {
                const virtualPath = virtualPaths[index];
                const project = snapshot.getDefaultProjectForFile(virtualPath);
                if (!project) {
                    throw new Error(
                        `TypeScript did not create a project for ${name}`,
                    );
                }
                if (
                    project.program.getSyntacticDiagnostics(virtualPath)
                        .length > 0
                ) {
                    throw new Error(`TypeScript could not parse ${name}`);
                }
                const sourceFile = project.program.getSourceFile(virtualPath);
                if (!sourceFile) {
                    throw new Error(
                        `TypeScript did not return an AST for ${name}`,
                    );
                }
                return {
                    name,
                    sourceFile,
                    usages: collectUsages(sourceFile),
                };
            });
        } finally {
            snapshot.dispose();
        }
    } finally {
        api.close();
    }
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
                `${parsedFile.name}:${normalizedOwnerText(parsedFile.sourceFile, usage.owner, parsedFile.usages)}`,
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
