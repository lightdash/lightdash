import {
    ContentAsCodeType,
    ForbiddenError,
    PromotionAction,
    type HomepageAsCode,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    readCodeResourceFiles,
    writeCodeResourceDocuments,
} from './contentAsCode/resource';
import { lightdashApi } from './dbt/apiClient';
import { downloadHomepages, uploadHomepages } from './homepagesAsCode';

vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('./contentAsCode/resource', () => ({
    readCodeResourceFiles: vi.fn(),
    writeCodeResourceDocuments: vi.fn(),
    assertCodeResourceFilesValid: vi.fn(),
}));
vi.mock('../globalState', () => ({ default: { log: vi.fn() } }));

const document: HomepageAsCode = {
    contentType: ContentAsCodeType.HOMEPAGE,
    version: 1,
    name: 'Home / Team',
    config: { version: 1, rows: [] },
    publication: null,
};

describe('homepage CLI download/upload', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requests exact names and preserves other files during a filtered download', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            homepages: [document],
            missingNames: [],
        });
        await downloadHomepages(
            'project',
            [document.name],
            '/tmp/homepage-code',
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/api/v1/projects/project/code/homepages?names=Home+%2F+Team',
            }),
        );
        expect(writeCodeResourceDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                documents: [document],
                pruneOtherDocuments: false,
            }),
        );
    });

    it('skips unavailable homepages only for implicit include-all downloads', async () => {
        vi.mocked(lightdashApi).mockRejectedValue(new ForbiddenError());
        await expect(
            downloadHomepages('project', [], undefined, true),
        ).resolves.toBe(0);
        await expect(
            downloadHomepages('project', [], undefined, false),
        ).rejects.toThrow();
        expect(writeCodeResourceDocuments).not.toHaveBeenCalled();
    });

    it('passes the publication option explicitly and reports unchanged uploads', async () => {
        vi.mocked(readCodeResourceFiles).mockResolvedValue({
            files: [{ filePath: 'home.yml', document }],
            failures: [],
        });
        vi.mocked(lightdashApi).mockResolvedValue({
            action: PromotionAction.NO_CHANGES,
        });
        await expect(
            uploadHomepages('project', [], {}, false),
        ).resolves.toEqual({ 'homepages unchanged': 1 });
        expect(lightdashApi).toHaveBeenLastCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/api/v1/projects/project/code/homepages/Home%20%2F%20Team?publish=false',
            }),
        );
        await uploadHomepages('project', [], {}, true);
        expect(lightdashApi).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: '/api/v1/projects/project/code/homepages/Home%20%2F%20Team?publish=true',
            }),
        );
    });

    it('fails missing selections and records API failures for a nonzero CLI exit', async () => {
        vi.mocked(readCodeResourceFiles).mockResolvedValue({
            files: [{ filePath: 'home.yml', document }],
            failures: [],
        });
        await expect(
            uploadHomepages('project', ['Missing'], {}, false),
        ).rejects.toThrow('not found locally');
        expect(lightdashApi).not.toHaveBeenCalled();
        vi.mocked(lightdashApi).mockRejectedValue(
            new Error('Missing reference'),
        );
        await expect(
            uploadHomepages('project', [], {}, false),
        ).resolves.toEqual({ 'homepages with errors': 1 });
    });
});
