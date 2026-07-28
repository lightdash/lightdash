import * as fs from 'node:fs';
import * as ts from 'typescript';

export type MigrationLockLevel =
    | 'none'
    | 'share'
    | 'share-update-exclusive'
    | 'access-exclusive';

export interface MigrationHazardFlags {
    terminationDependsOnZeroMatches: boolean;
    hasMonotoneCursor: boolean;
    hasPreLoopCutoff: boolean;
    hasIterationCap: boolean;
    hasDeadline: boolean;
    disablesStatementTimeout: boolean;
    lacksLockTimeout: boolean;
    batchSelectWithoutSkipLocked: boolean;
    loopPredicateUnindexedByThisMigration: boolean;
    createIndexNotConcurrent: boolean;
    lockLevel: MigrationLockLevel;
}

export interface MigrationHazardLoop {
    line: number;
    kind: 'do-while' | 'while' | 'for' | 'for-of';
    functionName: string | null;
    reachableFrom: string[];
    terminationDependsOnZeroMatches: boolean;
    hasMonotoneCursor: boolean;
    hasPreLoopCutoff: boolean;
    hasIterationCap: boolean;
    hasDeadline: boolean;
    predicateColumns: string[];
}

export interface MigrationLock {
    line: number;
    level: Exclude<MigrationLockLevel, 'none'>;
    operation: string;
    table: string | null;
    targetTablePreExists: boolean | null;
}

export interface MigrationHazardReport {
    file: string;
    flags: MigrationHazardFlags;
    loops: MigrationHazardLoop[];
    locks: MigrationLock[];
    notes: string[];
    hasLoop: boolean;
    loopCount: number;
    isTransactionFalse: boolean;
    touchesRawSql: boolean;
    lineCount: number;
}

interface FunctionInfo {
    name: string;
    node: ts.FunctionLikeDeclaration;
}

interface LoopCandidate {
    node:
        | ts.DoStatement
        | ts.WhileStatement
        | ts.ForStatement
        | ts.ForOfStatement;
    functionName: string | null;
}

const LOCK_RANK: Record<MigrationLockLevel, number> = {
    none: 0,
    share: 1,
    'share-update-exclusive': 2,
    'access-exclusive': 3,
};

const PREDICATE_NOTE =
    'Predicate-column extraction covers simple SQL WHERE comparisons and Knex where* calls; quoted identifiers, expressions, aliases, and dynamically assembled SQL may be missed.';

const INDEX_NOTE =
    'Index coverage only reflects indexes created in this migration file and does not inspect the accumulated database schema.';

function falseFlags(): MigrationHazardFlags {
    return {
        terminationDependsOnZeroMatches: false,
        hasMonotoneCursor: false,
        hasPreLoopCutoff: false,
        hasIterationCap: false,
        hasDeadline: false,
        disablesStatementTimeout: false,
        lacksLockTimeout: false,
        batchSelectWithoutSkipLocked: false,
        loopPredicateUnindexedByThisMigration: false,
        createIndexNotConcurrent: false,
        lockLevel: 'none',
    };
}

function lineCount(source: string): number {
    if (source.length === 0) return 0;
    return (
        source.split(/\r?\n/).length -
        (source.endsWith('\n') || source.endsWith('\r') ? 1 : 0)
    );
}

function parseErrorReport(
    source: string,
    fileName: string,
    message: string,
): MigrationHazardReport {
    return {
        file: fileName,
        flags: falseFlags(),
        loops: [],
        locks: [],
        notes: [`parseError: ${message}`],
        hasLoop: false,
        loopCount: 0,
        isTransactionFalse: false,
        touchesRawSql: false,
        lineCount: lineCount(source),
    };
}

function functionName(
    node: ts.FunctionLikeDeclaration,
    parentVariableName: string | null,
): string | null {
    if (
        (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isMethodDeclaration(node)) &&
        node.name
    ) {
        return node.name.getText();
    }
    return parentVariableName;
}

