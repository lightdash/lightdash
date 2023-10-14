import { Dialog } from '@blueprintjs/core';
import { Space } from '@lightdash/common';
import { Anchor, Button } from '@mantine/core';
import { IconLock, IconUsers } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import { DialogBody, DialogFooter } from './ShareSpaceModal.style';
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
    let spaceAccess;
    if (space.isPrivate) {
        spaceAccess = space.access?.length === 0 ? SpaceAccessOptions[0] : SpaceAccessOptions[1];
    }
    else {
        spaceAccess = SpaceAccessOptions[2];
    }
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(spaceAccess);
    const { user: sessionUser } = useApp();

    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <Button
                leftIcon={
                    selectedAccess.value !== SpaceAccessType.PUBLIC ? (
                        <IconLock size={18} />
                    ) : (
                        <IconUsers size={18} />
                    )
                }
                onClick={() => {
                    setIsOpen(true);
                }}
                variant="default"
            >
                Share
            </Button>

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
                    {selectedAccess.value === SpaceAccessType.SHARED ? (
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

                    {selectedAccess.value === SpaceAccessType.SHARED && (
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
                            <Anchor
                                component={Link}
                                to={`/generalSettings/projectManagement/${projectUuid}/projectAccess`}
                            >
                                existing project members
                            </Anchor>
                            .
                        </>
                    ) : (
                        <>
                            Learn more about permissions in our{' '}
                            <Anchor
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                            >
                                docs
                            </Anchor>
                            .
                        </>
                    )}
                </DialogFooter>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
