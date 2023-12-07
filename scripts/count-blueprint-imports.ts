import * as glob from 'glob';
import * as ts from 'typescript';

const INITIAL_BLUEPRINT_IMPORTS_BEFORE_REFACTOR = 993;

const countImportsInAFile = (
    file: string,
    targetLibrary: string,
    importCounter: Record<string, Record<string, number>>,
) => {
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

const countImports = (files: string[], libraries: string[]) => {
    const importCounter: Record<string, Record<string, number>> = {};

    files.forEach((file) => {
        libraries.forEach((targetLibrary) => {
            countImportsInAFile(file, targetLibrary, importCounter);
        });
    });

    return importCounter;
};

const blueprintLibraries = [
    '@blueprintjs/core',
    '@blueprintjs/datetime',
    '@blueprintjs/datetime2',
    '@blueprintjs/popover2',
    '@blueprintjs/select',
];

const mantineLibraries = [
    '@mantine/core',
    '@mantine/form',
    '@mantine/hooks',
    '@mantine/spotlight',
];

glob('./packages/frontend/src/**/*.{ts,tsx}', (err, files) => {
    if (err) throw err;

    const blueprintCounter = countImports(files, blueprintLibraries);
    const mantineCounter = countImports(files, mantineLibraries);

    for (const [library, counts] of Object.entries(blueprintCounter)) {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        console.log(`${library} - Total: ${total}`);

        for (const [importName, count] of Object.entries(counts).sort(
            ([, a], [, b]) => b - a,
        )) {
            console.log(`  ${importName}: ${count}`);
        }
        console.log();
    }

    const blueprintTotal = Object.values(blueprintCounter).reduce(
        (a, b) => a + Object.values(b).reduce((c, d) => c + d, 0),
        0,
    );
    const mantineTotal = Object.values(mantineCounter).reduce(
        (a, b) => a + Object.values(b).reduce((c, d) => c + d, 0),
        0,
    );

    console.log(`-------------------------------------------------------`);
    console.log(
        `Total imports from blueprint libraries: ${blueprintTotal}/${INITIAL_BLUEPRINT_IMPORTS_BEFORE_REFACTOR} (${(
            (blueprintTotal / INITIAL_BLUEPRINT_IMPORTS_BEFORE_REFACTOR) *
            100
        ).toFixed(1)}%)`,
    );
    console.log(`Total imports from mantine libraries: ${mantineTotal}`);
    console.log(`-------------------------------------------------------`);
});