function collectFunctions(sourceFile: ts.SourceFile): Map<string, FunctionInfo> {
    const functions = new Map<string, FunctionInfo>();

    const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name && node.body) {
            functions.set(node.name.text, { name: node.name.text, node });
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const initializer = node.initializer;
            if (
                initializer &&
                (ts.isArrowFunction(initializer) ||
                    ts.isFunctionExpression(initializer))
            ) {
                functions.set(node.name.text, {
                    name: node.name.text,
                    node: initializer,
                });
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return functions;
}

function collectLoops(sourceFile: ts.SourceFile): LoopCandidate[] {
    const loops: LoopCandidate[] = [];

    const visit = (
        node: ts.Node,
        currentFunctionName: string | null,
    ): void => {
        let nextFunctionName = currentFunctionName;
        if (ts.isFunctionLike(node)) {
            const parentVariableName =
                ts.isVariableDeclaration(node.parent) &&
                ts.isIdentifier(node.parent.name)
                    ? node.parent.name.text
                    : null;
            nextFunctionName = functionName(node, parentVariableName);
        }

        if (
            ts.isDoStatement(node) ||
            ts.isWhileStatement(node) ||
            ts.isForStatement(node) ||
            ts.isForOfStatement(node)
        ) {
            loops.push({ node, functionName: nextFunctionName });
        }

        ts.forEachChild(node, (child) => visit(child, nextFunctionName));
    };

    visit(sourceFile, null);
    return loops;
}

function callIdentifier(call: ts.CallExpression): string | null {
    if (ts.isIdentifier(call.expression)) return call.expression.text;
    return null;
}

function containsIdentifier(node: ts.Node, name: string): boolean {
    let found = false;
    const visit = (child: ts.Node): void => {
        if (found) return;
        if (ts.isIdentifier(child) && child.text === name) {
            found = true;
            return;
        }
        ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
}

function isRawCall(node: ts.CallExpression): boolean {
    return (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'raw'
    );
}

function isQueryText(text: string): boolean {
    return (
        /\.raw\s*(?:<[\s\S]*?>)?\s*\(/.test(text) ||
        /\b(?:knex|trx)\s*(?:<[\s\S]*?>)?\s*\(/.test(text) ||
        /\b(?:knex|trx)\.schema\b/.test(text)
    );
}

function functionContainsQuery(info: FunctionInfo): boolean {
    return isQueryText(info.node.getText());
}

function awaitedExpressionContainsQuery(
    expression: ts.Expression,
    functions: Map<string, FunctionInfo>,
): boolean {
    if (isQueryText(expression.getText())) return true;
    if (ts.isCallExpression(expression)) {
        const called = callIdentifier(expression);
        const calledFunction = called ? functions.get(called) : undefined;
        return calledFunction ? functionContainsQuery(calledFunction) : false;
    }
    return false;
}

function loopContainsAwaitedQuery(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (
            ts.isAwaitExpression(node) &&
            awaitedExpressionContainsQuery(node.expression, functions)
        ) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return found;
}

function loopKind(
    node: LoopCandidate['node'],
): MigrationHazardLoop['kind'] {
    if (ts.isDoStatement(node)) return 'do-while';
    if (ts.isWhileStatement(node)) return 'while';
    if (ts.isForOfStatement(node)) return 'for-of';
    return 'for';
}

function statementContainsExit(statement: ts.Statement): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isBreakStatement(node) || ts.isReturnStatement(node)) {
            found = true;
            return;
        }
        if (ts.isFunctionLike(node)) return;
        ts.forEachChild(node, visit);
    };
    visit(statement);
    return found;
}

function collectExitConditions(loop: LoopCandidate): ts.Expression[] {
    const conditions: ts.Expression[] = [];
    if (ts.isDoStatement(loop.node) || ts.isWhileStatement(loop.node)) {
        conditions.push(loop.node.expression);
    }
    if (ts.isForStatement(loop.node) && loop.node.condition) {
        conditions.push(loop.node.condition);
    }

    const visit = (node: ts.Node): void => {
        if (
            node !== loop.node.statement &&
            (ts.isFunctionLike(node) ||
                ts.isDoStatement(node) ||
                ts.isWhileStatement(node) ||
                ts.isForStatement(node) ||
                ts.isForOfStatement(node) ||
                ts.isForInStatement(node))
        ) {
            return;
        }
        if (ts.isIfStatement(node) && statementContainsExit(node.thenStatement)) {
            conditions.push(node.expression);
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return conditions;
}

function isZero(node: ts.Expression): boolean {
    return ts.isNumericLiteral(node) && Number(node.text) === 0;
}

function isRowCountExpression(node: ts.Expression): boolean {
    const text = node.getText();
    return /(?:row_?count|batch_?count|updated|affected|matched)/i.test(text);
}

function conditionTestsRowCountAgainstZero(condition: ts.Expression): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isBinaryExpression(node)) {
            const supportedOperators = new Set([
                ts.SyntaxKind.EqualsEqualsToken,
                ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.SyntaxKind.ExclamationEqualsToken,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
                ts.SyntaxKind.GreaterThanToken,
                ts.SyntaxKind.GreaterThanEqualsToken,
                ts.SyntaxKind.LessThanToken,
                ts.SyntaxKind.LessThanEqualsToken,
            ]);
            if (
                supportedOperators.has(node.operatorToken.kind) &&
                ((isZero(node.left) && isRowCountExpression(node.right)) ||
                    (isZero(node.right) && isRowCountExpression(node.left)))
            ) {
                found = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(condition);
    return found;
}

function terminationDependsOnZeroMatches(loop: LoopCandidate): boolean {
    const conditions = collectExitConditions(loop);
    const rowCountConditions = conditions.filter(
        conditionTestsRowCountAgainstZero,
    );
    return (
        rowCountConditions.length > 0 &&
        conditions.every(
            (condition) =>
                conditionTestsRowCountAgainstZero(condition) ||
                condition.kind === ts.SyntaxKind.TrueKeyword,
        )
    );
}

function collectIncrementedNames(loop: LoopCandidate): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (
            (ts.isPrefixUnaryExpression(node) ||
                ts.isPostfixUnaryExpression(node)) &&
            (node.operator === ts.SyntaxKind.PlusPlusToken ||
                node.operator === ts.SyntaxKind.MinusMinusToken) &&
            ts.isIdentifier(node.operand)
        ) {
            names.add(node.operand.text);
        }
        if (
            ts.isBinaryExpression(node) &&
            (node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ||
                node.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) &&
            ts.isIdentifier(node.left)
        ) {
            names.add(node.left.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node);
    return names;
}

function hasIterationCap(loop: LoopCandidate): boolean {
    const incrementedNames = collectIncrementedNames(loop);
    if (incrementedNames.size === 0) return false;
    return collectExitConditions(loop).some((condition) => {
        let found = false;
        const visit = (node: ts.Node): void => {
            if (found) return;
            if (
                ts.isBinaryExpression(node) &&
                ((ts.isIdentifier(node.left) &&
                    incrementedNames.has(node.left.text) &&
                    ts.isNumericLiteral(node.right) &&
                    Number(node.right.text) > 0) ||
                    (ts.isIdentifier(node.right) &&
                        incrementedNames.has(node.right.text) &&
                        ts.isNumericLiteral(node.left) &&
                        Number(node.left.text) > 0))
            ) {
                found = true;
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(condition);
        return found;
    });
}

function hasDeadline(loop: LoopCandidate): boolean {
    return collectExitConditions(loop).some((condition) =>
        /Date\.now|performance\.now|deadline|expires|elapsed|timeLimit/i.test(
            condition.getText(),
        ),
    );
}

function constantStrings(sourceFile: ts.SourceFile): Map<string, string> {
    const constants = new Map<string, string>();
    const visit = (node: ts.Node): void => {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            (ts.isStringLiteral(node.initializer) ||
                ts.isNoSubstitutionTemplateLiteral(node.initializer))
        ) {
            constants.set(node.name.text, node.initializer.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return constants;
}

function resolveString(
    expression: ts.Expression | undefined,
    constants: Map<string, string>,
): string | null {
    if (!expression) return null;
    if (
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
        return expression.text;
    }
    if (ts.isIdentifier(expression)) {
        return constants.get(expression.text) ?? null;
    }
    return null;
}

function rawSqlText(
    expression: ts.Expression | undefined,
    constants: Map<string, string>,
): string {
    if (!expression) return '';
    let text =
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
            ? expression.text
            : expression.getText();
    text = text.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (match, name) => {
        return constants.get(name) ?? match;
    });
    return text;
}

function placeholderDirection(
    sql: string,
    bindingIndex: number,
): 'lower' | 'upper' | null {
    const matches = [...sql.matchAll(/(?<!\?)\?(?!\?)/g)];
    const match = matches[bindingIndex];
    if (!match || match.index === undefined) return null;
    const before = sql.slice(Math.max(0, match.index - 24), match.index);
    if (/(?:>|>=)\s*$/.test(before)) return 'lower';
    if (/(?:<|<=)\s*$/.test(before)) return 'upper';
    return null;
}

function queryUsesNameAsBound(
    root: ts.Node,
    name: string,
    direction: 'lower' | 'upper',
    constants: Map<string, string>,
): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isCallExpression(node)) {
            const method = ts.isPropertyAccessExpression(node.expression)
                ? node.expression.name.text
                : null;
            if (isRawCall(node) || method === 'whereRaw') {
                const sql = rawSqlText(node.arguments[0], constants);
                const bindings = node.arguments[1];
                if (bindings && ts.isArrayLiteralExpression(bindings)) {
                    bindings.elements.forEach((binding, index) => {
                        if (
                            containsIdentifier(binding, name) &&
                            placeholderDirection(sql, index) === direction
                        ) {
                            found = true;
                        }
                    });
                }
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const comparison =
                    direction === 'lower'
                        ? new RegExp(`(?:>|>=)\\s*\\$\\{\\s*${escapedName}\\s*\\}`)
                        : new RegExp(`(?:<|<=)\\s*\\$\\{\\s*${escapedName}\\s*\\}`);
                if (comparison.test(sql)) found = true;
            }
            if (
                method &&
                /^(?:andWhere|orWhere|where)$/.test(method) &&
                node.arguments.length >= 3
            ) {
                const operator = resolveString(node.arguments[1], constants);
                const value = node.arguments[2];
                if (
                    value &&
                    containsIdentifier(value, name) &&
                    ((direction === 'lower' &&
                        (operator === '>' || operator === '>=')) ||
                        (direction === 'upper' &&
                            (operator === '<' || operator === '<=')))
                ) {
                    found = true;
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

function queryUsesLoopVariableAsBound(
    loop: LoopCandidate,
    variableName: string,
    direction: 'lower' | 'upper',
    functions: Map<string, FunctionInfo>,
    constants: Map<string, string>,
): boolean {
    if (
        queryUsesNameAsBound(
            loop.node.statement,
            variableName,
            direction,
            constants,
        )
    ) {
        return true;
    }

    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isCallExpression(node)) {
            const calledName = callIdentifier(node);
            const called = calledName ? functions.get(calledName) : undefined;
            if (called) {
                node.arguments.forEach((argument, index) => {
                    const parameter = called.node.parameters[index];
                    if (
                        parameter &&
                        ts.isIdentifier(parameter.name) &&
                        containsIdentifier(argument, variableName) &&
                        queryUsesNameAsBound(
                            called.node,
                            parameter.name.text,
                            direction,
                            constants,
                        )
                    ) {
                        found = true;
                    }
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return found;
}

function containingFunction(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
): FunctionInfo | null {
    return loop.functionName ? functions.get(loop.functionName) ?? null : null;
}

function scopeContainsPosition(
    declaration: ts.VariableDeclaration,
    position: number,
): boolean {
    let current: ts.Node | undefined = declaration.parent;
    while (current && !ts.isSourceFile(current)) {
        if (
            (ts.isBlock(current) || ts.isSourceFile(current.parent)) &&
            current.getStart() <= position &&
            current.end >= position
        ) {
            return true;
        }
        if (ts.isFunctionLike(current)) return false;
        current = current.parent;
    }
    return false;
}

function declarationsBeforeLoop(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
): ts.VariableDeclaration[] {
    const owner = containingFunction(loop, functions);
    if (!owner || !owner.node.body) return [];
    const declarations: ts.VariableDeclaration[] = [];
    const loopStart = loop.node.getStart();
    const visit = (node: ts.Node): void => {
        if (
            ts.isVariableDeclaration(node) &&
            node.getStart() < loopStart &&
            scopeContainsPosition(node, loopStart)
        ) {
            declarations.push(node);
        }
        if (node !== owner.node && ts.isFunctionLike(node)) return;
        ts.forEachChild(node, visit);
    };
    visit(owner.node.body);
    return declarations;
}

function isLetDeclaration(declaration: ts.VariableDeclaration): boolean {
    const list = declaration.parent;
    return (
        ts.isVariableDeclarationList(list) &&
        (list.flags & ts.NodeFlags.Let) !== 0
    );
}

function batchResultVariables(loop: LoopCandidate): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer
        ) {
            let hasAwait = false;
            const findAwait = (child: ts.Node): void => {
                if (ts.isAwaitExpression(child)) hasAwait = true;
                ts.forEachChild(child, findAwait);
            };
            findAwait(node.initializer);
            if (hasAwait) names.add(node.name.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return names;
}

function assignedFromBatchResult(
    loop: LoopCandidate,
    variableName: string,
): boolean {
    const batchVariables = batchResultVariables(loop);
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left) &&
            node.left.text === variableName
        ) {
            let derivesFromBatch = false;
            batchVariables.forEach((batchVariable) => {
                if (containsIdentifier(node.right, batchVariable)) {
                    derivesFromBatch = true;
                }
            });
            if (ts.isAwaitExpression(node.right) || derivesFromBatch) {
                found = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return found;
}

function hasMonotoneCursor(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
    constants: Map<string, string>,
): boolean {
    return declarationsBeforeLoop(loop, functions).some((declaration) => {
        if (!isLetDeclaration(declaration) || !ts.isIdentifier(declaration.name)) {
            return false;
        }
        return (
            assignedFromBatchResult(loop, declaration.name.text) &&
            queryUsesLoopVariableAsBound(
                loop,
                declaration.name.text,
                'lower',
                functions,
                constants,
            )
        );
    });
}

function initializerCapturesCutoff(
    initializer: ts.Expression,
    functions: Map<string, FunctionInfo>,
): boolean {
    if (/\bMAX\s*\(|\bnow\s*\(|\bcurrval\s*\(|Date\.now/i.test(initializer.getText())) {
        return true;
    }
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isCallExpression(node)) {
            const called = callIdentifier(node);
            const functionInfo = called ? functions.get(called) : undefined;
            if (
                functionInfo &&
                /\bMAX\s*\(|\bnow\s*\(|\bcurrval\s*\(|Date\.now/i.test(
                    functionInfo.node.getText(),
                )
            ) {
                found = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(initializer);
    return found;
}

function hasPreLoopCutoff(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
    constants: Map<string, string>,
): boolean {
    return declarationsBeforeLoop(loop, functions).some((declaration) => {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
            return false;
        }
        return (
            initializerCapturesCutoff(declaration.initializer, functions) &&
            queryUsesLoopVariableAsBound(
                loop,
                declaration.name.text,
                'upper',
                functions,
                constants,
            )
        );
    });
}

function calledFunctions(node: ts.Node): Set<string> {
    const names = new Set<string>();
    const visit = (child: ts.Node): void => {
        if (ts.isCallExpression(child)) {
            const called = callIdentifier(child);
            if (called) names.add(called);
        }
        ts.forEachChild(child, visit);
    };
    visit(node);
    return names;
}

function rootsReachingFunction(
    target: string | null,
    functions: Map<string, FunctionInfo>,
): string[] {
    if (!target) return [];
    const roots = ['up', 'down'].filter((name) => functions.has(name));
    return roots.filter((root) => {
        const pending = [root];
        const seen = new Set<string>();
        while (pending.length > 0) {
            const current = pending.shift()!;
            if (current === target) return true;
            if (seen.has(current)) continue;
            seen.add(current);
            const info = functions.get(current);
            if (!info) continue;
            calledFunctions(info.node).forEach((called) => {
                if (functions.has(called)) pending.push(called);
            });
        }
        return false;
    });
}

function queryRootsForLoop(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
): ts.Node[] {
    const roots: ts.Node[] = [loop.node.statement];
    const seen = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const calledName = callIdentifier(node);
            const called = calledName ? functions.get(calledName) : undefined;
            if (called && !seen.has(called.name)) {
                seen.add(called.name);
                roots.push(called.node);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(loop.node.statement);
    return roots;
}

function collectPredicateColumns(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
    constants: Map<string, string>,
): string[] {
    const columns = new Set<string>();
    const addColumn = (value: string | null): void => {
        if (!value) return;
        const column = value.split('.').at(-1)?.replace(/["'`]/g, '');
        if (column && /^[A-Za-z_][\w$]*$/.test(column)) {
            columns.add(column.toLowerCase());
        }
    };

    queryRootsForLoop(loop, functions).forEach((root) => {
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node)) {
                const method = ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : null;
                if (isRawCall(node) || method === 'whereRaw') {
                    const sql = rawSqlText(node.arguments[0], constants);
                    const whereSections = [
                        ...sql.matchAll(
                            /\bWHERE\b([\s\S]*?)(?=\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|RETURNING|UNION|UPDATE|SELECT)\b|$)/gi,
                        ),
                    ];
                    whereSections.forEach((section) => {
                        const predicate = section[1] ?? '';
                        const matches = predicate.matchAll(
                            /([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?)\s*(?:IS\b|NOT\b|IN\b|LIKE\b|ILIKE\b|=|<>|!=|>=|<=|>|<)/gi,
                        );
                        for (const match of matches) addColumn(match[1] ?? null);
                    });
                }
                if (method && /^where|^andWhere|^orWhere/.test(method)) {
                    addColumn(resolveString(node.arguments[0], constants));
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(root);
    });

    return [...columns].sort();
}

function createdIndexColumns(
    sourceFile: ts.SourceFile,
    constants: Map<string, string>,
): Set<string> {
    const columns = new Set<string>();
    const resolvedSource = sourceFile
        .getText()
        .replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (match, name) => {
            return constants.get(name) ?? match;
        });

    for (const match of resolvedSource.matchAll(
        /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?\bON\s+\S+\s*\(([^)]+)\)/gi,
    )) {
        const list = match[1] ?? '';
        for (const item of list.split(',')) {
            const column = item
                .trim()
                .split(/\s+/)[0]
                ?.replace(/["'`]/g, '')
                .split('.')
                .at(-1);
            if (column && /^[A-Za-z_][\w$]*$/.test(column)) {
                columns.add(column.toLowerCase());
            }
        }
    }

    const visit = (node: ts.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'index'
        ) {
            node.arguments.forEach((argument) => {
                if (ts.isArrayLiteralExpression(argument)) {
                    argument.elements.forEach((element) =>
                        columns.add(
                            (
                                resolveString(element as ts.Expression, constants) ??
                                ''
                            ).toLowerCase(),
                        ),
                    );
                } else {
                    const column = resolveString(argument, constants);
                    if (column) columns.add(column.toLowerCase());
                }
            });
            const chain = node.expression.expression.getText();
            const columnCall = chain.match(
                /\.(?:bigInteger|integer|text|string|uuid)\s*\(\s*['"]([^'"]+)['"]\s*\)/,
            );
            if (columnCall?.[1]) columns.add(columnCall[1].toLowerCase());
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    columns.delete('');
    return columns;
}

function hasBatchSelectWithoutSkipLocked(
    loop: LoopCandidate,
    functions: Map<string, FunctionInfo>,
): boolean {
    return queryRootsForLoop(loop, functions).some((root) => {
        const text = root.getText();
        const hasLimit = /\bLIMIT\b/i.test(text) || /\.limit\s*\(/.test(text);
        const hasSkipLocked =
            /\bFOR\s+UPDATE\s+SKIP\s+LOCKED\b/i.test(text) ||
            /\.skipLocked\s*\(/.test(text);
        return hasLimit && !hasSkipLocked;
    });
}

function transactionIsFalse(source: string): boolean {
    return /(?:export\s+)?const\s+config\s*=\s*\{[\s\S]*?\btransaction\s*:\s*false[\s\S]*?\}/m.test(
        source,
    );
}

function rawSqlStatements(
    sourceFile: ts.SourceFile,
    constants: Map<string, string>,
): string[] {
    const statements: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && isRawCall(node)) {
            statements.push(rawSqlText(node.arguments[0], constants));
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return statements;
}

function hasNonConcurrentIndexCreation(
    sourceFile: ts.SourceFile,
    constants: Map<string, string>,
): boolean {
    if (
        rawSqlStatements(sourceFile, constants).some(
            (sql) =>
                /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(sql) &&
                !/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql),
        )
    ) {
        return true;
    }

    let found = false;
    const visit = (node: ts.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'index'
        ) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}

function createdTables(
    sourceFile: ts.SourceFile,
    constants: Map<string, string>,
): Set<string> {
    const tables = new Set<string>();
    const resolved = sourceFile
        .getText()
        .replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (match, name) => {
            return constants.get(name) ?? match;
        });
    for (const match of resolved.matchAll(
        /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z_][\w$.]*)/gi,
    )) {
        if (match[1]) tables.add(match[1].split('.').at(-1)!.toLowerCase());
    }
    const visit = (node: ts.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            /^(?:createTable|createTableIfNotExists)$/.test(
                node.expression.name.text,
            )
        ) {
            const table = resolveString(node.arguments[0], constants);
            if (table) tables.add(table.toLowerCase());
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return tables;
}

function tableFromRawCall(
    call: ts.CallExpression,
    sql: string,
    constants: Map<string, string>,
): string | null {
    const direct = sql.match(/\bALTER\s+TABLE\s+([A-Za-z_][\w$.]*)/i)?.[1];
    if (direct) return direct.split('.').at(-1)!.toLowerCase();
    if (/\bALTER\s+TABLE\s+\?\?/i.test(sql)) {
        const bindings = call.arguments[1];
        if (bindings && ts.isArrayLiteralExpression(bindings)) {
            return resolveString(bindings.elements[0] as ts.Expression, constants);
        }
    }
    return null;
}

function collectLocks(
    sourceFile: ts.SourceFile,
    constants: Map<string, string>,
): MigrationLock[] {
    const locks: MigrationLock[] = [];
    const tablesCreatedHere = createdTables(sourceFile, constants);

    const addLock = (
        node: ts.Node,
        level: Exclude<MigrationLockLevel, 'none'>,
        operation: string,
        table: string | null,
    ): void => {
        const normalizedTable = table?.toLowerCase() ?? null;
        locks.push({
            line:
                sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            level,
            operation,
            table: normalizedTable,
            targetTablePreExists:
                normalizedTable === null
                    ? null
                    : !tablesCreatedHere.has(normalizedTable),
        });
    };

    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && isRawCall(node)) {
            const sql = rawSqlText(node.arguments[0], constants);
            const table = tableFromRawCall(node, sql, constants);
            if (/\bVALIDATE\s+CONSTRAINT\b/i.test(sql)) {
                addLock(
                    node,
                    'share-update-exclusive',
                    'VALIDATE CONSTRAINT',
                    table,
                );
            }
            if (
                /\bSET\s+NOT\s+NULL\b/i.test(sql) ||
                /\bALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\b/i.test(sql) ||
                (/\bALTER\s+TABLE\b/i.test(sql) &&
                    /\b(?:ADD\s+CONSTRAINT\b[\s\S]*FOREIGN\s+KEY|ADD\s+FOREIGN\s+KEY)\b/i.test(
                        sql,
                    ))
            ) {
                addLock(node, 'access-exclusive', 'ALTER TABLE', table);
            }
            if (
                /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(sql) &&
                !/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql)
            ) {
                const indexTable =
                    sql
                        .match(/\bON\s+([A-Za-z_][\w$.]*)/i)?.[1]
                        ?.split('.')
                        .at(-1) ?? null;
                addLock(node, 'share', 'CREATE INDEX', indexTable);
            }
        }
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            /^(?:alterTable|table)$/.test(node.expression.name.text)
        ) {
            const table = resolveString(node.arguments[0], constants);
            const text = node.getText();
            if (/\.dropNullable\s*\(/.test(text)) {
                addLock(node, 'access-exclusive', 'dropNullable', table);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return locks;
}

function strongestLock(locks: MigrationLock[]): MigrationLockLevel {
    return locks.reduce<MigrationLockLevel>(
        (strongest, lock) =>
            LOCK_RANK[lock.level] > LOCK_RANK[strongest]
                ? lock.level
                : strongest,
        'none',
    );
}

function parseDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
    return (
        sourceFile as ts.SourceFile & {
            parseDiagnostics?: readonly ts.Diagnostic[];
        }
    ).parseDiagnostics ?? [];
}

export function probeSource(
    source: string,
    fileName: string,
): MigrationHazardReport {
    let sourceFile: ts.SourceFile;
    try {
        sourceFile = ts.createSourceFile(
            fileName,
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS,
        );
    } catch (error) {
        return parseErrorReport(
            source,
            fileName,
            error instanceof Error ? error.message : String(error),
        );
    }

    const diagnostics = parseDiagnostics(sourceFile);
    if (diagnostics.length > 0) {
        const message = diagnostics
            .map((diagnostic) =>
                ts.flattenDiagnosticMessageText(
                    diagnostic.messageText,
                    ' ',
                ),
            )
            .join('; ');
        return parseErrorReport(source, fileName, message);
    }

    try {
        const functions = collectFunctions(sourceFile);
        const constants = constantStrings(sourceFile);
        const indexes = createdIndexColumns(sourceFile, constants);
        const loopCandidates = collectLoops(sourceFile).filter((loop) =>
            loopContainsAwaitedQuery(loop, functions),
        );

        const loops = loopCandidates.map<MigrationHazardLoop>((loop) => {
            const predicateColumns = collectPredicateColumns(
                loop,
                functions,
                constants,
            );
            return {
                line:
                    sourceFile.getLineAndCharacterOfPosition(loop.node.getStart())
                        .line + 1,
                kind: loopKind(loop.node),
                functionName: loop.functionName,
                reachableFrom: rootsReachingFunction(
                    loop.functionName,
                    functions,
                ),
                terminationDependsOnZeroMatches:
                    terminationDependsOnZeroMatches(loop),
                hasMonotoneCursor: hasMonotoneCursor(
                    loop,
                    functions,
                    constants,
                ),
                hasPreLoopCutoff: hasPreLoopCutoff(
                    loop,
                    functions,
                    constants,
                ),
                hasIterationCap: hasIterationCap(loop),
                hasDeadline: hasDeadline(loop),
                predicateColumns,
            };
        });

        const locks = collectLocks(sourceFile, constants);
        const predicateColumns = new Set(
            loops.flatMap((loop) => loop.predicateColumns),
        );
        const isTransactionFalse = transactionIsFalse(source);
        const createIndexNotConcurrent =
            isTransactionFalse &&
            hasNonConcurrentIndexCreation(
                sourceFile,
                constants,
            );
        const rawStatements = rawSqlStatements(sourceFile, constants);

        const flags: MigrationHazardFlags = {
            terminationDependsOnZeroMatches: loops.some(
                (loop) => loop.terminationDependsOnZeroMatches,
            ),
            hasMonotoneCursor: loops.some(
                (loop) => loop.hasMonotoneCursor,
            ),
            hasPreLoopCutoff: loops.some(
                (loop) => loop.hasPreLoopCutoff,
            ),
            hasIterationCap: loops.some((loop) => loop.hasIterationCap),
            hasDeadline: loops.some((loop) => loop.hasDeadline),
            disablesStatementTimeout: rawStatements.some((sql) =>
                /\bSET\s+(?:LOCAL\s+)?statement_timeout\s*=\s*0\b/i.test(
                    sql,
                ),
            ),
            lacksLockTimeout: !rawStatements.some((sql) =>
                /\bSET\s+(?:LOCAL\s+)?lock_timeout\b/i.test(sql),
            ),
            batchSelectWithoutSkipLocked: loopCandidates.some((loop) =>
                hasBatchSelectWithoutSkipLocked(loop, functions),
            ),
            loopPredicateUnindexedByThisMigration:
                predicateColumns.size > 0 &&
                [...predicateColumns].some((column) => !indexes.has(column)),
            createIndexNotConcurrent,
            lockLevel: strongestLock(locks),
        };

        return {
            file: fileName,
            flags,
            loops,
            locks,
            notes: [PREDICATE_NOTE, INDEX_NOTE],
            hasLoop: loops.length > 0,
            loopCount: loops.length,
            isTransactionFalse,
            touchesRawSql: rawStatements.length > 0,
            lineCount: lineCount(source),
        };
    } catch (error) {
        return parseErrorReport(
            source,
            fileName,
            error instanceof Error ? error.message : String(error),
        );
    }
}

function fileArguments(argv: string[]): {
    files: string[];
    jsonArray: boolean;
} {
    const files: string[] = [];
    let readingFiles = false;
    let stdinFileList = false;
    let jsonArray = false;

    argv.forEach((argument) => {
        if (argument === '--files') {
            readingFiles = true;
            return;
        }
        if (argument === '--stdin-file-list') {
            stdinFileList = true;
            readingFiles = false;
            return;
        }
        if (argument === '--json-array') {
            jsonArray = true;
            readingFiles = false;
            return;
        }
        if (argument.startsWith('--')) {
            readingFiles = false;
            return;
        }
        if (readingFiles) files.push(argument);
    });

    if (stdinFileList) {
        files.push(
            ...fs
                .readFileSync(0, 'utf8')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
        );
    }

    return { files, jsonArray };
}

function probeFile(fileName: string): MigrationHazardReport {
    try {
        return probeSource(fs.readFileSync(fileName, 'utf8'), fileName);
    } catch (error) {
        return parseErrorReport(
            '',
            fileName,
            `read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function main(): void {
    const { files, jsonArray } = fileArguments(process.argv.slice(2));
    if (files.length === 0) {
        throw new Error('--files or --stdin-file-list is required');
    }
    const reports = files.map(probeFile);
    if (jsonArray) {
        process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
    } else {
        reports.forEach((report) => {
            process.stdout.write(`${JSON.stringify(report)}\n`);
        });
    }
}

const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('migration-hazard-probe.ts') === true;

if (invokedDirectly) {
    try {
        main();
    } catch (error) {
        process.stderr.write(
            `[migration-hazard-probe] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    }
}
