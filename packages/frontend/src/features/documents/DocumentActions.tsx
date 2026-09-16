import { DirectAccessResourceType, type Document } from '@lightdash/common';
import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import DocumentDeleteModal from '../../components/common/modal/DocumentDeleteModal';
import DirectAccessModal from '../directAccess/components/DirectAccessModal';
import { useCanManageDirectAccess } from '../directAccess/hooks/useCanManageDirectAccess';
import { useDirectAccessAvailability } from '../directAccess/hooks/useDirectAccess';
import { useCanDeleteDocument } from './useCanDeleteDocument';

const DocumentActions = ({ document }: { document: Document }) => {
    const [isShareOpen, setShareOpen] = useState(false);
    const [isDeleteOpen, setDeleteOpen] = useState(false);
    const navigate = useNavigate();
    const canDelete = useCanDeleteDocument(document);
    const { isAvailable } = useDirectAccessAvailability();
    const canManage = useCanManageDirectAccess({
        projectUuid: document.projectUuid,
        spaceUuid: document.spaceUuid,
        createdByUserUuid: document.createdByUserUuid,
        access: document.access ?? [],
        grantRoles: document.directAccessRoles ?? [],
    });
    const url = `${window.location.origin}/projects/${document.projectUuid}/documents/${document.documentUuid}`;
    return (
        <Group gap="sm">
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
            {canDelete && (
                <>
                    <Menu>
                        <Menu.Target>
                            <Tooltip label="Document actions">
                                <ActionIcon aria-label="Document actions">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                color="red"
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={() => setDeleteOpen(true)}
                            >
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    {isDeleteOpen && (
                        <DocumentDeleteModal
                            opened
                            projectUuid={document.projectUuid}
                            uuid={document.documentUuid}
                            name={document.name}
                            onClose={() => setDeleteOpen(false)}
                            onConfirm={() =>
                                navigate(
                                    `/projects/${document.projectUuid}/documents`,
                                )
                            }
                        />
                    )}
                </>
            )}
        </Group>
    );
};

export default DocumentActions;
