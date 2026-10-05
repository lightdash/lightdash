import { type SnowflakeAiBoundarySection } from '@lightdash/common';
import { Anchor, Checkbox, List, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { BoundaryTestStep } from './BoundaryTestStep';
import { GuideSection } from './GuideSection';
import { IntegrationStep } from './IntegrationStep';
import { MaskingStep } from './MaskingStep';
import { SessionCeilingStep } from './SessionCeilingStep';
import { type BoundaryGuide } from './useBoundaryGuide';

export const GuideChecklist = ({
    guide,
    projectUuid,
    opened,
    onToggle,
    onFix,
}: {
    guide: BoundaryGuide;
    projectUuid: string;
    opened: string[];
    onToggle: (id: string, open: boolean) => void;
    onFix: (id: string) => void;
}) => {
    const { config, inputs, setInputs, mark } = guide;
    if (!config.data) return null;
    const data = config.data;
    const sections: {
        id: SnowflakeAiBoundarySection;
        title: string;
        summary: string;
        content: ReactNode;
        manual: boolean;
    }[] = [
        {
            id: 'prerequisites',
            title: 'Prerequisites',
            summary: 'Check your Snowflake edition and admin permissions.',
            manual: true,
            content: (
                <List type="ordered" size="sm" spacing="xs">
                    <List.Item>
                        Confirm Snowflake Enterprise edition supports your
                        masking policies.
                    </List.Item>
                    <List.Item>
                        Use a Snowflake role that can create tags, masking
                        policies and session policies.
                    </List.Item>
                    <List.Item>
                        Review generated SQL before running it in Snowflake.
                    </List.Item>
                </List>
            ),
        },
        {
            id: 'masking',
            title: 'Hide personal data from AI',
            summary: 'Choose the schemas to protect with masking policies.',
            manual: true,
            content: <MaskingStep guide={guide} />,
        },
        {
            id: 'session_policy',
            title: 'Limit what AI sessions can do',
            summary: 'Use a read-only scope and block role switching.',
            manual: true,
            content: (
                <SessionCeilingStep
                    sql={guide.ceilingSql}
                    aiIdentitiesEnabled={data.aiIdentitiesEnabled}
                />
            ),
        },
        {
            id: 'identities',
            title: data.aiIdentitiesEnabled
                ? 'AI identities'
                : 'Snowflake sign-in for AI',
            summary: data.aiIdentitiesEnabled
                ? 'Manage each person’s AI identity in Organization settings.'
                : 'Each person signs in before they can query with AI.',
            manual: false,
            content: (
                <Text size="sm">
                    {data.aiIdentitiesEnabled
                        ? data.readyIdentityCount
                        : data.signedInMemberCount}{' '}
                    of {data.memberCount} people{' '}
                    {data.aiIdentitiesEnabled
                        ? 'have a ready AI identity'
                        : 'have signed in for AI'}
                    .{' '}
                    <Anchor
                        component={Link}
                        to={
                            data.aiIdentitiesEnabled
                                ? `/generalSettings/aiIdentities?project=${projectUuid}&account=${data.aiIdentityAccountUuid ?? ''}`
                                : '/generalSettings/myWarehouseConnections'
                        }
                        size="sm"
                    >
                        {data.aiIdentitiesEnabled
                            ? 'Review AI identities'
                            : 'Open your warehouse sign-ins'}
                    </Anchor>
                </Text>
            ),
        },
        {
            id: 'oauth',
            title: 'Optional: Snowflake OAuth sign-in for AI',
            summary: 'Configure OAuth if you use the legacy sign-in path.',
            manual: false,
            content: (
                <IntegrationStep
                    integrationName={inputs.integrationName}
                    setIntegrationName={(integrationName) =>
                        setInputs((value) => ({ ...value, integrationName }))
                    }
                    roles={inputs.roles}
                    setRoles={(roles) =>
                        setInputs((value) => ({ ...value, roles }))
                    }
                    sql={guide.integrationSql}
                    cloud={data.cloud}
                    account={data.snowflakeAccount}
                    envBlock={guide.envBlock}
                    enabled={data.aiSignInEnabled}
                />
            ),
        },
        {
            id: 'checks',
            title: 'Run checks',
            summary:
                'Verify the current session, masking and earlier-results boundary.',
            manual: false,
            content: <BoundaryTestStep guide={guide} onFix={onFix} />,
        },
    ];
    return (
        <Stack gap="md">
            {sections.map((section) => (
                <GuideSection
                    key={section.id}
                    id={section.id}
                    title={section.title}
                    summary={section.summary}
                    status={data.statuses[section.id]}
                    mark={data.state.marks[section.id]}
                    isOpen={opened.includes(section.id)}
                    onToggle={(open) => onToggle(section.id, open)}
                >
                    {section.content}
                    {section.manual && (
                        <Checkbox
                            label="Mark as done"
                            description="Records your confirmation. Run checks to verify it."
                            checked={!!data.state.marks[section.id]}
                            disabled={
                                mark.isLoading ||
                                data.statuses[section.id] === 'verified'
                            }
                            onChange={(event) =>
                                mark.mutate({
                                    section: section.id,
                                    markedDone: event.currentTarget.checked,
                                })
                            }
                        />
                    )}
                </GuideSection>
            ))}
        </Stack>
    );
};
