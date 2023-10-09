import { FC } from 'react';
import { SpaceModalBody } from '.';
import Input from '../../ReactHookForm/Input';

const UpdateSpaceModalContent: FC<SpaceModalBody> = ({ data }) => (
    <Input
        label="Enter a memorable name for your space"
        name="name"
        placeholder="eg. KPIs"
        defaultValue={data?.name || ''}
        rules={{ required: 'Name field is required' }}
    />
);

export default UpdateSpaceModalContent;
