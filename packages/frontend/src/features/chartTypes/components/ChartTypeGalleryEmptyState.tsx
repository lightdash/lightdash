import { subject } from '@casl/ability';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconBooks, IconPlus, IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { useChartStudioAvailable } from '../hooks/useChartStudioAvailable';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';

type Props = {
    projectUuid: string;
    /** Opens the library tab; null when the library is off. */
    onBrowseLibrary: (() => void) | null;
};

const ChartTypeGalleryEmptyState: FC<Props> = ({
    projectUuid,
    onBrowseLibrary,
}) => {
    const { user } = useApp();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    // Building a new chart type is authoring, so the CTA needs Chart Studio.
    const chartStudioAvailable = useChartStudioAvailable();

    return (
        <Stack align="center" gap="sm" py="7xl">
            <MantineIcon
                icon={IconPuzzle}
                color="ldGray.5"
                stroke={1.5}
                size="lg"
            />

            <Text size="md" fw={600}>
                No chart types yet
            </Text>

            <Text ta="center" fz="sm" c="dimmed" maw={420} lh={1.5}>
                Chart types are new ways to draw your data, like a heatmap or a
                radar. Add one here and anyone in the project can pick it in the
                explorer.
            </Text>

            <Group gap="xs" mt="xs">
                {onBrowseLibrary && (
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconBooks} size={16} />}
                        onClick={onBrowseLibrary}
                    >
                        Browse the library
                    </Button>
                )}
                {chartStudioAvailable && (
                    <Can
                        I="create"
                        this={subject('DataApp', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            component={Link}
                            to={chartTypeBuilderPath(projectUrlIdentifier)}
                            leftSection={
                                <MantineIcon icon={IconPlus} size={16} />
                            }
                        >
                            New chart type
                        </Button>
                    </Can>
                )}
            </Group>
        </Stack>
    );
};

export default ChartTypeGalleryEmptyState;
