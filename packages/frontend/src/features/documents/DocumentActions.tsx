import { DirectAccessResourceType, type Document } from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { useState } from 'react';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import DirectAccessModal from '../directAccess/components/DirectAccessModal';
import { useCanManageDirectAccess } from '../directAccess/hooks/useCanManageDirectAccess';
import { useDirectAccessAvailability } from '../directAccess/hooks/useDirectAccess';

const DocumentActions = ({ document }: { document: Document }) => {
    const [isShareOpen, setShareOpen] = useState(false);
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
        </Group>
    );
};

export default DocumentActions;
