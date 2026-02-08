import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
    BACKEND_SRC,
    CONTROLLERS_DIR,
    ROUTERS_DIR,
    EE_DIR,
    EE_CONTROLLERS_DIR,
} from './config';
import type { GraphNode, Complexity } from './types';

export function resolveFilePath(
    id: string,
    type: GraphNode['type'],
    ee?: boolean,
): string | undefined {
    const candidates: string[] = [];
    switch (type) {
        case 'controller': {
            if (ee || id.startsWith('ee/')) {
                const stripped = id.replace(/^ee\//, '');
                candidates.push(path.join(EE_CONTROLLERS_DIR, `${stripped}.ts`));
            } else {
                const stripped = id.replace(/^v2\//, '');
                const sub = id.startsWith('v2/') ? 'v2/' : '';
                candidates.push(
                    path.join(CONTROLLERS_DIR, `${sub}${stripped}.ts`),
                );
            }
            break;
        }
        case 'router':
            candidates.push(path.join(ROUTERS_DIR, `${id}.ts`));
            break;
        case 'service':
        case 'model':
        case 'client': {
            const dir =
                type === 'service'
                    ? 'services'
                    : type === 'model'
                      ? 'models'
                      : 'clients';
            if (ee) {
                candidates.push(
                    path.join(EE_DIR, dir, id, `${id}.ts`),
                    path.join(EE_DIR, dir, `${id}.ts`),
                );
            }
            candidates.push(
                path.join(BACKEND_SRC, dir, id, `${id}.ts`),
                path.join(BACKEND_SRC, dir, `${id}.ts`),
            );
            break;
        }
    }
    return candidates.find((fp) => fs.existsSync(fp));
}

export function resolveLineCount(
    id: string,
    type: GraphNode['type'],
    ee?: boolean,
): number | undefined {
    const fp = resolveFilePath(id, type, ee);
    if (fp) return fs.readFileSync(fp, 'utf-8').split('\n').length;
    return undefined;
}

export function resolveComplexity(
    id: string,
    type: GraphNode['type'],
    ee?: boolean,
): Complexity | undefined {
    const fp = resolveFilePath(id, type, ee);
    if (!fp) return undefined;

    const src = fs.readFileSync(fp, 'utf-8');
    const sourceFile = ts.createSourceFile(fp, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    let totalCyclomatic = 0;
    let maxFunctionCyclomatic = 0;
    let cognitive = 0;

    function isFunctionLike(node: ts.Node): boolean {
        return ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isGetAccessor(node) ||
            ts.isSetAccessor(node) ||
            ts.isConstructorDeclaration(node);
    }

    function countCyclomaticInFunction(node: ts.Node): number {
        let cc = 1;
        function walk(n: ts.Node) {
            switch (n.kind) {
                case ts.SyntaxKind.IfStatement:
                case ts.SyntaxKind.ForStatement:
                case ts.SyntaxKind.ForInStatement:
                case ts.SyntaxKind.ForOfStatement:
                case ts.SyntaxKind.WhileStatement:
                case ts.SyntaxKind.DoStatement:
                case ts.SyntaxKind.CaseClause:
                case ts.SyntaxKind.CatchClause:
                case ts.SyntaxKind.ConditionalExpression:
                    cc++;
                    break;
                case ts.SyntaxKind.BinaryExpression: {
                    const bin = n as ts.BinaryExpression;
                    if (bin.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                        bin.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                        bin.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                        cc++;
                    }
                    break;
                }
            }
            if (isFunctionLike(n) && n !== node) return;
            ts.forEachChild(n, walk);
        }
        ts.forEachChild(node, walk);
        return cc;
    }

    function walkForFunctions(node: ts.Node) {
        if (isFunctionLike(node)) {
            const cc = countCyclomaticInFunction(node);
            totalCyclomatic += cc;
            if (cc > maxFunctionCyclomatic) maxFunctionCyclomatic = cc;
        }
        ts.forEachChild(node, walkForFunctions);
    }
    walkForFunctions(sourceFile);

    if (totalCyclomatic === 0) {
        let topCC = 1;
        function walkTop(n: ts.Node) {
            switch (n.kind) {
                case ts.SyntaxKind.IfStatement:
                case ts.SyntaxKind.ForStatement:
                case ts.SyntaxKind.ForInStatement:
                case ts.SyntaxKind.ForOfStatement:
                case ts.SyntaxKind.WhileStatement:
                case ts.SyntaxKind.DoStatement:
                case ts.SyntaxKind.CaseClause:
                case ts.SyntaxKind.CatchClause:
                case ts.SyntaxKind.ConditionalExpression:
                    topCC++;
                    break;
                case ts.SyntaxKind.BinaryExpression: {
                    const bin = n as ts.BinaryExpression;
                    if (bin.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                        bin.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                        bin.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                        topCC++;
                    }
                    break;
                }
            }
            ts.forEachChild(n, walkTop);
        }
        ts.forEachChild(sourceFile, walkTop);
        totalCyclomatic = topCC;
        maxFunctionCyclomatic = topCC;
    }

    function isElseIf(node: ts.Node): boolean {
        if (!ts.isIfStatement(node)) return false;
        const parent = node.parent;
        return !!parent && ts.isIfStatement(parent) && parent.elseStatement === node;
    }

    function cogWalk(node: ts.Node, depth: number) {
        if (ts.isIfStatement(node)) {
            if (isElseIf(node)) {
                cognitive += 1;
            } else {
                cognitive += 1 + depth;
            }
            if (node.expression) cogWalk(node.expression, depth);
            if (node.thenStatement) cogWalk(node.thenStatement, depth + 1);
            if (node.elseStatement) {
                if (ts.isIfStatement(node.elseStatement)) {
                    cogWalk(node.elseStatement, depth);
                } else {
                    cognitive += 1;
                    cogWalk(node.elseStatement, depth + 1);
                }
            }
            return;
        }

        if (node.kind === ts.SyntaxKind.SwitchStatement) {
            cognitive += 1 + depth;
            ts.forEachChild(node, c => cogWalk(c, depth + 1));
            return;
        }

        if (node.kind === ts.SyntaxKind.ForStatement ||
            node.kind === ts.SyntaxKind.ForInStatement ||
            node.kind === ts.SyntaxKind.ForOfStatement ||
            node.kind === ts.SyntaxKind.WhileStatement ||
            node.kind === ts.SyntaxKind.DoStatement) {
            cognitive += 1 + depth;
            ts.forEachChild(node, c => cogWalk(c, depth + 1));
            return;
        }

        if (node.kind === ts.SyntaxKind.ConditionalExpression) {
            cognitive += 1 + depth;
            ts.forEachChild(node, c => cogWalk(c, depth));
            return;
        }

        if (node.kind === ts.SyntaxKind.CatchClause) {
            cognitive += 1;
            ts.forEachChild(node, c => cogWalk(c, depth + 1));
            return;
        }

        if (ts.isBinaryExpression(node)) {
            const op = node.operatorToken.kind;
            if (op === ts.SyntaxKind.AmpersandAmpersandToken ||
                op === ts.SyntaxKind.BarBarToken ||
                op === ts.SyntaxKind.QuestionQuestionToken) {
                let parentOp: ts.SyntaxKind | undefined;
                if (ts.isBinaryExpression(node.parent)) {
                    parentOp = node.parent.operatorToken.kind;
                }
                if (parentOp !== op) {
                    cognitive += 1;
                }
            }
        }

        if (isFunctionLike(node)) {
            ts.forEachChild(node, c => cogWalk(c, depth + 1));
            return;
        }

        ts.forEachChild(node, c => cogWalk(c, depth));
    }

    ts.forEachChild(sourceFile, c => cogWalk(c, 0));

    return { cyclomatic: totalCyclomatic, cognitive, maxFunctionCyclomatic };
}
