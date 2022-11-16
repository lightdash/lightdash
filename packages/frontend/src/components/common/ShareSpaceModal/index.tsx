import { Classes, Dialog, Spinner } from '@blueprintjs/core';
import {
    ItemPredicate,
    ItemRenderer,
    MultiSelect2,
    Select2,
} from '@blueprintjs/select';
import { OrganizationMemberProfile, Space } from '@lightdash/common';
import { FC, useCallback, useMemo, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProject } from '../../../hooks/useProject';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import {
    AccessDescription,
    AccessName,
    AccessRole,
    AccessSelectSubtitle,
    AccessSelectTitle,
    AccessWrapper,
    AddUsersWrapper,
    ChangeAccessButton,
    DialogFooter,
    FlexWrapper,
    MemberAccess,
    OpenShareModal,
    ShareButton,
    ShareTag,
    UserName,
    UserRole,
    UserTag,
    YouLabel,
} from './ShareSpaceModal.style';

import { MenuItem2 } from '@blueprintjs/popover2';
import {
    useAddSpaceShareMutation,
    useDeleteSpaceShareMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import {
    AccessOption,
    renderAccess,
    SpaceAccessOptions,
    SpaceAccessType,
} from './ShareSpaceSelect';
import { ShareSpaceUserList } from './ShareSpaceUserList';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const { data: projectAccess } = useProjectAccess(projectUuid);
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
                style={{ width: 480, paddingBottom: 0 }}
                title={`Share '${space.name}'`}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    {selectedAccess.value === SpaceAccessType.PRIVATE ? (
                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                            projectAccess={projectAccess}
                            organizationUsers={organizationUsers}
                        />
                    ) : null}
                    <ShareSpaceAccessType
                        projectUuid={projectUuid}
                        space={space}
                        selectedAccess={selectedAccess}
                        setSelectedAccess={setSelectedAccess}
                    />
                    <ShareSpaceUserList
                        projectUuid={projectUuid}
                        space={space}
                        sessionUser={sessionUser.data}
                        organizationUsers={organizationUsers}
                    />
                </div>
                <DialogFooter>
                    <p>
                        {' '}
                        Learn more about permissions in our{' '}
                        <a
                            href="https://docs.lightdash.com/references/roles"
                            target="_blank"
                            rel="noreferrer"
                        >
                            docs
                        </a>
                    </p>
                </DialogFooter>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
