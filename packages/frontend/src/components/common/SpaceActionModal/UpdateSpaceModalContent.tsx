import { TextInput } from '@mantine/core';
import { type FC } from 'react';
import { type SpaceModalBody } from '.';

const UpdateSpaceModalContent: FC<SpaceModalBody> = ({ form }) => (
    <TextInput
        {...form.getInputProps('name')}
        label="Enter a memorable name for your space"
        placeholder="eg. KPIs"
    />
);

export default UpdateSpaceModalContent;
