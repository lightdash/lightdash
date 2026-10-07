import {
    AiAgentMarkerLevel,
    AiCredentialMethod,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { Badge, List, Radio, SimpleGrid, Stack, Text } from '@mantine/core';
import classes from './AiAccessPage.module.css';

const markerLabels: Record<AiAgentMarkerLevel, string> = {
    [AiAgentMarkerLevel.VERIFIED_SESSION]: 'Verified session',
    [AiAgentMarkerLevel.ADVISORY_SESSION]: 'Advisory session',
    [AiAgentMarkerLevel.IDENTIFY_ONLY]: 'Identify only',
    [AiAgentMarkerLevel.NONE]: 'Not available',
};

export const AiIdentityModeCards = ({
    capabilities,
    separate,
    onChange,
    disabled,
}: {
    capabilities: AiWarehouseCapabilities;
    separate: boolean;
    onChange: (separate: boolean) => void;
    disabled: boolean;
}) => {
    const person = capabilities.principals.person;
    const needsSignIn =
        person.available && person.method === AiCredentialMethod.SIGN_IN;
    return (
        <Radio.Group
            label="Identity mode"
            value={separate ? 'principal' : 'marked_person'}
            onChange={(value) => onChange(value === 'principal')}
        >
            <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                <Stack
                    className={classes.mode}
                    data-unavailable={!person.available}
                    gap="xs"
                >
                    <Radio
                        value="marked_person"
                        label="Marked person"
                        disabled={disabled || !person.available}
                    />
                    <Text size="sm">
                        The person's own credentials, marked as an agent.
                    </Text>
                    <Badge>{markerLabels[capabilities.marker.level]}</Badge>
                    <List size="sm">
                        {capabilities.marker.channels.map((channel) => (
                            <List.Item key={channel}>{channel}</List.Item>
                        ))}
                    </List>
                    <Text size="sm">
                        Admin: use the marker signals in warehouse policies.
                    </Text>
                    <Text size="sm">
                        {needsSignIn
                            ? 'Person: complete the AI sign-in to use a verified agentic session.'
                            : 'Person: nothing to do.'}
                    </Text>
                    {!person.available && (
                        <Text size="sm" c="dimmed">
                            {person.reason}
                        </Text>
                    )}
                </Stack>
                <Stack className={classes.mode} gap="xs">
                    <Radio
                        value="principal"
                        label="Separate principal"
                        disabled={disabled}
                    />
                    <Text size="sm">
                        A separate warehouse principal for a person, group or
                        everyone.
                    </Text>
                    <Text size="sm">
                        Admin: create the principal and grant its access in the
                        warehouse.
                    </Text>
                    <Text size="sm">
                        Person: use the principal assigned to them.
                    </Text>
                </Stack>
            </SimpleGrid>
        </Radio.Group>
    );
};
