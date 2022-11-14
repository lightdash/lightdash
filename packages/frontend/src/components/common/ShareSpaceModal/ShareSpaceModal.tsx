import {
    Button,
    Classes,
    Dialog,
    HTMLSelect,
    Icon,
    Intent,
    Spinner,
} from '@blueprintjs/core';
import {
    IItemRendererProps,
    ItemRenderer,
    MultiSelect2,
    Select2,
    Suggest2,
} from '@blueprintjs/select';
import { Space } from '@lightdash/common';
import { FC, SyntheticEvent, useCallback, useState } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProject } from '../../../hooks/useProject';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { Avatar } from '../../Avatar';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import BaseModal from '../modal/BaseModal';
import CreateSpaceModalContent from '../SpaceActionModal/CreateSpaceModalContent';
import {
    FlexWrapper,
    Hightlighed,
    OpenShareModal,
    ShareButton,
    ShareTag,
} from './ShareSpaceModal.style';

import { MenuItem2 } from '@blueprintjs/popover2';
import { useApp } from '../../../providers/AppProvider';
import HighlightedText from '../HighlightedText';
import { Flex } from '../ResourceList/ResourceTable/ResourceTable.styles';
export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

export interface Access {
    title: string;
    subtitle: string;
    value: string;
}
const StyledSpinner = () => <Spinner size={16} style={{ margin: 12 }} />;

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
    const { user } = useApp();
    const orgUserEmails =
        organizationUsers && organizationUsers.map((orgUser) => orgUser.email);

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [emailsSelected, setEmailsSelected] = useState<string[]>([]);

    const renderUserShare: ItemRenderer<string> = useCallback(
        (name, { modifiers, handleClick, query }) => {
            if (!modifiers.matchesPredicate) {
                return null;
            }
            return (
                <MenuItem2
                    active={modifiers.active}
                    icon={emailsSelected.includes(name) ? 'tick' : 'blank'}
                    key={name}
                    disabled={emailsSelected.includes(name)}
                    text={
                        <HighlightedText
                            text={name}
                            query={query}
                            highlightElement={Hightlighed}
                        />
                    }
                    onClick={handleClick}
                    shouldDismissPopover={false}
                />
            );
        },
        [emailsSelected],
    );
    const handleRemove = useCallback(
        (selectedValue: React.ReactNode) => {
            setEmailsSelected(
                emailsSelected.filter((email) => email !== selectedValue),
            );
        },
        [emailsSelected],
    );
    return (
        <>
            <OpenShareModal
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
                    {selectedAccess.value === 'private' ? (
                        <FlexWrapper>
                            <MultiSelect2
                                fill
                                itemRenderer={renderUserShare}
                                items={orgUserEmails || []}
                                noResults={
                                    isOrganizationUsersLoading ? (
                                        <StyledSpinner />
                                    ) : (
                                        <MenuItem2
                                            disabled
                                            text="No suggestions."
                                        />
                                    )
                                }
                                onItemSelect={(select: string) => {
                                    setEmailsSelected([
                                        ...emailsSelected,
                                        select,
                                    ]);
                                    // setAddNewMember(false);
                                }}
                                tagRenderer={(name) => name}
                                tagInputProps={{
                                    placeholder: undefined,
                                    addOnBlur: false,
                                    tagProps: {
                                        minimal: true,
                                    },
                                    onRemove: handleRemove,
                                }}
                                selectedItems={emailsSelected}
                            />
                            <ShareButton
                                text="Share"
                                intent="primary"
                                onClick={() => {
                                    setEmailsSelected([]);
                                }}
                            />
                        </FlexWrapper>
                    ) : null}
                    <FlexWrapper>
                        <ShareTag round large icon="people" />
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
                    </FlexWrapper>

                    {space.access &&
                        space.access.map((sharedUser) => {
                            const initials =
                                sharedUser.firstName.substr(0, 1) +
                                sharedUser.lastName.substr(0, 1);

                            const isYou =
                                user.data?.userUuid === sharedUser.userUuid;
                            return (
                                <FlexWrapper key={sharedUser.userUuid}>
                                    <Avatar initials={initials} />
                                    <p>
                                        {sharedUser.firstName}{' '}
                                        {sharedUser.lastName}
                                    </p>
                                    {isYou ? <b>(You)</b> : ''}
                                </FlexWrapper>
                            );
                        })}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <p>Learn more about permissions in our docs</p>
                </div>
            </Dialog>
        </>
    );
};

export default ShareSpaceModal;
