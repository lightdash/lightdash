import { subject } from '@casl/ability';
import {
    ContentReviewContentType,
    DirectAccessResourceType,
    ContentType,
    FeatureFlags,
    getDocumentUrl,
    type Document,
} from '@lightdash/common';
import { ActionIcon, Box, Menu, Tooltip } from '@mantine/core';
import {
    IconCode,
    IconDatabaseExport,
    IconHistory,
    IconCopy,
    IconDots,
    IconFileTypePdf,
    IconTrash,
    IconPin,
    IconPinnedOff,
    IconSend,
    IconUserCircle,
    IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import { FavoriteActionIcon } from '../../components/common/FavoriteActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import DocumentDeleteModal from '../../components/common/modal/DocumentDeleteModal';
import { RequestReviewModal } from '../../ee/features/contentReview';
import { useFavoriteMutation } from '../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useDocumentPinningMutation } from '../../hooks/pinning/useDocumentPinningMutation';
import { useProject } from '../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import DirectAccessModal from '../directAccess/components/DirectAccessModal';
import { useCanManageDirectAccess } from '../directAccess/hooks/useCanManageDirectAccess';
import { useDirectAccessAvailability } from '../directAccess/hooks/useDirectAccess';
import { PromotionConfirmDialog } from '../promotion/components/PromotionConfirmDialog';
import {
    usePromoteDocumentDiffMutation,
    usePromoteDocumentMutation,
} from '../promotion/hooks/usePromoteDocument';
import DocumentAsCodeModal from './DocumentAsCodeModal';
import DocumentDuplicateModal from './DocumentDuplicateModal';
import DocumentOwnerModal from './DocumentOwnerModal';
import { useCanDeleteDocument } from './useCanDeleteDocument';
import { useCanEditDocument } from './useCanEditDocument';
import { useDocumentCreationSpaces } from './useDocumentCreationSpaces';
import { useExportDocumentPdf } from './useExportDocumentPdf';

const DocumentActions = ({
    document,
    canRequestReview,
}: {
    document: Document;
    canRequestReview: boolean;
}) => {
    const { user } = useApp();
    const documentFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const pinMutation = useDocumentPinningMutation();
    const isPinned = document.pinnedListUuid !== null;
    const canPin =
        !documentFlag.isError &&
        documentFlag.data?.enabled === true &&
        user.data?.ability.can(
            'manage',
            subject('PinnedItems', {
                organizationUuid: document.organizationUuid,
                projectUuid: document.projectUuid,
            }),
        );
    const [isShareOpen, setShareOpen] = useState(false);
    const favorites = useFavorites(document.projectUuid);
    const favoriteMutation = useFavoriteMutation(document.projectUuid);
    const isFavorite =
        favorites.data?.some(
            (item) => item.data.uuid === document.documentUuid,
        ) ?? false;
    const [isDeleteOpen, setDeleteOpen] = useState(false);
    const [isCodeOpen, setCodeOpen] = useState(false);
    const [isDuplicateOpen, setDuplicateOpen] = useState(false);
    const [isOwnerOpen, setOwnerOpen] = useState(false);
    const [isRequestReviewOpen, setRequestReviewOpen] = useState(false);
    const canEdit = useCanEditDocument(document);
    // Pinning, favorites, sharing, promotion and as-code need a Space first
    const isPersonal = document.spaceUuid === null;
    const { writableSpaces } = useDocumentCreationSpaces(document.projectUuid);
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const canDelete = useCanDeleteDocument(document);
    const exportPdf = useExportDocumentPdf();
    const canPromote = canEdit;
    const { data: project } = useProject(document.projectUuid);
    const hasUpstreamProject = project?.upstreamProjectUuid !== undefined;
    const promotionDiff = usePromoteDocumentDiffMutation(document.projectUuid);
    const promoteDocument = usePromoteDocumentMutation(document.projectUuid);
    const { isAvailable } = useDirectAccessAvailability();
    const canManage = useCanManageDirectAccess({
        projectUuid: document.projectUuid,
        spaceUuid: document.spaceUuid,
        createdByUserUuid: document.createdByUserUuid,
        access: document.access ?? [],
        grantRoles: document.directAccessRoles ?? [],
    });
    const url = `${window.location.origin}${getDocumentUrl(projectUrlIdentifier, document.documentUuid, document.slug)}`;
    return (
        <>
            {!isPersonal && (
                <FavoriteActionIcon
                    variant="default"
                    size="lg"
                    name={document.name}
                    isFavorite={isFavorite}
                    disabled={
                        favorites.isLoading ||
                        favorites.isError ||
                        favoriteMutation.isLoading
                    }
                    onToggle={() =>
                        favoriteMutation.mutate({
                            contentType: ContentType.DOCUMENT,
                            contentUuid: document.documentUuid,
                        })
                    }
                />
            )}
            <CopyActionIcon
                variant="default"
                size="lg"
                value={url}
                copyLabel="Copy document link"
            />
            {isAvailable && canManage && isShareOpen && (
                <DirectAccessModal
                    opened
                    onClose={() => setShareOpen(false)}
                    projectUuid={document.projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.DOCUMENT,
                        resourceUuid: document.documentUuid,
                        name: document.name,
                    }}
                />
            )}
            <Menu>
                <Menu.Target>
                    <Tooltip label="Document actions">
                        <ActionIcon
                            variant="default"
                            size="lg"
                            aria-label="Document actions"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                    {isAvailable && canManage && !isPersonal && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconUsers} />}
                            onClick={() => setShareOpen(true)}
                        >
                            Share
                        </Menu.Item>
                    )}
                    {canPin && !isPersonal && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon
                                    icon={isPinned ? IconPinnedOff : IconPin}
                                />
                            }
                            disabled={pinMutation.isLoading}
                            onClick={() =>
                                pinMutation.mutate({
                                    projectUuid: document.projectUuid,
                                    documentUuid: document.documentUuid,
                                })
                            }
                        >
                            {isPinned
                                ? 'Unpin from homepage'
                                : 'Pin to homepage'}
                        </Menu.Item>
                    )}
                    {canEdit && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconUserCircle} />}
                            onClick={() => setOwnerOpen(true)}
                        >
                            {document.owner ? 'Change owner' : 'Assign owner'}
                        </Menu.Item>
                    )}
                    {writableSpaces.length > 0 && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={() => setDuplicateOpen(true)}
                        >
                            Duplicate
                        </Menu.Item>
                    )}
                    {canRequestReview && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={() => setRequestReviewOpen(true)}
                        >
                            Request review
                        </Menu.Item>
                    )}
                    {canPromote && !isPersonal && (
                        <Tooltip
                            label="You must enable first an upstream project in settings > Data ops"
                            disabled={hasUpstreamProject}
                        >
                            <Box>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconDatabaseExport}
                                        />
                                    }
                                    disabled={!hasUpstreamProject}
                                    onClick={() =>
                                        promotionDiff.mutate(
                                            document.documentUuid,
                                        )
                                    }
                                >
                                    Promote document
                                </Menu.Item>
                            </Box>
                        </Tooltip>
                    )}
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconHistory} />}
                        onClick={() =>
                            void navigate(
                                `${getDocumentUrl(projectUrlIdentifier, document.documentUuid, document.slug)}/history`,
                            )
                        }
                    >
                        Version history
                    </Menu.Item>
                    {!isPersonal && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCode} />}
                            onClick={() => setCodeOpen(true)}
                        >
                            View as code
                        </Menu.Item>
                    )}
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconFileTypePdf} />}
                        disabled={exportPdf.isLoading}
                        onClick={() => exportPdf.mutate(document)}
                    >
                        Export PDF
                    </Menu.Item>
                    {canDelete && (
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() => setDeleteOpen(true)}
                        >
                            Delete
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
            {canDelete && isDeleteOpen && (
                <DocumentDeleteModal
                    opened
                    projectUuid={document.projectUuid}
                    uuid={document.documentUuid}
                    name={document.name}
                    onClose={() => setDeleteOpen(false)}
                    onConfirm={() =>
                        navigate(`/projects/${projectUrlIdentifier}/documents`)
                    }
                />
            )}
            {(promotionDiff.data || promotionDiff.isLoading) && (
                <PromotionConfirmDialog
                    type="document"
                    resourceName={document.name}
                    promotionChanges={promotionDiff.data}
                    onClose={promotionDiff.reset}
                    onConfirm={() =>
                        promoteDocument.mutate(document.documentUuid)
                    }
                />
            )}
            {isRequestReviewOpen && (
                <RequestReviewModal
                    projectUuid={document.projectUuid}
                    contentType={ContentReviewContentType.DOCUMENT}
                    contentUuid={document.documentUuid}
                    contentName={document.name}
                    opened
                    onClose={() => setRequestReviewOpen(false)}
                />
            )}
            {isCodeOpen && (
                <DocumentAsCodeModal
                    document={document}
                    opened
                    onClose={() => setCodeOpen(false)}
                />
            )}
            {canEdit && isOwnerOpen && (
                <DocumentOwnerModal
                    document={document}
                    opened
                    onClose={() => setOwnerOpen(false)}
                />
            )}
            {isDuplicateOpen && (
                <DocumentDuplicateModal
                    projectUuid={document.projectUuid}
                    documentUuid={document.documentUuid}
                    name={document.name}
                    description={document.description}
                    spaceUuid={document.spaceUuid}
                    opened
                    onClose={() => setDuplicateOpen(false)}
                />
            )}
        </>
    );
};

export default DocumentActions;
