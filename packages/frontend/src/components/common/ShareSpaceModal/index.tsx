import { Classes, Dialog } from '@blueprintjs/core';
import { Space } from '@lightdash/common';
import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
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

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const { data: organizationUsers } = useOrganizationUsers();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();

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

            <Dialog
                style={{
                    width: 480,
                    paddingBottom: 0,
                    backgroundColor: 'white',
                }}
                title={`Share ’${space.name}’`}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                lazy
            >
                <DialogBody>
                    {selectedAccess.value === SpaceAccessType.PRIVATE ? (
                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                            organizationUsers={organizationUsers}
                        />
                    ) : null}

                    <ShareSpaceAccessType
                        projectUuid={projectUuid}
                        space={space}
                        selectedAccess={selectedAccess}
                        setSelectedAccess={setSelectedAccess}
                    />

                    {selectedAccess.value === SpaceAccessType.PRIVATE && (
                        <ShareSpaceUserList
                            projectUuid={projectUuid}
                            space={space}
                            sessionUser={sessionUser.data}
                            organizationUsers={organizationUsers}
                        />
                    )}
                </DialogBody>

                <DialogFooter>
                    {selectedAccess.value === SpaceAccessType.PRIVATE &&
                    sessionUser.data?.ability?.can('create', 'InviteLink') ? (
                        <>
                            Can’t find a user? Spaces can only be shared with{' '}
                            <Link
                                to={`/generalSettings/projectManagement/${projectUuid}/projectAccess`}
                            >
                                existing project members
                            </Link>
                            .
                        </>
                    ) : (
                        <>
                            Learn more about permissions in our{' '}
                            <a
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                            >
                                docs
                            </a>
                            .
                        </>
                    )}
                </DialogFooter>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
