import * as glob from 'glob';
import * as ts from 'typescript';

const importCounter: Record<string, Record<string, number>> = {};

const countImports = (file: string, targetLibrary: string) => {
    const content = ts.sys.readFile(file, 'utf8');
    if (!content) throw new Error(`Could not read file ${file}`);

    const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.ESNext,
        true,
    );

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier
                .getText(sourceFile)
                .replace(/['"`]/g, '');

            if (moduleSpecifier.includes(targetLibrary)) {
                node.importClause?.namedBindings.forEachChild((namedImport) => {
                    const importName = namedImport
                        .getText(sourceFile)
                        .split(' as ')[0];

                    if (!importCounter[targetLibrary]) {
                        importCounter[targetLibrary] = {};
                    }

                    importCounter[targetLibrary][importName] =
                        (importCounter[targetLibrary][importName] || 0) + 1;
                });
            }
        }
    });
};

const targetLibraries = [
    '@blueprintjs/core',
    '@blueprintjs/datetime',
    '@blueprintjs/datetime2',
    '@blueprintjs/popover2',
    '@blueprintjs/select',
];

glob('./packages/frontend/src/**/*.{ts,tsx}', (err, files) => {
    if (err) throw err;

    files.forEach((file) =>
        targetLibraries.forEach((targetLibrary) =>
            countImports(file, targetLibrary),
        ),
    );

    for (const [library, counts] of Object.entries(importCounter)) {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        console.log(`${library} - Total: ${total}`);

        for (const [importName, count] of Object.entries(counts).sort(
            ([, a], [, b]) => b - a,
        )) {
            console.log(`  ${importName}: ${count}`);
        }
        console.log();
    }

    const grandTotal = Object.values(importCounter).reduce(
        (a, b) => a + Object.values(b).reduce((c, d) => c + d, 0),
        0,
    );

    console.log(`---------------------------------------------`);
    console.log(
        `Total imports from all libraries: ${grandTotal} (${(
            (grandTotal / 993) *
            100
        ).toFixed(1)}%)`,
    );
    console.log(`---------------------------------------------`);
});
