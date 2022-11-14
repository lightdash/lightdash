import {
    Button,
    Classes,
    Dialog,
    HTMLSelect,
    Icon,
    Intent,
} from '@blueprintjs/core';
import { IItemRendererProps, ItemRenderer, Select2 } from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import { FC, SyntheticEvent, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProject } from '../../../hooks/useProject';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { Avatar } from '../../Avatar';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import BaseModal from '../modal/BaseModal';
import CreateSpaceModalContent from '../SpaceActionModal/CreateSpaceModalContent';
import { AccessModeWrapper, ShareSpaceButton } from './ShareSpaceModal.style';

import { MenuItem2 } from '@blueprintjs/popover2';
export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

export interface Access {
    title: string;
    subtitle: string;
    value: string;
}

const ACCESS_TYPES: Access[] = [
    {
        title: 'Restricted access',
        subtitle: 'Only invited members can access',
        value: 'private',
    },
    {
        title: 'Full access',
        subtitle:
            'All project members can access with their project permissions',
        value: 'public',
    },
];

const renderAccess: ItemRenderer<Access> = (
    film,
    { handleClick, handleFocus, modifiers, query },
) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem2
            multiline={true}
            active={modifiers.active}
            disabled={modifiers.disabled}
            key={film.value}
            onClick={handleClick}
            onFocus={handleFocus}
            text={
                <>
                    <p>{film.title}</p>
                    <p
                        style={{
                            color: 'gray',
                            wordBreak: 'break-word',
                            width: '150px',
                        }}
                    >
                        {' '}
                        {film.subtitle}
                    </p>
                </>
            }
        />
    );
};

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const { data: project } = useProject(projectUuid);
    const { data: projectAccess, isLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: organizationUsers, isLoading: isOrganizationUsersLoading } =
        useOrganizationUsers();
    const [selectedAccess, setSelectedAccess] = useState<Access>(
        ACCESS_TYPES[0],
    );
    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <ShareSpaceButton
                icon="people"
                text="Share"
                onClick={(e) => {
                    setIsOpen(true);
                }}
            />

            <Dialog
                title={`Share '${space.name}'`}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    <AccessModeWrapper>
                        <Icon icon="people" />
                        <p>Members of {project?.name}</p>
                        <Select2<Access>
                            filterable={false}
                            items={ACCESS_TYPES}
                            itemRenderer={renderAccess}
                            onItemSelect={(item) => setSelectedAccess(item)}
                        >
                            <Button
                                text={selectedAccess.title}
                                rightIcon="double-caret-vertical"
                            />
                        </Select2>
                        {/*<HTMLSelect value={space.isPrivate?'private': 'public'}
                            options={[
                                { value: 'private', label: 'Private' },
                                { value: 'public', label: 'Full access' },
                            ]}
                            >
                        </HTMLSelect>*/}
                    </AccessModeWrapper>

                    {organizationUsers &&
                        organizationUsers.forEach((user) => {
                            const initials = user
                                ? user.firstName.substr(0, 1) +
                                  user.lastName.substr(0, 1)
                                : '';
                            <>
                                <Avatar initials={initials} />;
                                <p>Members of {project?.name}</p>
                            </>;
                        })}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button
                            intent={Intent.SUCCESS}
                            text="Save"
                            type="submit"
                            // disabled={isLoading || isSaving}
                        />
                    </div>
                </div>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
