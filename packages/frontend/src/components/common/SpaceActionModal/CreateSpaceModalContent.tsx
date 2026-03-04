import { type Space } from '@lightdash/common';
import { Stack, TextInput } from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useSpace } from '../../../hooks/useSpaces';
import InheritanceToggleCards from '../ShareSpaceModal/InheritanceToggleCards';
import { type InheritanceType } from '../ShareSpaceModal/ShareSpaceModalUtils';

type CreateSpaceModalContentProps = {
    form: UseFormReturnType<Space>;
    projectUuid: string;
    parentSpaceUuid: Space['parentSpaceUuid'];
    inheritanceValue: InheritanceType;
    onInheritanceChange: (value: InheritanceType) => void;
};

const CreateSpaceModalContent: FC<CreateSpaceModalContentProps> = ({
    form,
    projectUuid,
    parentSpaceUuid,
    inheritanceValue,
    onInheritanceChange,
}) => {
    const isNestedSpace = !!parentSpaceUuid;
    const { data: parentSpace } = useSpace(
        projectUuid,
        parentSpaceUuid ?? undefined,
        { enabled: isNestedSpace },
    );

    return (
        <Stack>
            <TextInput
                {...form.getInputProps('name')}
                label="Enter a memorable name for your space"
                placeholder="eg. KPIs"
                description={
                    isNestedSpace
                        ? `This space will have the same access as "${parentSpace?.name ?? 'the parent space'}". You can change this later.`
                        : undefined
                }
            />

            {!isNestedSpace && (
                <InheritanceToggleCards
                    value={inheritanceValue}
                    onChange={onInheritanceChange}
                />
            )}
        </Stack>
    );
};

export default CreateSpaceModalContent;
