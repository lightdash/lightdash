import { TextInput } from '@mantine/core';
import { FC } from 'react';
import { SpaceModalBody } from '.';

const UpdateSpaceModalContent: FC<SpaceModalBody> = ({ form }) => (
    <TextInput
        {...form.getInputProps('name')}
        label="Enter a memorable name for your space"
        placeholder="eg. KPIs"
        required
    />
);

export default UpdateSpaceModalContent;
