import { Radio } from '@blueprintjs/core';
import { FC, useState } from 'react';
import { CreateSpaceModalBody } from '.';
import { useApp } from '../../../providers/AppProvider';
import Input from '../../ReactHookForm/Input';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import {
    FlexWrapper,
    PrimaryText,
    UserCircle,
    UserRole,
    YouLabel,
} from '../ShareSpaceModal/ShareSpaceModal.style';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from '../ShareSpaceModal/ShareSpaceSelect';
import { CreateSpaceAddUser } from './CreateSpaceAddUser';
import { CreateSpaceSelectAccessType } from './CreateSpaceSelectAccessType';
import { RadioDescription, ShareSpaceWrapper } from './SpaceActionModal.style';

const CreateSpaceModalContent: FC<CreateSpaceModalBody> = ({
    modalStep,
    form,
    setIsShared,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        SpaceAccessOptions[0],
    );

    switch (modalStep) {
        case 0:
            return (
                <>
                    <Input
                        label="Enter a memorable name for your space"
                        name="name"
                        placeholder="eg. KPIs"
                        defaultValue=""
                        rules={{ required: 'Name field is required' }}
                    />
                    <RadioGroup
                        name="private"
                        defaultValue={SpaceAccessType.PRIVATE}
                    >
                        <Radio
                            label="Private"
                            value={SpaceAccessType.PRIVATE}
                            onClick={() => setIsShared(false)}
                        />
                        <RadioDescription>
                            Only you can access this space.
                        </RadioDescription>
                        <Radio
                            label="Shared"
                            value={SpaceAccessType.PUBLIC}
                            onClick={() => setIsShared(true)}
                        />
                        <RadioDescription>
                            Choose who can access this space.
                        </RadioDescription>
                    </RadioGroup>
                </>
            );

        default:
            return (
                <ShareSpaceWrapper>
                    {selectedAccess?.value === SpaceAccessType.PRIVATE && (
                        <CreateSpaceAddUser form={form} />
                    )}

                    <CreateSpaceSelectAccessType
                        selectedAccess={selectedAccess}
                        setSelectedAccess={(access) => {
                            form?.setValue(
                                'isPrivate',
                                access.value === SpaceAccessType.PRIVATE,
                            );
                            setSelectedAccess(access);
                        }}
                    />

                    {sessionUser &&
                        selectedAccess?.value === SpaceAccessType.PRIVATE && (
                            <FlexWrapper key={sessionUser.userUuid}>
                                <UserCircle>
                                    {sessionUser.firstName.substr(0, 1) +
                                        sessionUser.lastName.substr(0, 1)}
                                </UserCircle>

                                <PrimaryText>
                                    {sessionUser.firstName +
                                        ' ' +
                                        sessionUser.lastName}
                                    <YouLabel> (you)</YouLabel>
                                </PrimaryText>
                                <UserRole>{sessionUser.role}</UserRole>
                            </FlexWrapper>
                        )}
                </ShareSpaceWrapper>
            );
    }
};

export default CreateSpaceModalContent;
