import { NotFoundError } from '@lightdash/common';
import path from 'path';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import {
    getPlaygroundDocumentContent,
    seedPlaygroundDocuments,
    seedTrainingCopyDocuments,
} from './seedPlaygroundDocuments';

const PLAYGROUND_DIR = path.resolve(__dirname, '../../../../assets/playground');

const setup = () => ({
    getBySlug: vi.fn().mockRejectedValue(new NotFoundError('missing')),
    create: vi.fn().mockResolvedValue({}),
});

describe('getPlaygroundDocumentContent', () => {
    it('turns each shipped sample into content a document saves', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        expect(content.documents?.length).toBeGreaterThan(0);
        content.documents?.forEach((definition) => {
            const parsed = getPlaygroundDocumentContent(
                definition,
                content.charts,
            );
            expect(Object.keys(parsed.charts).sort()).toEqual(
                Object.keys(definition.charts).sort(),
            );
            // The side rail lists top-level headings, which the read walkthrough clicks
            expect(parsed.markdown).toMatch(/^# /m);
        });
    });

    it('rejects a chart block naming a chart the bundle lacks', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        expect(() =>
            getPlaygroundDocumentContent(
                {
                    slug: 'broken',
                    name: 'Broken',
                    description: '',
                    markdown: 'Text\n\n<document-chart id="c1">',
                    charts: { c1: 'no-such-chart' },
                },
                content.charts,
            ),
        ).toThrow('unknown chart: no-such-chart');
    });
});

describe('seedPlaygroundDocuments', () => {
    it('creates each sample in the space, attributed to the given user', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const documentModel = setup();
        await seedPlaygroundDocuments({
            projectUuid: 'copy',
            spaceUuid: 'copy-space',
            createdByUserUuid: 'training-admin',
            content,
            documentModel,
        });
        expect(documentModel.create).toHaveBeenCalledTimes(
            content.documents?.length ?? 0,
        );
        expect(documentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'copy',
                spaceUuid: 'copy-space',
                slug: 'monthly-orders-review',
                createdByUserUuid: 'training-admin',
            }),
        );
    });

    it('leaves a sample the project already has alone', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const documentModel = setup();
        documentModel.getBySlug.mockResolvedValue({});
        await seedPlaygroundDocuments({
            projectUuid: 'copy',
            spaceUuid: 'copy-space',
            createdByUserUuid: null,
            content,
            documentModel,
        });
        expect(documentModel.create).not.toHaveBeenCalled();
    });

    it('does nothing for a bundle without documents', async () => {
        const documentModel = setup();
        await seedPlaygroundDocuments({
            projectUuid: 'copy',
            spaceUuid: 'copy-space',
            createdByUserUuid: null,
            content: { charts: [] },
            documentModel,
        });
        expect(documentModel.getBySlug).not.toHaveBeenCalled();
        expect(documentModel.create).not.toHaveBeenCalled();
    });
});

describe('seedTrainingCopyDocuments', () => {
    beforeEach(() => {
        vi.stubEnv('PLAYGROUND_DATA_DIR', PLAYGROUND_DIR);
    });
    afterEach(() => vi.unstubAllEnvs());

    it('reads the samples from the shipped bundle', async () => {
        const documentModel = setup();
        await seedTrainingCopyDocuments({
            projectUuid: 'copy',
            spaceUuid: 'copy-space',
            createdByUserUuid: 'training-admin',
            documentModel,
        });
        expect(documentModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Monthly orders review' }),
        );
    });
});
