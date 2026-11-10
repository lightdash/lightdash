import {
    type Document,
    ContentReviewContentType,
    DirectAccessResourceType,
    PromotionAction,
    type PromotionChanges,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentActions from './DocumentActions';

const mocks = vi.hoisted(() => ({
    canManage: true,
    canPin: true,
    documentsEnabled: true,
    pinLoading: false,
    isPinned: false,
    togglePin: vi.fn(),
    isAvailable: true,
    modal: vi.fn(),
    deleteModal: vi.fn(),
    canDelete: false,
    navigate: vi.fn(),
    copy: vi.fn(),
    codeModal: vi.fn(),
    canDuplicate: false,
    duplicateModal: vi.fn(),
    isFavorite: false,
    toggleFavorite: vi.fn(),
    exportPdf: vi.fn(),
    canEdit: false,
    ownerModal: vi.fn(),
    upstreamProjectUuid: undefined as string | undefined,
    promotionDiff: undefined as PromotionChanges | undefined,
    requestDiff: vi.fn(),
    promote: vi.fn(),
    canRequestReview: false,
    reviewModal: vi.fn(),
    verify: vi.fn(),
    unverify: vi.fn(),
    verification: null as Document['verification'],
    spaceUuid: 'space' as string | null,
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { ability: { can: () => mocks.canPin } } },
    }),
}));
vi.mock('../../hooks/useContentVerification', () => ({
    useVerifyDocumentMutation: () => ({
        mutate: mocks.verify,
        isLoading: false,
    }),
    useUnverifyDocumentMutation: () => ({
        mutate: mocks.unverify,
        isLoading: false,
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.documentsEnabled } }),
}));
vi.mock('../../hooks/pinning/useDocumentPinningMutation', () => ({
    useDocumentPinningMutation: () => ({
        mutate: mocks.togglePin,
        isLoading: mocks.pinLoading,
    }),
}));
vi.mock('../../hooks/favorites/useFavorites', () => ({
    useFavorites: () => ({
        data: mocks.isFavorite ? [{ data: { uuid: 'document' } }] : [],
    }),
}));
vi.mock('../../hooks/favorites/useFavoriteMutation', () => ({
    useFavoriteMutation: () => ({
        mutate: mocks.toggleFavorite,
        isLoading: false,
    }),
}));
vi.mock('./useExportDocumentPdf', () => ({
    useExportDocumentPdf: () => ({
        mutate: mocks.exportPdf,
        isLoading: false,
    }),
}));
vi.mock('./useDocumentCreationSpaces', () => ({
    useDocumentCreationSpaces: () => ({
        writableSpaces: mocks.canDuplicate ? [{ uuid: 'destination' }] : [],
    }),
}));
vi.mock('./DocumentDuplicateModal', () => ({
    default: (props: unknown) => {
        mocks.duplicateModal(props);
        return <div>Duplicate document form</div>;
    },
}));
vi.mock('./DocumentAsCodeModal', () => ({
    default: (props: unknown) => {
        mocks.codeModal(props);
        return <div>Document code</div>;
    },
}));
vi.mock('../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
}));
vi.mock('../../components/common/CopyActionIcon', () => ({
    CopyActionIcon: (props: { value: string; copyLabel: string }) => {
        mocks.copy(props);
        return <button>{props.copyLabel}</button>;
    },
}));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('./useCanEditDocument', () => ({
    useCanEditDocument: () => mocks.canEdit,
}));
vi.mock('./DocumentOwnerModal', () => ({
    default: (props: unknown) => {
        mocks.ownerModal(props);
        return <div>Document owner form</div>;
    },
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: { upstreamProjectUuid: mocks.upstreamProjectUuid },
    }),
}));
vi.mock('../promotion/hooks/usePromoteDocument', () => ({
    usePromoteDocumentDiffMutation: () => ({
        mutate: mocks.requestDiff,
        data: mocks.promotionDiff,
        isLoading: false,
        reset: vi.fn(),
    }),
    usePromoteDocumentMutation: () => ({ mutate: mocks.promote }),
}));
vi.mock('./useCanDeleteDocument', () => ({
    useCanDeleteDocument: () => mocks.canDelete,
}));
vi.mock('../../components/common/modal/DocumentDeleteModal', () => ({
    default: (props: { onConfirm: () => void }) => {
        mocks.deleteModal(props);
        return (
            <button onClick={props.onConfirm}>Confirm document deletion</button>
        );
    },
}));
vi.mock('../directAccess/hooks/useCanManageDirectAccess', () => ({
    useCanManageDirectAccess: () => mocks.canManage,
}));
vi.mock('../directAccess/hooks/useDirectAccess', () => ({
    useDirectAccessAvailability: () => ({ isAvailable: mocks.isAvailable }),
}));
vi.mock('../../ee/features/contentReview', () => ({
    RequestReviewModal: (props: unknown) => {
        mocks.reviewModal(props);
        return <div>Request review form</div>;
    },
}));
vi.mock('../directAccess/components/DirectAccessModal', () => ({
    default: (props: unknown) => {
        mocks.modal(props);
        return <div>Access assignments</div>;
    },
}));

