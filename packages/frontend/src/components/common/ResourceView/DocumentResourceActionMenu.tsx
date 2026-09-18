import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    FeatureFlags,
    type ResourceViewDocumentItem,
} from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import {
    IconDots,
    IconCopy,
    IconFolderSymlink,
    IconUsers,
    IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../../features/directAccess';
import DocumentDuplicateModal from '../../../features/documents/DocumentDuplicateModal';
import { useCanDeleteDocument } from '../../../features/documents/useCanDeleteDocument';
import { useDocumentCreationSpaces } from '../../../features/documents/useDocumentCreationSpaces';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import type { ResourceViewActionMenuProps } from './ResourceActionMenu';
import { ResourceViewItemAction } from './types';

type Props = Omit<ResourceViewActionMenuProps, 'item'> & {
    item: ResourceViewDocumentItem;
};

const DocumentResourceActionMenu = ({
    item,
    disabled,
    isOpen,
    onOpen,
    onClose,
    onAction,
    allowDelete = true,
}: Props) => {
    const { projectUuid, organizationUuid, spaceUuid, directAccessRoles } =
        item.data;
    const { user } = useApp();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    const availability = useDirectAccessAvailability();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
    const { writableSpaces } = useDocumentCreationSpaces(projectUuid);
    const canDuplicate = writableSpaces.length > 0;
    const canManageAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid,
        createdByUserUuid: null,
        access: [],
        grantRoles: directAccessRoles,
    });
    const space = spaces.find(({ uuid }) => uuid === spaceUuid);
    const canMove =
        user.data?.ability.can(
            'update',
            subject('Document', {
                organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject:
                    space?.inheritsFromOrgOrProject ?? false,
                access: space?.userAccess ? [space.userAccess] : [],
            }),
        ) === true;
    const canShare = availability.isAvailable && canManageAccess;
    const hasDeleteAccess = useCanDeleteDocument(item.data);
    const canDelete = allowDelete && hasDeleteAccess;
    if (
        flag.isError ||
        !flag.data?.enabled ||
        (!canMove && !canShare && !canDelete && !canDuplicate)
    ) {
        return null;
    }
    return (
        <>
            <Menu
                disabled={disabled}
                opened={isOpen}
                onOpen={onOpen}
                onClose={onClose}
                returnFocus={!isShareOpen && !isDuplicateOpen}
            >
                <Menu.Target>
                    <Tooltip label="Document actions">
                        <ActionIcon
                            disabled={disabled}
                            aria-label="Document actions"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                    {canDuplicate && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={() => setIsDuplicateOpen(true)}
                        >
                            Duplicate
                        </Menu.Item>
                    )}
                    {canMove && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFolderSymlink} />
                            }
                            onClick={() =>
                                onAction({
                                    type: ResourceViewItemAction.TRANSFER_TO_SPACE,
                                    item,
                                })
                            }
                        >
                            Move
                        </Menu.Item>
                    )}
                    {canShare && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconUsers} />}
                            onClick={() => setIsShareOpen(true)}
                        >
                            Share
                        </Menu.Item>
                    )}
                    {canDelete && (
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() =>
                                onAction({
                                    type: ResourceViewItemAction.DELETE,
                                    item,
                                })
                            }
                        >
                            Delete
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
            {isShareOpen && (
                <DirectAccessModal
                    opened
                    onClose={() => setIsShareOpen(false)}
                    projectUuid={projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.DOCUMENT,
                        resourceUuid: item.data.uuid,
                        name: item.data.name,
                    }}
                />
            )}
            {isDuplicateOpen && (
                <DocumentDuplicateModal
                    projectUuid={projectUuid}
                    documentUuid={item.data.uuid}
                    name={item.data.name}
                    description={item.data.description ?? ''}
                    spaceUuid={spaceUuid}
                    opened
                    onClose={() => setIsDuplicateOpen(false)}
                />
            )}
        </>
    );
};

export default DocumentResourceActionMenu;
