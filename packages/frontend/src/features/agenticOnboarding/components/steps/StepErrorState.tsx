import { Button, Group, Stack } from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import StepPanel from './StepPanel';

type StepErrorStateProps = {
    title: string;
    message: string | null;
    isRetrying: boolean;
    onRetry: () => void;
};

const StepErrorState: FC<StepErrorStateProps> = ({
    title,
    message,
    isRetrying,
    onRetry,
}) => (
    <StepPanel title={title}>
        <Stack gap="md">
            <Callout variant="danger" title="Something went wrong">
                {message ?? 'We hit a problem finishing this step.'}
            </Callout>
            <Group justify="flex-end">
                <Button
                    variant="light"
                    loading={isRetrying}
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    onClick={onRetry}
                >
                    Try again
                </Button>
            </Group>
        </Stack>
    </StepPanel>
);

export default StepErrorState;
