import { Classes, Dialog } from '@blueprintjs/core';
import { Space } from '@lightdash/common';
import { FC, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import ShareSpaceModal from './ShareSpaceDialog';
import {
    DialogBody,
    DialogFooter,
    OpenShareModal,
} from './ShareSpaceModal.style';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from './ShareSpaceSelect';
import { ShareSpaceUserList } from './ShareSpaceUserList';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

const ShareSpaceModalWithButton: FC<ShareSpaceProps> = ({
    space,
    projectUuid,
}) => {
    const selectedAccess = useMemo(() => {
        return space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1];
    }, [space]);

    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <OpenShareModal
                icon={
                    selectedAccess.value === SpaceAccessType.PRIVATE
                        ? 'lock'
                        : 'people'
                }
                text="Share"
                onClick={(e) => {
                    setIsOpen(true);
                }}
            />
            <ShareSpaceModal
                spaceUuid={space.uuid}
                projectUuid={projectUuid}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
            />
        </>
    );
};

export default ShareSpaceModalWithButton;
