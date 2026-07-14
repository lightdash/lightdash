import { Anchor, Group, Text } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOnboardingWizard } from '../context/wizardContext';

const DemoHatch: FC = () => {
    const navigate = useNavigate();
    const { demoDestination } = useOnboardingWizard();

    return (
        <Group justify="center" gap="xs">
            <MantineIcon icon={IconTelescope} color="dimmed" />
            <Text size="sm" c="dimmed">
                Not ready to connect?{' '}
                <Anchor
                    size="sm"
                    onClick={() => {
                        void navigate(demoDestination);
                    }}
                >
                    Explore the demo project
                </Anchor>
            </Text>
        </Group>
    );
};

export default DemoHatch;
