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
        <Stack align="center" gap="xl" pt="7xl" pb="7xl">
            <MantineIcon
                icon={IconPuzzle}
                color="ldGray.5"
                stroke={1.5}
                size={40}
            />

            <Text ta="center" fz="sm" c="ldGray.6" maw={460} lh={1.55}>
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
