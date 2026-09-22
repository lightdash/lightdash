import {
    ChartType,
    type Document,
    type DocumentAsCode,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { load } from 'js-yaml';
import DocumentAsCodeModal from './DocumentAsCodeModal';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({ lightdashApi: api }));

const exportedDocument: DocumentAsCode = {
    name: 'Weekly report',
    slug: 'weekly-report',
    description: 'Revenue summary',
    spaceSlug: 'reports',
    schemaVersion: 1,
    content: {
        cells: [
            {
                type: 'markdown',
                content: { markdown: '# Results\n\nRevenue: **£42**' },
            },
            {
                type: 'chart',
                content: {
                    source: 'semantic',
                    chart: {
                        name: 'Orders',
                        tableName: 'orders',
                        metricQuery: {
                            exploreName: 'orders',
                            dimensions: [],
                            metrics: [],
                            filters: {},
                            sorts: [],
                            tableCalculations: [],
                            limit: 100,
                        },
                        chartConfig: { type: ChartType.TABLE },
                    },
                },
            },
        ],
    },
};

const document: Document = {
    pinnedListUuid: null,
    createdBy: null,
    documentUuid: 'document',
    projectUuid: 'project',
    organizationUuid: 'organization',
    spaceUuid: 'space',
    name: exportedDocument.name,
    slug: exportedDocument.slug,
    description: exportedDocument.description,
    createdByUserUuid: 'creator',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 1,
        content: exportedDocument.content,
        createdByUserUuid: 'creator',
        createdAt: new Date(),
    },
};

const readBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
    });

describe('Document as code', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        api.mockReset();
    });
    afterEach(() => {
        clients.forEach((client) => client.clear());
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    const renderModal = (opened = true) => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        clients.push(client);
        return render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <DocumentAsCodeModal
                        document={document}
                        opened={opened}
                        onClose={vi.fn()}
                    />
                </MantineProvider>
            </QueryClientProvider>,
        );
    };

    it.each(['yaml', 'json'])(
        'downloads the canonical document preserving cells as %s',
        async (format) => {
            api.mockResolvedValue(exportedDocument);
            const createObjectURL = vi.fn((_blob: Blob) => 'blob:document');
            const revokeObjectURL = vi.fn();
            vi.stubGlobal(
                'URL',
                class extends URL {
                    static createObjectURL = createObjectURL;
                    static revokeObjectURL = revokeObjectURL;
                },
            );
            const click = vi
                .spyOn(HTMLAnchorElement.prototype, 'click')
                .mockImplementation(() => {});
            renderModal();
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Download YAML' }),
                ).toBeEnabled(),
            );
            if (format === 'json') {
                fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
            }
            fireEvent.click(
                screen.getByRole('button', {
                    name: `Download ${format.toUpperCase()}`,
                }),
            );
            expect(api).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'GET',
                    url: '/projects/project/documents/document/as-code',
                }),
            );
            const blob = createObjectURL.mock.calls[0][0];
            expect(blob.type).toBe(`application/${format}`);
            const content = await readBlob(blob);
            expect(load(content)).toEqual(exportedDocument);
            expect(content).not.toContain('documentUuid');
            expect(content).not.toContain('createdByUserUuid');
            expect(content).not.toContain('versionUuid');
            expect(click.mock.instances[0]).toEqual(
                expect.objectContaining({
                    download: `weekly-report.${format}`,
                }),
            );
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:document');
        },
    );

    it('disables copying and download while loading', () => {
        api.mockReturnValue(new Promise(() => {}));
        renderModal();
        expect(
            screen.getByText('Generating document YAML'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Download YAML' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Copy YAML' }),
        ).toBeDisabled();
    });

    it.each([403, 404])(
        'shows unavailable content and disables exports for HTTP %s',
        async (statusCode) => {
            api.mockRejectedValue({
                status: 'error',
                error: {
                    statusCode,
                    name: 'NotFoundError',
                    message: 'Document is unavailable',
                },
            });
            renderModal();
            expect(
                await screen.findByText('Document is unavailable'),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Download YAML' }),
            ).toBeDisabled();
            expect(
                screen.getByRole('button', { name: 'Copy YAML' }),
            ).toBeDisabled();
        },
    );

    it('does not fetch when closed', () => {
        renderModal(false);
        expect(api).not.toHaveBeenCalled();
    });
});
