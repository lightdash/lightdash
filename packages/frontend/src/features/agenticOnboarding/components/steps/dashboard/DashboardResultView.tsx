import { type DashboardBuildResult } from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine-8/core';
import { IconArrowRight, IconTelescope } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import StepPanel from '../StepPanel';

type DashboardResultViewProps = {
    result: DashboardBuildResult;
    onOpenDashboard: () => void;
    onExplore: () => void;
};

const DashboardResultView: FC<DashboardResultViewProps> = ({
    result,
    onOpenDashboard,
    onExplore,
}) => (
    <StepPanel title="Your dashboard is ready 🎉">
        <Stack gap="lg">
            <Text size="sm">
                Built on your company's data — every number traces back to a
                metric you can see and edit.
            </Text>

            {result.warnings.length > 0 && (
                <Stack gap="xs">
                    {result.warnings.map((warning) => (
                        <Callout key={warning} variant="info">
                            {warning}
                        </Callout>
                    ))}
                </Stack>
            )}

            <Group justify="flex-end">
                <Button
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconTelescope} />}
                    onClick={onExplore}
                >
                    Explore from here
                </Button>
                <Button
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                    onClick={onOpenDashboard}
                >
                    Open my dashboard
                </Button>
            </Group>
        </Stack>
    </StepPanel>
);

export default DashboardResultView;
