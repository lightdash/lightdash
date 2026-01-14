import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const FRONTEND_SRC = path.join(__dirname, '../packages/frontend/src');

function getAllTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllTsFiles(fullPath));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

function countImportsInFile(filePath: string): { mantine6: number; mantine8: number } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
    );

    let mantine6 = 0;
    let mantine8 = 0;

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
            const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;
            if (moduleName.startsWith('@mantine-8/')) {
                mantine8++;
            } else if (moduleName.startsWith('@mantine/')) {
                mantine6++;
            }
        }
    });

    return { mantine6, mantine8 };
}

const files = getAllTsFiles(FRONTEND_SRC);
let totalMantine6 = 0;
let totalMantine8 = 0;

for (const file of files) {
    const { mantine6, mantine8 } = countImportsInFile(file);
    totalMantine6 += mantine6;
    totalMantine8 += mantine8;
}

const total = totalMantine6 + totalMantine8;

console.log('Mantine Import Counts');
console.log('=====================');
console.log(`Mantine 6 (@mantine/*):   ${totalMantine6}`);
console.log(`Mantine 8 (@mantine-8/*): ${totalMantine8}`);
console.log(`Total:                    ${total}`);
console.log('');
console.log(
    `Migration progress: ${((totalMantine8 / total) * 100).toFixed(1)}% on Mantine 8`,
);