const document: Document = {
    pinnedListUuid: null,
    verification: null,
    createdBy: null,
    owner: null,
    documentUuid: 'document',
    projectUuid: 'project',
    organizationUuid: 'org',
    spaceUuid: 'space',
    name: 'Weekly report',
    slug: 'weekly-report',
    description: '',
    createdByUserUuid: null,
    ownerUserUuid: null,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    access: [],
    directAccessRoles: [],
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 2,
        content: { markdown: '', charts: {} },
        createdByUserUuid: null,
        createdAt: new Date('2026-09-15'),
    },
};

describe('Document actions', () => {
    beforeEach(() => {
        mocks.canManage = true;
        mocks.canPin = true;
        mocks.documentsEnabled = true;
        mocks.pinLoading = false;
        mocks.isPinned = false;
        mocks.togglePin.mockReset();
        mocks.isAvailable = true;
        mocks.modal.mockReset();
        mocks.canDelete = false;
        mocks.deleteModal.mockReset();
        mocks.navigate.mockReset();
        mocks.copy.mockReset();
        mocks.codeModal.mockReset();
        mocks.canDuplicate = false;
        mocks.duplicateModal.mockReset();
        mocks.isFavorite = false;
        mocks.toggleFavorite.mockReset();
        mocks.exportPdf.mockReset();
        mocks.canEdit = false;
        mocks.ownerModal.mockReset();
        mocks.upstreamProjectUuid = undefined;
        mocks.promotionDiff = undefined;
        mocks.requestDiff.mockReset();
        mocks.promote.mockReset();
        mocks.canRequestReview = false;
        mocks.reviewModal.mockReset();
    });
    const renderActions = () =>
        render(
            <MantineProvider>
                <DocumentActions
                    canRequestReview={mocks.canRequestReview}
                    document={{
                        ...document,
                        pinnedListUuid: mocks.isPinned ? 'pins' : null,
                        verification: mocks.verification,
                        spaceUuid: mocks.spaceUuid,
                    }}
                />
            </MantineProvider>,
        );

    describe('verification', () => {
        beforeEach(() => {
            mocks.verify.mockReset();
            mocks.unverify.mockReset();
            mocks.verification = null;
            mocks.spaceUuid = 'space';
        });
        const openMenu = () => {
            renderActions();
            fireEvent.click(
                screen.getByRole('button', { name: 'Document actions' }),
            );
        };

        it('lets a verification manager verify the Document', async () => {
            openMenu();
            fireEvent.click(
                await screen.findByRole('menuitem', { name: 'Verify' }),
            );
            expect(mocks.verify).toHaveBeenCalledWith({
                projectUuid: 'project',
                documentUuid: 'document',
            });
        });

        it('offers to remove verification from a verified Document', async () => {
            mocks.verification = {
                verifiedBy: {
                    userUuid: 'admin',
                    firstName: 'A',
                    lastName: 'B',
                },
                verifiedAt: new Date('2026-10-01'),
            };
            openMenu();
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Remove verification',
                }),
            );
            expect(mocks.unverify).toHaveBeenCalledWith({
                projectUuid: 'project',
                documentUuid: 'document',
            });
        });

        it.each([
            ['a personal Document', { spaceUuid: null, canPin: true }],
            [
                'a user who cannot manage verification',
                { spaceUuid: 'space', canPin: false },
            ],
        ] as const)('hides verification for %s', async (_case, state) => {
            mocks.spaceUuid = state.spaceUuid;
            mocks.canPin = state.canPin;
            openMenu();
            await screen.findByRole('menuitem', { name: 'Version history' });
            expect(
                screen.queryByRole('menuitem', { name: 'Verify' }),
            ).not.toBeInTheDocument();
        });
    });

    it.each([false, true])(
        'toggles the exact Document with current pin state %s',
        async (isPinned) => {
            mocks.isPinned = isPinned;
            renderActions();
            fireEvent.click(
                screen.getByRole('button', { name: 'Document actions' }),
            );
            fireEvent.click(
                await screen.findByRole('menuitem', {
                    name: isPinned ? 'Unpin from homepage' : 'Pin to homepage',
                }),
            );
            expect(mocks.togglePin).toHaveBeenCalledWith({
                projectUuid: 'project',
                documentUuid: 'document',
            });
        },
    );
    it.each([
        { canPin: false, documentsEnabled: true },
        { canPin: true, documentsEnabled: false },
    ])('hides pin controls when unavailable %j', async (permissions) => {
        Object.assign(mocks, permissions);
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        await screen.findByRole('menuitem', { name: 'View as code' });
        expect(
            screen.queryByRole('menuitem', { name: 'Pin to homepage' }),
        ).not.toBeInTheDocument();
    });
    describe('a personal Document', () => {
        const personal = { ...document, spaceUuid: null };
        const renderPersonal = () =>
            render(
                <MantineProvider>
                    <DocumentActions
                        document={personal}
                        canRequestReview={false}
                    />
                </MantineProvider>,
            );

        it('hides actions that need a space first', async () => {
            mocks.canEdit = true;
            mocks.upstreamProjectUuid = 'upstream';
            renderPersonal();
            expect(
                screen.queryByRole('button', { name: /favorites/ }),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Document actions' }),
            );
            await screen.findByRole('menuitem', { name: 'Export PDF' });
            [
                'Share',
                'Pin to homepage',
                'Promote document',
                'View as code',
            ].forEach((name) =>
                expect(
                    screen.queryByRole('menuitem', { name }),
                ).not.toBeInTheDocument(),
            );
        });
    });

    it('exports this Document as a PDF', async () => {
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Export PDF' }),
        );
        expect(mocks.exportPdf).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                documentUuid: 'document',
                projectUuid: 'project',
            }),
        );
    });
    it('prevents toggling while a pin mutation is pending', async () => {
        mocks.pinLoading = true;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Pin to homepage' }),
        );
        expect(mocks.togglePin).not.toHaveBeenCalled();
    });

    it('opens the shared access modal from the overflow menu', async () => {
        renderActions();
        expect(mocks.modal).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Share' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Share' }));
        expect(screen.getByText('Access assignments')).toBeInTheDocument();
        expect(mocks.modal).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project',
                resource: {
                    resourceType: DirectAccessResourceType.DOCUMENT,
                    resourceUuid: 'document',
                    name: 'Weekly report',
                },
            }),
        );
    });

    it('copies a full project-slug and document-slug URL', () => {
        renderActions();
        expect(mocks.copy).toHaveBeenCalledWith(
            expect.objectContaining({
                value: `${window.location.origin}/projects/project-slug/documents/weekly-report`,
            }),
        );
    });

    it('confirms deletion for the exact Document before returning to its list', async () => {
        mocks.canDelete = true;
        renderActions();
        expect(mocks.deleteModal).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete' }),
        );
        await waitFor(() =>
            expect(mocks.deleteModal).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: 'project',
                    uuid: 'document',
                    name: 'Weekly report',
                }),
            ),
        );
        expect(mocks.navigate).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm document deletion' }),
        );
        expect(mocks.navigate).toHaveBeenCalledWith(
            '/projects/project-slug/documents',
        );
    });

    it('requests review of a personal Document', async () => {
        mocks.canRequestReview = true;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Request review' }),
        );
        expect(
            await screen.findByText('Request review form'),
        ).toBeInTheDocument();
        expect(mocks.reviewModal).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project',
                contentType: ContentReviewContentType.DOCUMENT,
                contentUuid: 'document',
                contentName: 'Weekly report',
            }),
        );
    });

    it('does not offer a review request when the Document is not eligible', async () => {
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        await screen.findByRole('menuitem', { name: 'View as code' });
        expect(
            screen.queryByRole('menuitem', { name: 'Request review' }),
        ).not.toBeInTheDocument();
    });

    it('opens version history for a reader', async () => {
        mocks.canManage = false;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Version history' }),
        );
        expect(mocks.navigate).toHaveBeenCalledWith(
            expect.stringMatching(
                /^\/projects\/project-slug\/documents\/.+\/history$/,
            ),
        );
    });

    it('lets a read-only reader view code without exposing deletion', async () => {
        mocks.canManage = false;
        renderActions();
        expect(mocks.codeModal).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        const viewCode = await screen.findByRole('menuitem', {
            name: 'View as code',
        });
        expect(
            screen.queryByRole('menuitem', { name: 'Delete' }),
        ).not.toBeInTheDocument();
        fireEvent.click(viewCode);
        expect(await screen.findByText('Document code')).toBeInTheDocument();
        expect(mocks.deleteModal).not.toHaveBeenCalled();
        expect(mocks.codeModal).toHaveBeenCalledWith(
            expect.objectContaining({ document, opened: true }),
        );
    });

    it('lets a reader duplicate into an authorized destination without source update rights', async () => {
        mocks.canManage = false;
        mocks.canDuplicate = true;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Duplicate' }),
        );
        expect(
            await screen.findByText('Duplicate document form'),
        ).toBeInTheDocument();
        expect(mocks.duplicateModal).toHaveBeenCalledWith(
            expect.objectContaining({
                documentUuid: document.documentUuid,
                projectUuid: document.projectUuid,
            }),
        );
    });

    it('lets a read-only reader favorite and reflects refreshed favorite state', () => {
        mocks.canManage = false;
        const view = renderActions();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Add Weekly report to favorites',
            }),
        );
        expect(mocks.toggleFavorite).toHaveBeenCalledWith({
            contentType: 'document',
            contentUuid: 'document',
        });
        mocks.isFavorite = true;
        view.rerender(
            <MantineProvider>
                <DocumentActions
                    canRequestReview={mocks.canRequestReview}
                    document={{
                        ...document,
                        pinnedListUuid: mocks.isPinned ? 'pins' : null,
                    }}
                />
            </MantineProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Remove Weekly report from favorites',
            }),
        );
        expect(mocks.toggleFavorite).toHaveBeenCalledTimes(2);
    });

    it.each([
        { canManage: false, isAvailable: true },
        { canManage: true, isAvailable: false },
    ])(
        'hides grant controls when access management is unavailable: %j',
        async (permissions) => {
            Object.assign(mocks, permissions);
            renderActions();
            fireEvent.click(
                screen.getByRole('button', { name: 'Document actions' }),
            );
            await screen.findByRole('menuitem', { name: 'View as code' });
            expect(
                screen.queryByRole('menuitem', { name: 'Share' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Copy document link' }),
            ).toBeInTheDocument();
            expect(mocks.modal).not.toHaveBeenCalled();
        },
    );

    it('hides promotion from members who cannot edit the Document', async () => {
        mocks.upstreamProjectUuid = 'upstream';
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        await screen.findByRole('menuitem', { name: 'View as code' });
        expect(
            screen.queryByRole('menuitem', { name: 'Promote document' }),
        ).not.toBeInTheDocument();
    });

    it('disables promotion when the project has no upstream project', async () => {
        mocks.canEdit = true;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        expect(
            await screen.findByRole('menuitem', { name: 'Promote document' }),
        ).toBeDisabled();
    });

    it('reviews the promotion diff before promoting the Document', async () => {
        mocks.canEdit = true;
        mocks.upstreamProjectUuid = 'upstream';
        const view = renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Promote document' }),
        );
        expect(mocks.requestDiff).toHaveBeenCalledWith('document');

        mocks.promotionDiff = {
            spaces: [],
            dashboards: [],
            charts: [],
            documents: [
                {
                    action: PromotionAction.UPDATE,
                    data: { uuid: 'upstream-document', name: 'Weekly report' },
                },
            ],
        };
        view.rerender(
            <MantineProvider>
                <DocumentActions document={document} canRequestReview={false} />
            </MantineProvider>,
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Promote' }));

        expect(mocks.promote).toHaveBeenCalledWith('document');
    });

    it('lets an editor open the owner form for the exact Document', async () => {
        mocks.canEdit = true;
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Assign owner' }),
        );
        expect(await screen.findByText('Document owner form')).toBeVisible();
        expect(mocks.ownerModal).toHaveBeenCalledWith(
            expect.objectContaining({
                document: expect.objectContaining({ documentUuid: 'document' }),
            }),
        );
    });

    it('hides owner assignment from readers', async () => {
        renderActions();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        await screen.findByRole('menuitem', { name: 'View as code' });
        expect(
            screen.queryByRole('menuitem', { name: 'Assign owner' }),
        ).not.toBeInTheDocument();
    });
});
