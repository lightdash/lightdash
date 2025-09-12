import { subject } from '@casl/ability';
import { Group, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';

import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { EventName } from '../../../types/Events';
import MantineLinkButton from '../../common/MantineLinkButton';

interface Props {
    userName: string | undefined;
    projectUuid: string;
}

const LandingPanel: FC<Props> = ({ userName, projectUuid }) => {
    const { user } = useApp();
    return (
        <Group justify="space-between" my="xl">
            <Stack justify="flex-start" gap="xs">
                <Title order={3}>
                    {`Welcome${userName ? ', ' + userName : ' to Lightdash'}!`}{' '}
                    ⚡️
                </Title>
                <Text c="gray.7">
                    Run a query to ask a business question or browse your data
                    below:
                </Text>
            </Stack>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <MantineLinkButton
                    href={`/projects/${projectUuid}/tables`}
                    trackingEvent={{
                        name: EventName.LANDING_RUN_QUERY_CLICKED,
                        properties: {
                            organizationId: user.data?.organizationUuid || '',
                            projectId: projectUuid,
                        },
                    }}
                >
                    Run a query
                </MantineLinkButton>
            </Can>
        </Group>
    );
};

export default LandingPanel;
