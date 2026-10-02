import {
    ChartType,
    ContentAsCodeType,
    type AgentAsCode,
    type DocumentAsCode,
    type HomepageAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    AI_AGENT_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
    DOCUMENT_CODE_RESOURCE,
    HOMEPAGE_CODE_RESOURCE,
} from './projectResources';
import { readCodeResourceFiles, writeCodeResourceDocuments } from './resource';

const temporaryDirectories: string[] = [];

const agent = (slug: string): AgentAsCode => ({
    contentType: ContentAsCodeType.AI_AGENT,
    version: 1,
    agentVersion: 2,
    slug,
    name: slug,
    description: null,
    imageUrl: null,
    instruction: null,
    tags: null,
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: false,
    enableUserContext: false,
    modelConfig: null,
});

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            fs.rm(directory, {
                recursive: true,
                force: true,
            }),
        ),
    );
});

describe('content-as-code resource files', () => {
    it('round trips a Document through its slug-named YAML file', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-document-code-'),
        );
        temporaryDirectories.push(basePath);
        const document: DocumentAsCode = {
            name: 'Quarterly review',
            slug: 'quarterly-review',
            description: '',
            spaceSlug: 'reports/finance',
            schemaVersion: 2,
            markdown:
                '# Findings\n\n- "quoted": yes\n\n<document-chart id="c1">',
            charts: {
                c1: {
                    source: 'semantic',
                    chart: {
                        name: 'Orders',
                        tableName: 'orders',
                        metricQuery: {
                            exploreName: 'orders',
                            dimensions: ['orders_status'],
                            metrics: ['orders_count'],
                            filters: {},
                            sorts: [],
                            limit: 100,
                            tableCalculations: [],
                        },
                        chartConfig: { type: ChartType.TABLE },
                    },
                },
            },
        };

        await writeCodeResourceDocuments({
            definition: DOCUMENT_CODE_RESOURCE,
            basePath,
            documents: [document],
            pruneOtherDocuments: true,
        });

        await expect(
            fs.readdir(path.join(basePath, 'documents')),
        ).resolves.toEqual(['quarterly-review.yml']);
        const written = await fs.readFile(
            path.join(basePath, 'documents', 'quarterly-review.yml'),
            'utf8',
        );
        expect(written.split('\n').slice(0, 7)).toEqual([
            'name: Quarterly review',
            'slug: quarterly-review',
            'description: ""',
            'spaceSlug: reports/finance',
            'schemaVersion: 2',
            'markdown: |-',
            '  # Findings',
        ]);
        await expect(
            readCodeResourceFiles({
                definition: DOCUMENT_CODE_RESOURCE,
                basePath,
            }),
        ).resolves.toEqual({
            files: [
                {
                    filePath: path.join(
                        basePath,
                        'documents',
                        'quarterly-review.yml',
                    ),
                    document,
                },
            ],
            failures: [],
        });
    });

    it('reports an invalid Document file without reading it', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-document-code-'),
        );
        temporaryDirectories.push(basePath);
        await fs.mkdir(path.join(basePath, 'documents'));
        await fs.writeFile(
            path.join(basePath, 'documents', 'broken.yml'),
            'name: Broken\nslug: broken\nspaceSlug: reports\nschemaVersion: 2\nmarkdown: ""\ncharts:\n  c1: { source: video }\n',
        );

        const result = await readCodeResourceFiles({
            definition: DOCUMENT_CODE_RESOURCE,
            basePath,
        });

        expect(result.files).toEqual([]);
        expect(result.failures).toEqual([
            {
                message: expect.stringMatching(
                    /^Invalid document file ".*broken\.yml": Invalid Document content/,
                ),
            },
        ]);
    });

    it('round trips exact homepage names safely and rejects duplicate local identities', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-homepage-code-'),
        );
        temporaryDirectories.push(basePath);
        const document: HomepageAsCode = {
            contentType: ContentAsCodeType.HOMEPAGE,
            version: 1,
            name: '../Home / 100%',
            config: { version: 1, rows: [] },
            publication: null,
        };
        await writeCodeResourceDocuments({
            definition: HOMEPAGE_CODE_RESOURCE,
            basePath,
            documents: [document],
            pruneOtherDocuments: true,
        });
        const fileNames = await fs.readdir(path.join(basePath, 'homepages'));
        expect(fileNames).toEqual(['..%2FHome %2F 100%25.yml']);
        const result = await readCodeResourceFiles({
            definition: HOMEPAGE_CODE_RESOURCE,
            basePath,
        });
        expect(result.files[0].document).toEqual(document);
        await fs.copyFile(
            path.join(basePath, 'homepages', fileNames[0]),
            path.join(basePath, 'homepages', 'duplicate.yaml'),
        );
        const duplicates = await readCodeResourceFiles({
            definition: HOMEPAGE_CODE_RESOURCE,
            basePath,
        });
        expect(duplicates.files).toEqual([]);
        expect(duplicates.failures[0].message).toContain('Duplicate');
    });
    it('preserves other documents when writing a filtered download', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha'), agent('beta')],
            pruneOtherDocuments: true,
        });

        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha')],
            pruneOtherDocuments: false,
        });

        await expect(
            fs.readdir(path.join(basePath, 'ai-agents')),
        ).resolves.toEqual(['alpha.yml', 'beta.yml']);
    });

    it('prunes other documents when writing a complete download', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha'), agent('beta')],
            pruneOtherDocuments: true,
        });

        await writeCodeResourceDocuments({
            definition: AI_AGENT_CODE_RESOURCE,
            basePath,
            documents: [agent('alpha')],
            pruneOtherDocuments: true,
        });

        await expect(
            fs.readdir(path.join(basePath, 'ai-agents')),
        ).resolves.toEqual(['alpha.yml']);
    });

    it('ignores other scheduled content types in a shared legacy folder', async () => {
        const basePath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-content-as-code-'),
        );
        temporaryDirectories.push(basePath);
        const alertFolder = path.join(basePath, 'alerts', 'charts', 'orders');
        await fs.mkdir(alertFolder, { recursive: true });
        await Promise.all([
            fs.writeFile(
                path.join(alertFolder, 'alert.yml'),
                'contentType: alert\nversion: 1\nslug: revenue-alert\nname: Revenue alert\n',
            ),
            fs.writeFile(
                path.join(alertFolder, 'delivery.yml'),
                'contentType: scheduled_delivery\nversion: 1\nslug: revenue-delivery\nname: Revenue delivery\n',
            ),
            fs.writeFile(
                path.join(alertFolder, 'invalid-alert.yml'),
                'contentType: alert\nslug: invalid-alert\nname: Invalid alert\n',
            ),
        ]);

        const result = await readCodeResourceFiles({
            definition: ALERT_CODE_RESOURCE,
            basePath,
        });

        expect(result.files.map(({ document }) => document.slug)).toEqual([
            'revenue-alert',
        ]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].message).toContain('invalid-alert.yml');
        expect(result.failures[0].message).toContain('expected version 1');
    });
});
