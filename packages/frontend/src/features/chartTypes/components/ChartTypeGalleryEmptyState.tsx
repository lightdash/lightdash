import { subject } from '@casl/ability';
import { Button, Stack, Text } from '@mantine/core';
import { IconPlus, IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';

type Props = {
    projectUuid: string;
};

const ChartTypeGalleryEmptyState: FC<Props> = ({ projectUuid }) => {
    const { user } = useApp();

    return (
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

            <Can
                I="create"
                this={subject('DataApp', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Button
                    mt="xs"
                    component={Link}
                    to={`/projects/${projectUuid}/chart-types/new`}
                    leftSection={<MantineIcon icon={IconPlus} size={18} />}
                >
                    New chart type
                </Button>
            </Can>
        </Stack>
    );
};

export default ChartTypeGalleryEmptyState;
