import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    ContentType,
    FeatureFlags,
    getDocumentUrl,
    type Document,
} from '@lightdash/common';
import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core';
import {
    IconCode,
    IconCopy,
    IconDots,
    IconTrash,
    IconPin,
    IconPinnedOff,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import { FavoriteActionIcon } from '../../components/common/FavoriteActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import DocumentDeleteModal from '../../components/common/modal/DocumentDeleteModal';
import { useFavoriteMutation } from '../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useDocumentPinningMutation } from '../../hooks/pinning/useDocumentPinningMutation';
import { usePinnedItems } from '../../hooks/pinning/usePinnedItems';
import { useProject } from '../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import DirectAccessModal from '../directAccess/components/DirectAccessModal';
import { useCanManageDirectAccess } from '../directAccess/hooks/useCanManageDirectAccess';
import { useDirectAccessAvailability } from '../directAccess/hooks/useDirectAccess';
import DocumentAsCodeModal from './DocumentAsCodeModal';
import DocumentDuplicateModal from './DocumentDuplicateModal';
import { useCanDeleteDocument } from './useCanDeleteDocument';
import { useDocumentCreationSpaces } from './useDocumentCreationSpaces';

const DocumentActions = ({ document }: { document: Document }) => {
    const { user } = useApp();
    const documentFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        isError: isProjectError,
    } = useProject(document.projectUuid);
    const pins = usePinnedItems(document.projectUuid, project?.pinnedListUuid);
    const pinMutation = useDocumentPinningMutation();
    const isPinned =
        pins.data?.some((item) => item.data.uuid === document.documentUuid) ??
        false;
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
    const { writableSpaces } = useDocumentCreationSpaces(document.projectUuid);
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const canDelete = useCanDeleteDocument(document);
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
        <Group gap="sm">
            <FavoriteActionIcon
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
            <CopyActionIcon value={url} copyLabel="Copy document link" />
            {isAvailable && canManage && (
                <>
                    <Button
                        variant="default"
                        onClick={() => setShareOpen(true)}
                    >
                        Share
                    </Button>
                    {isShareOpen && (
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
                </>
            )}
            <Menu>
                <Menu.Target>
                    <Tooltip label="Document actions">
                        <ActionIcon aria-label="Document actions">
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                    {canPin && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon
                                    icon={isPinned ? IconPinnedOff : IconPin}
                                />
                            }
                            disabled={
                                isProjectLoading ||
                                isProjectError ||
                                pins.isInitialLoading ||
                                pins.isError ||
                                pinMutation.isLoading
                            }
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
                    {writableSpaces.length > 0 && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={() => setDuplicateOpen(true)}
                        >
                            Duplicate
                        </Menu.Item>
                    )}
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconCode} />}
                        onClick={() => setCodeOpen(true)}
                    >
                        View as code
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
            {isCodeOpen && (
                <DocumentAsCodeModal
                    document={document}
                    opened
                    onClose={() => setCodeOpen(false)}
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
        </Group>
    );
};

export default DocumentActions;
