import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const sourceRoot = resolve(__dirname, '../..');
const stores = [
    {
        file: 'models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.ts',
        methods: ['getSecrets', 'getReplaceableSecrets'],
        allowedFiles: [
            'models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.ts',
            'models/WarehouseCredentialReader/LegacyAiServiceAccountCredentialReader.ts',
            'models/WarehouseCredentialReader/createLegacyWarehouseCredentialReader.ts',
        ],
    },
];

const listTypescriptFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        const file = relative(sourceRoot, path).split(sep).join('/');
        if (
            entry.name === '__tests__' ||
            file === 'generated' ||
            file === 'database/migrations' ||
            file === 'database/seeds'
        )
            return [];
        if (entry.isDirectory()) return listTypescriptFiles(path);
        return entry.isFile() &&
            file.endsWith('.ts') &&
            !/\.(?:test|mock|integration|integration\.test|testUtils)\.ts$/.test(
                file,
            )
            ? [file]
            : [];
    });

const scannedFiles = listTypescriptFiles(sourceRoot).map((file) => ({
    file,
    source: readFileSync(join(sourceRoot, file), 'utf8'),
}));

test('scans the backend and finds every guarded file', () => {
    expect(scannedFiles.length).toBeGreaterThan(1000);
    for (const { file, allowedFiles } of stores) {
        for (const path of [file, ...allowedFiles]) {
            expect(
                existsSync(join(sourceRoot, path)),
                `Missing guarded file: ${path}`,
            ).toBe(true);
        }
    }
});

const declaration = (method: string) =>
    new RegExp(
        `^\\s*(?:(?:public|private|protected|static|async|override)\\s+)*${method}\\s*(?:<[^>]+>)?\\(`,
        'm',
    );

test.each(stores)(
    '$file still declares each guarded method',
    ({ file, methods }) => {
        const source = readFileSync(join(sourceRoot, file), 'utf8');
        for (const method of methods) {
            expect(
                source,
                `${file}: restore or update the guarded method ${method}`,
            ).toMatch(declaration(method));
        }
    },
);

test('only allowed files mention migrated reader methods', () => {
    const violations = stores.flatMap(({ methods, allowedFiles }) =>
        scannedFiles.flatMap(({ file, source }) =>
            allowedFiles.includes(file)
                ? []
                : methods
                      .filter((method) =>
                          new RegExp(`(?<![\\w$])${method}(?![\\w$])`).test(
                              source,
                          ),
                      )
                      .map((method) => `${file}: ${method}`),
        ),
    );
    expect(
        violations.sort(),
        'This store is read through the WarehouseCredentialReader. Call the reader, or reword the mention.',
    ).toEqual([]);
});

test.each(stores)(
    '$file only declares its migrated reader methods',
    ({ file, methods }) => {
        const lines = readFileSync(join(sourceRoot, file), 'utf8').split('\n');
        const calls = methods.flatMap((method) =>
            lines
                .map((line, index) => ({ line, number: index + 1 }))
                .filter(
                    ({ line }) =>
                        new RegExp(`(?<![\\w$])${method}(?![\\w$])`).test(
                            line,
                        ) && !declaration(method).test(line),
                )
                .map(({ number }) => `${file}:${number}: ${method}`),
        );
        expect(
            calls,
            'A model must not use its migrated reader method itself. Read the credential through the WarehouseCredentialReader.',
        ).toEqual([]);
    },
);
