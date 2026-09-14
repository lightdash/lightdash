import { type Space } from '@lightdash/common';
import { Box, Stack, TextInput } from '@mantine/core';
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
                // Walkthrough: a typed step; the card offers a name.
                data-tour-anchor="space-name"
                data-tour-input="true"
                data-tour-hint="Name your space"
                data-tour-suggest="Customer Success"
                description={
                    isNestedSpace
                        ? `This space will have the same access as "${parentSpace?.name ?? 'the parent space'}". You can change this later.`
                        : undefined
                }
            />

            {!isNestedSpace && (
                <Box
                    // Walkthrough: a look at the access choice before Create.
                    data-tour-scope="create:Space"
                    data-tour-look="1"
                    data-tour-after='[data-tour-anchor="space-name"]'
                    data-tour-label="Choose who can see it"
                    data-tour-docs="explore/spaces.mdx#creating-a-space:3"
                >
                    <InheritanceToggleCards
                        value={inheritanceValue}
                        onChange={onInheritanceChange}
                    />
                </Box>
            )}
        </Stack>
    );
};

export default CreateSpaceModalContent;
