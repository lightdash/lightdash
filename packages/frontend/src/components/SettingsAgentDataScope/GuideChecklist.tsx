import { type SnowflakeAiBoundarySection } from '@lightdash/common';
import { Anchor, Checkbox, List, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiQueryProcedureStep } from './AiQueryProcedureStep';
import { BoundaryTestStep } from './BoundaryTestStep';
import { GuideSection } from './GuideSection';
import { IntegrationStep } from './IntegrationStep';
import { MaskingStep } from './MaskingStep';
import { SessionCeilingStep } from './SessionCeilingStep';
import { type BoundaryGuide } from './useBoundaryGuide';

export const GuideChecklist = ({
    guide,
    opened,
    onToggle,
    onFix,
}: {
    guide: BoundaryGuide;
    opened: string[];
    onToggle: (id: string, open: boolean) => void;
    onFix: (id: string) => void;
}) => {
    const { config, inputs, setInputs, mark } = guide;
    if (!config.data) return null;
    const data = config.data;
    const openedSections = new Set(opened);
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
            id: 'oauth',
            title: 'Set up Snowflake OAuth sign-in for AI',
            summary: 'Create a second OAuth integration for agent sessions.',
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
            id: 'masking',
            title: 'Hide personal data from AI',
            summary:
                'Mask the data itself with policies that check for agent sessions.',
            manual: true,
            content: <MaskingStep guide={guide} />,
        },
        ...(guide.aiQueryProcedureEnabled
            ? [
                  {
                      id: 'query_procedure' as const,
                      title: 'AI query procedure',
                      summary:
                          'Create a procedure for AI queries and save it on the connection.',
                      manual: true,
                      content: <AiQueryProcedureStep guide={guide} />,
                  },
              ]
            : []),
        {
            id: 'session_policy',
            title: 'Limit what AI sessions can do',
            summary: 'Add a session scope after masking to limit AI sessions.',
            manual: true,
            content: <SessionCeilingStep sql={guide.ceilingSql} />,
        },
        {
            id: 'sign_in',
            title: 'Snowflake sign-in for AI',
            summary: 'Each person signs in before they can query with AI.',
            manual: false,
            content: (
                <Text size="sm">
                    {data.signedInMemberCount} of {data.memberCount} people have
                    signed in for AI.{' '}
                    <Anchor
                        component={Link}
                        to="/generalSettings/myWarehouseConnections"
                        size="sm"
                    >
                        Open your warehouse sign-ins
                    </Anchor>
                </Text>
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
                    isOpen={openedSections.has(section.id)}
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
