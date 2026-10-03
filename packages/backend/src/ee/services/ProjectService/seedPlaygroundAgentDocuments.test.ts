import path from 'path';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import {
    seedPlaygroundAgentDocuments,
    seedTrainingCopyAgentDocuments,
} from './seedPlaygroundAgentDocuments';

const PLAYGROUND_DIR = path.resolve(__dirname, '../../../../assets/playground');

const setup = () => ({
    aiAgentModel: {
        findAgentsForCode: vi
            .fn()
            .mockResolvedValue([
                { uuid: 'copy-agent', slug: 'jaffle-analyst' },
            ]),
    },
    aiAgentDocumentModel: {
        findAllForAgent: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        getOrganizationContentSize: vi.fn().mockResolvedValue(0),
    },
});

describe('seedPlaygroundAgentDocuments', () => {
    it('ships a knowledge document with a summary written ahead of time', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const [document] = content.agent?.knowledgeDocuments ?? [];
        expect(document?.content).toContain('# ');
        expect(document?.summary.description).not.toBe('');
        expect(document?.summary.relatedExploreNames).toEqual(
            expect.arrayContaining(['orders', 'payments']),
        );
    });

    it("scopes each document to the project and grants it to the project's agent only", async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const { aiAgentModel, aiAgentDocumentModel } = setup();
        await seedPlaygroundAgentDocuments({
            organizationUuid: 'org',
            projectUuid: 'copy',
            createdByUserUuid: 'training-admin',
            content,
            aiAgentModel,
            aiAgentDocumentModel,
        });
        expect(aiAgentModel.findAgentsForCode).toHaveBeenCalledWith({
            organizationUuid: 'org',
            projectUuid: 'copy',
            slugs: ['jaffle-analyst'],
        });
        expect(aiAgentDocumentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org',
                projectUuid: 'copy',
                name: 'Jaffle shop glossary',
                mimeType: 'text/markdown',
                agentUuids: ['copy-agent'],
                createdByUserUuid: 'training-admin',
            }),
        );
    });

    it('adds nothing when the project has no training agent', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const { aiAgentModel, aiAgentDocumentModel } = setup();
        aiAgentModel.findAgentsForCode.mockResolvedValue([]);
        await seedPlaygroundAgentDocuments({
            organizationUuid: 'org',
            projectUuid: 'copy',
            createdByUserUuid: null,
            content,
            aiAgentModel,
            aiAgentDocumentModel,
        });
        expect(aiAgentDocumentModel.create).not.toHaveBeenCalled();
    });

    it('never pushes an organization over its document quota', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const { aiAgentModel, aiAgentDocumentModel } = setup();
        aiAgentDocumentModel.getOrganizationContentSize.mockResolvedValue(
            5 * 1024 * 1024,
        );
        await seedPlaygroundAgentDocuments({
            organizationUuid: 'org',
            projectUuid: 'copy',
            createdByUserUuid: null,
            content,
            aiAgentModel,
            aiAgentDocumentModel,
        });
        expect(aiAgentDocumentModel.create).not.toHaveBeenCalled();
    });

    it('leaves a document the agent already has alone', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const { aiAgentModel, aiAgentDocumentModel } = setup();
        aiAgentDocumentModel.findAllForAgent.mockResolvedValue([
            { name: 'Jaffle shop glossary' },
        ]);
        await seedPlaygroundAgentDocuments({
            organizationUuid: 'org',
            projectUuid: 'copy',
            createdByUserUuid: null,
            content,
            aiAgentModel,
            aiAgentDocumentModel,
        });
        expect(aiAgentDocumentModel.create).not.toHaveBeenCalled();
    });
});

describe('seedTrainingCopyAgentDocuments', () => {
    beforeEach(() => vi.stubEnv('PLAYGROUND_DATA_DIR', PLAYGROUND_DIR));
    afterEach(() => vi.unstubAllEnvs());

    it('reads the documents from the shipped bundle', async () => {
        const { aiAgentModel, aiAgentDocumentModel } = setup();
        await seedTrainingCopyAgentDocuments({
            organizationUuid: 'org',
            projectUuid: 'copy',
            createdByUserUuid: null,
            aiAgentModel,
            aiAgentDocumentModel,
        });
        expect(aiAgentDocumentModel.create).toHaveBeenCalledTimes(1);
    });
});
