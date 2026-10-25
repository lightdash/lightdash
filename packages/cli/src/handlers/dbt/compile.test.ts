import { ParseError, SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import { maybeCompileModelsAndJoins, type DbtCompileOptions } from './compile';
import { getDbtVersion } from './getDbtVersion';

vi.mock('execa');
vi.mock('./getDbtVersion');
vi.mock('../../credentials', () => ({
    getAgentConnectionSelection: vi.fn(() => null),
}));

const options: DbtCompileOptions = {
    profilesDir: undefined,
    projectDir: undefined,
    target: undefined,
    profile: undefined,
    select: undefined,
    models: undefined,
    vars: undefined,
    threads: undefined,
    noVersionCheck: undefined,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: undefined,
    skipDbtCompile: undefined,
    skipWarehouseCatalog: undefined,
    useDbtList: undefined,
    defer: undefined,
    targetPath: undefined,
    favorState: undefined,
    combineManifest: undefined,
};

const missingQualifiedRef =
    "Model 'model.consumer.report' (models/report.sql) depends on a node named 'orders' in package or project 'provider' which was not found";

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDbtVersion).mockResolvedValue({
        verboseVersion: '1.12.0',
        isDbtFusion: false,
        versionOption: SupportedDbtVersions.V1_12,
        isDbtCloudCLI: false,
    });
});

describe.each([false, true])(
    'dbt missing refs with useDbtList=%s',
    (useDbtList) => {
        it('adds a cross-project hint to missing qualified refs', async () => {
            vi.mocked(execa).mockRejectedValue(new Error(missingQualifiedRef));

            const result = maybeCompileModelsAndJoins(
                { targetDir: '/unused' },
                { ...options, useDbtList },
            );

            await expect(result).rejects.toBeInstanceOf(ParseError);
            await expect(result).rejects.toThrow(missingQualifiedRef);
            await expect(result).rejects.toThrow(
                'Check that the model (or version) is present in the provider project and has access: public. Local dbt commands must resolve cross-project refs before deployment.',
            );
        });

        it.each([
            "Model 'model.consumer.report' depends on a node named 'orders' which was not found",
            'Compilation Error: invalid SQL',
        ])('leaves other dbt failures unchanged: %s', async (message) => {
            vi.mocked(execa).mockRejectedValue(new Error(message));

            await expect(
                maybeCompileModelsAndJoins(
                    { targetDir: '/unused' },
                    { ...options, useDbtList },
                ),
            ).rejects.toThrow(
                useDbtList
                    ? `Error executing 'dbt ls':\n  ${message}\nEnsure you're on the latest patch version. '--use-dbt-list' is true by default; if you encounter issues, try using '--use-dbt-list=false`
                    : `Failed to run dbt compile:\n  ${message}`,
            );
        });
    },
);
