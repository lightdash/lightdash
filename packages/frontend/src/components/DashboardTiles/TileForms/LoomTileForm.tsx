import { DashboardLoomTileProperties } from '@lightdash/common';
import { ActionIcon, Flex, Stack, TextInput } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import MantineIcon from '../../common/MantineIcon';

export const getLoomId = (value: string | undefined): string | undefined => {
    const arr = value?.match(/share\/(.*)/);
    return arr?.[1];
};

interface LoomTileFormProps {
    form: UseFormReturnType<DashboardLoomTileProperties['properties']>;
    withHideTitle: boolean;
}

const LoomTileForm = ({ form, withHideTitle }: LoomTileFormProps) => (
    <Stack spacing="md">
        <Flex
            align={form.getInputProps('title').error ? 'center' : 'flex-end'}
            gap="sm"
        >
            <TextInput
                label="Title"
                placeholder="Tile title"
                style={{ flex: 1 }}
                required
                disabled={form.values.hideTitle}
                {...form.getInputProps('title')}
            />
            {withHideTitle && (
                <ActionIcon
                    variant="outline"
                    color="gray.4"
                    h={36}
                    size="lg"
                    radius="md"
                    onClick={() => {
                        form.setFieldValue('hideTitle', !form.values.hideTitle);
                    }}
                >
                    <MantineIcon
                        icon={form.values.hideTitle ? IconEyeOff : IconEye}
                        size={25}
                        color="dark.2"
                    />
                </ActionIcon>
            )}
        </Flex>

        <TextInput
            name="url"
            label="Loom url"
            placeholder="e.g https://www.loom.com/share/1234567890"
            required
            {...form.getInputProps('url')}
        />
    </Stack>
);

export default LoomTileForm;
