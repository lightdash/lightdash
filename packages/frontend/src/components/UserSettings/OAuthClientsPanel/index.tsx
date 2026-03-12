import { Button, Group, Stack, Title } from '@mantine-8/core';
import { IconPlug } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useOAuthClients } from '../../../hooks/useOAuthClients';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { CreateOAuthClientModal } from './CreateOAuthClientModal';
import { OAuthClientsTable } from './OAuthClientsTable';

const OAuthClientsPanel: FC = () => {
    const { data } = useOAuthClients();
    const [isCreating, setIsCreating] = useState(false);
    const hasClients = data && data.length > 0;

    return (
        <Stack mb="lg">
            {hasClients ? (
                <>
                    <Group justify="space-between">
                        <Title order={5}>OAuth applications</Title>
                        <Button onClick={() => setIsCreating(true)}>
                            Register new application
                        </Button>
                    </Group>
                    <OAuthClientsTable clients={data} />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconPlug}
                            color="ldGray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No OAuth applications"
                    description="Register an OAuth application to let external apps authenticate users via Lightdash."
                >
                    <Button onClick={() => setIsCreating(true)}>
                        Register new application
                    </Button>
                </EmptyState>
            )}

            {isCreating && (
                <CreateOAuthClientModal onClose={() => setIsCreating(false)} />
            )}
        </Stack>
    );
};

export default OAuthClientsPanel;
