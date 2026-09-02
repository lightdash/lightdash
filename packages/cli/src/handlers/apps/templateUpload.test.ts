import { promises as fs } from 'fs';
import { Response } from 'node-fetch';
import * as os from 'os';
import * as path from 'path';
import { extract as tarExtract } from 'tar-stream';
import { lightdashRawApi } from '../dbt/apiClient';
import {
    buildDataAppTemplatePackage,
    uploadAppsAsTemplates,
} from './templateUpload';

vi.mock('../dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    lightdashRawApi: vi.fn(),
}));

const MANIFEST = JSON.stringify({
    templateVersion: 1,
    template: {
        id: 'forecaster',
        name: 'Forecaster',
        description: 'A live what-if forecast.',
        category: 'Forecasting',
    },
});

const listTarEntries = (archive: Buffer): Promise<string[]> =>
    new Promise((resolve, reject) => {
        const names: string[] = [];
        const extractor = tarExtract();
        extractor.on('entry', (header, stream, next) => {
            names.push(header.name);
            stream.on('end', next);
            stream.resume();
        });
        extractor.on('error', reject);
        extractor.on('finish', () => resolve(names.sort()));
        extractor.end(archive);
    });

const writeApp = async (root: string, slug: string) => {
    const appDir = path.join(root, 'apps', slug);
    await fs.mkdir(path.join(appDir, 'src', 'components'), {
        recursive: true,
    });
    await fs.mkdir(path.join(appDir, 'node_modules', 'react'), {
        recursive: true,
    });
    await fs.mkdir(path.join(appDir, '.lightdash', 'context'), {
        recursive: true,
    });
    await fs.writeFile(path.join(appDir, 'lightdash-app.yml'), 'name: x\n');
    await fs.writeFile(path.join(appDir, 'package.json'), '{}');
    await fs.writeFile(path.join(appDir, 'AGENTS.md'), '# guardrails');
    await fs.writeFile(path.join(appDir, 'src', 'template.json'), MANIFEST);
    await fs.writeFile(path.join(appDir, 'src', 'App.jsx'), 'export {}');
    await fs.writeFile(
        path.join(appDir, 'src', 'components', 'Chart.jsx'),
        'export {}',
    );
    await fs.writeFile(
        path.join(appDir, 'node_modules', 'react', 'index.js'),
        '',
    );
    await fs.writeFile(
        path.join(appDir, '.lightdash', 'context', 'semantic-layer.yml'),
        '',
    );
    return appDir;
};

describe('data app template upload', () => {
    let root: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'template-upload-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('packs only the authored files: src/** and AGENTS.md', async () => {
        const appDir = await writeApp(root, 'forecaster');
        const archive = await buildDataAppTemplatePackage(appDir);
        await expect(listTarEntries(archive)).resolves.toEqual([
            'AGENTS.md',
            'src/App.jsx',
            'src/components/Chart.jsx',
            'src/template.json',
        ]);
    });

    it('rejects an app folder without src/template.json', async () => {
        const appDir = await writeApp(root, 'plain');
        await fs.rm(path.join(appDir, 'src', 'template.json'));
        await expect(buildDataAppTemplatePackage(appDir)).rejects.toThrow(
            /src\/template\.json/,
        );
    });

    it('PUTs each selected app folder as a raw tar to the org templates endpoint', async () => {
        await writeApp(root, 'forecaster');
        vi.mocked(lightdashRawApi).mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        slug: 'forecaster',
                        name: 'Forecaster',
                        questions: [],
                        action: 'created',
                    },
                }),
            ) as never,
        );

        const summary = await uploadAppsAsTemplates({
            customPath: root,
            appRefs: ['forecaster'],
        });

        expect(summary).toEqual({ created: 1, updated: 0, failed: 0 });
        expect(lightdashRawApi).toHaveBeenCalledTimes(1);
        const [call] = vi.mocked(lightdashRawApi).mock.calls;
        expect(call[0].method).toBe('PUT');
        expect(call[0].url).toBe('/api/v1/org/data-app-templates/package');
        expect(call[0].headers).toMatchObject({
            'Content-Type': 'application/x-tar',
        });
        expect(Number(call[0].headers?.['Content-Length'])).toBe(
            (call[0].body as Buffer).length,
        );
    });

    it('fails fast when a selected folder does not exist', async () => {
        await expect(
            uploadAppsAsTemplates({ customPath: root, appRefs: ['missing'] }),
        ).rejects.toThrow(/missing/);
        expect(lightdashRawApi).not.toHaveBeenCalled();
    });
});
