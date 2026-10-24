import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
    modelMentions,
    pendingDirectReaders,
    sameNameOtherMethods,
    type DirectReaders,
} from './legacyReaderLedger';

const sourceRoot = resolve(__dirname, '../..');
const stores = [
    {
        store: 'project',
        file: 'models/ProjectModel/ProjectModel.ts',
        methods: [
            'getWarehouseCredentialsForProject',
            'getWarehouseCredentialsForProjectUncached',
            'getOwnWarehouseCredentialsForProject',
            'getWarehouseCredentialsForBinding',
            'getWithSensitiveFields',
        ],
    },
    {
        store: 'warehouseConnection',
        file: 'models/WarehouseConnectionModel/WarehouseConnectionModel.ts',
        methods: [
            'getCredentials',
            'getExtraCredentialSource',
            'getOwnCredentials',
            'loadOrganizationCredentials',
        ],
    },
    {
        store: 'organization',
        file: 'models/OrganizationWarehouseCredentialsModel.ts',
        methods: ['getByUuidWithSensitiveData', 'getByNameWithSensitiveData'],
    },
    {
        store: 'user',
        file: 'models/UserWarehouseCredentials/UserWarehouseCredentialsModel.ts',
        methods: [
            'findForProjectWithSecrets',
            'getByUuidWithSecrets',
            'findAiCredentialWithSecrets',
            'findDatabricksOauthU2mForHostWithSecrets',
        ],
    },
    {
        store: 'aiServiceAccount',
        file: 'models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.ts',
        methods: ['getSecrets', 'getReplaceableSecrets'],
    },
];

const listTypescriptFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return listTypescriptFiles(path);
        return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    });

const allFiles = listTypescriptFiles(sourceRoot);
const toSourcePath = (path: string): string =>
    relative(sourceRoot, path).split(sep).join('/');
const scannedFiles = allFiles.filter((path) => {
    const file = toSourcePath(path);
    return !(
        /\.(?:test|mock|integration|integration\.test|testUtils)\.ts$/.test(
            file,
        ) ||
        file.split('/').includes('__tests__') ||
        file.startsWith('generated/') ||
        file.startsWith('database/migrations/') ||
        file.startsWith('database/seeds/') ||
        file.startsWith('models/WarehouseCredentialReader/')
    );
});
const found: DirectReaders = {};
for (const path of scannedFiles) {
    const file = toSourcePath(path);
    const source = readFileSync(path, 'utf8');
    for (const method of stores.flatMap(({ methods }) => methods)) {
        const count = [
            ...source.matchAll(
                new RegExp(`(?<![\\w$])${method}(?![\\w$])`, 'g'),
            ),
        ].length;
        if (count > 0) found[file] = { ...found[file], [method]: count };
    }
}
const ledger: DirectReaders = {
    ...pendingDirectReaders,
    ...modelMentions,
    ...sameNameOtherMethods,
};
const listReads = (readers: DirectReaders): string[] =>
    Object.entries(readers)
        .flatMap(([file, methods]) =>
            Object.entries(methods).map(
                ([method, count]) => `${file}: ${method} x${count}`,
            ),
        )
        .sort();

test('scans the backend and finds every guarded model', () => {
    expect(scannedFiles.length).toBeGreaterThan(1000);
    for (const { file } of stores) {
        expect(
            existsSync(join(sourceRoot, file)),
            `Missing model file: ${file}`,
        ).toBe(true);
        expect(allFiles).toContain(join(sourceRoot, file));
    }
});

test.each(stores)(
    '$store still declares each guarded method',
    ({ file, methods }) => {
        const source = readFileSync(join(sourceRoot, file), 'utf8');
        for (const method of methods) {
            expect(
                source,
                `${file}: restore or update the guarded method ${method}`,
            ).toMatch(
                new RegExp(
                    `^\\s*(?:(?:public|private|protected|static|async|override)\\s+)*${method}\\s*(?:<[^>]+>)?\\(`,
                    'm',
                ),
            );
        }
    },
);

const modelFiles = stores.map(({ file }) => file);

test('every mention of a guarded method is in the ledger', () => {
    const ledgerReads = listReads(ledger);
    expect(
        listReads(found).filter((read) => !ledgerReads.includes(read)),
        'Every mention of a guarded method name counts, also in a type or a comment. Read the credential through the WarehouseCredentialReader, or reword the mention.',
    ).toEqual([]);
});

test('the ledger has no stale entry', () => {
    const foundReads = listReads(found);
    expect(
        listReads(ledger).filter((read) => !foundReads.includes(read)),
        'The ledger entry does not match the source. Look at the changed mentions, then update or remove the entry.',
    ).toEqual([]);
});

test('the ledger lists do not share a file', () => {
    const files = [
        pendingDirectReaders,
        modelMentions,
        sameNameOtherMethods,
    ].flatMap((list) => Object.keys(list));
    expect(files).toEqual([...new Set(files)]);
});

test('each ledger list holds only its own kind of file', () => {
    expect(
        Object.keys(pendingDirectReaders).filter((file) =>
            modelFiles.includes(file),
        ),
    ).toEqual([]);
    expect(
        Object.keys(modelMentions).filter((file) => !modelFiles.includes(file)),
    ).toEqual([]);
    expect(
        listReads(sameNameOtherMethods).filter(
            (read) =>
                !read.startsWith(
                    'clients/Google/GoogleDriveClient.ts: getCredentials x',
                ),
        ),
    ).toEqual([]);
});

test('the AI service account store has no direct reader left', () => {
    expect(
        listReads(pendingDirectReaders).filter((read) =>
            /: (getSecrets|getReplaceableSecrets) x/.test(read),
        ),
    ).toEqual([]);
});
