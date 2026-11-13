import { type DashboardComposerChartTileProperties } from '@lightdash/common';
import { ActionIcon, Flex, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    form: UseFormReturnType<DashboardComposerChartTileProperties['properties']>;
};

const ComposerChartTileForm: FC<Props> = ({ form }) => (
    <Flex align="flex-end" gap="xs">
        <TextInput
            label="Title"
            placeholder={form.values.chartName ?? 'Tile title'}
            flex={1}
            disabled={form.values.hideTitle}
            {...form.getInputProps('title')}
        />
        <ActionIcon
            size="lg"
            aria-label={form.values.hideTitle ? 'Show title' : 'Hide title'}
            onClick={() =>
                form.setFieldValue('hideTitle', !form.values.hideTitle)
            }
        >
            <MantineIcon icon={form.values.hideTitle ? IconEyeOff : IconEye} />
        </ActionIcon>
    </Flex>
);

export default ComposerChartTileForm;
