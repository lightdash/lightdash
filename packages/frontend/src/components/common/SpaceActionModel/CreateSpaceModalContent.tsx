import { FC } from 'react';
import { SpaceModalBody } from '.';
import Input from '../../ReactHookForm/Input';

const CreateSpaceModalContent: FC<SpaceModalBody> = () => {
    return (
        <Input
            label="Enter a memorable name for your space"
            name="name"
            placeholder="eg. KPIs"
            defaultValue=""
            rules={{ required: 'Name field is required' }}
        />
    );
};

export default CreateSpaceModalContent;
