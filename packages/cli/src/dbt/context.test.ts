import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDbtContext } from './context';

describe('getDbtContext', () => {
    const { env } = process;
    let tempDir: string;

    beforeEach(async () => {
        jest.resetModules();
        process.env = { ...env };
        // Create a temporary directory for test files
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-context-test-'));
    });

    afterEach(async () => {
        process.env = env;
        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('target-path with env_var templating', () => {
        test('should resolve env_var in target-path', async () => {
            process.env.DBT_ENV__TARGET_FOLDER = 'custom-target';

            const dbtProjectContent = `name: test_project
profile: test_profile
target-path: "{{ env_var('DBT_ENV__TARGET_FOLDER', 'target') }}"
models-path: "models"
`;

            await fs.writeFile(
                path.join(tempDir, 'dbt_project.yml'),
                dbtProjectContent,
            );

            const context = await getDbtContext({ projectDir: tempDir });

            expect(context.targetDir).toBe(path.join(tempDir, 'custom-target'));
            expect(context.projectName).toBe('test_project');
            expect(context.profileName).toBe('test_profile');
        });

        test('should use default value when env_var is not set', async () => {
            const dbtProjectContent = `name: test_project
profile: test_profile
target-path: "{{ env_var('DBT_ENV__TARGET_FOLDER', 'target') }}"
models-path: "models"
`;

            await fs.writeFile(
                path.join(tempDir, 'dbt_project.yml'),
                dbtProjectContent,
            );

            const context = await getDbtContext({ projectDir: tempDir });

            expect(context.targetDir).toBe(path.join(tempDir, 'target'));
        });

        test('should work with models-path env_var', async () => {
            process.env.DBT_MODELS_PATH = 'custom-models';

            const dbtProjectContent = `name: test_project
profile: test_profile
target-path: "target"
models-path: "{{ env_var('DBT_MODELS_PATH', 'models') }}"
`;

            await fs.writeFile(
                path.join(tempDir, 'dbt_project.yml'),
                dbtProjectContent,
            );

            const context = await getDbtContext({ projectDir: tempDir });

            expect(context.modelsDir).toBe(path.join(tempDir, 'custom-models'));
        });

        test('should work without any templating', async () => {
            const dbtProjectContent = `name: test_project
profile: test_profile
target-path: "target"
models-path: "models"
`;

            await fs.writeFile(
                path.join(tempDir, 'dbt_project.yml'),
                dbtProjectContent,
            );

            const context = await getDbtContext({ projectDir: tempDir });

            expect(context.targetDir).toBe(path.join(tempDir, 'target'));
            expect(context.modelsDir).toBe(path.join(tempDir, 'models'));
        });
    });
});
