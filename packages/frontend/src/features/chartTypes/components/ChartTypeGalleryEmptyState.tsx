import { Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import NewChartTypeButton from './NewChartTypeButton';

type Props = {
    projectUuid: string;
};

const ChartTypeGalleryEmptyState: FC<Props> = ({ projectUuid }) => (
    <Stack align="center" gap="sm" py="7xl">
        <MantineIcon
            icon={IconPuzzle}
            color="ldGray.5"
            stroke={1.5}
            size="lg"
        />

        <Text size="md" fw={600} c="ldGray.8">
            No chart types yet
        </Text>

        <Text ta="center" fz="xs" c="dimmed" maw={400} lh={1.5}>
            Chart types are custom visualizations you build once and reuse
            across your project.
        </Text>

        <NewChartTypeButton
            projectUuid={projectUuid}
            owner="project"
            size="sm"
            mt="xs"
        />
    </Stack>
);

export default ChartTypeGalleryEmptyState;
