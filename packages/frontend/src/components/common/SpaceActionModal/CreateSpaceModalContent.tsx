import { Radio } from '@blueprintjs/core';
import { FC } from 'react';
import { SpaceModalBody } from '.';
import Input from '../../ReactHookForm/Input';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import { SpaceAccessType } from '../ShareSpaceModal/ShareSpaceSelect';
import { RadioDescription } from './SpaceActionModal.style';

const CreateSpaceModalContent: FC<SpaceModalBody> = () => {
    return (
        <>
            <Input
                label="Enter a memorable name for your space"
                name="name"
                placeholder="eg. KPIs"
                defaultValue=""
                rules={{ required: 'Name field is required' }}
            />
            <RadioGroup name="private" defaultValue={SpaceAccessType.PRIVATE}>
                <Radio label="Private" value={SpaceAccessType.PRIVATE} />
                <RadioDescription>
                    Only you can access this space.
                </RadioDescription>
                <Radio label="Shared" value={SpaceAccessType.PUBLIC} />
                <RadioDescription>
                    Choose who can access this space.
                </RadioDescription>
            </RadioGroup>
        </>
    );
};

export default CreateSpaceModalContent;
