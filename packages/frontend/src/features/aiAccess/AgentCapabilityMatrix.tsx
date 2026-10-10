import {
    OrganizationMemberRoleLabels,
    AgentCapability,
    type OrganizationMemberRole,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import { Center, Checkbox, Stack, Table, Text, Tooltip } from '@mantine/core';
import {
    agentCapabilityGroups,
    agentCapabilityLabels,
} from './agentCapabilityLabels';

const columnLabels: Record<AgentCapability, string> = {
    [AgentCapability.ReadDiscover]: 'Read',
    [AgentCapability.Query]: 'Query',
    [AgentCapability.Export]: 'Export',
    [AgentCapability.RawSql]: 'Raw SQL',
    [AgentCapability.ContentWrite]: 'Create / edit',
    [AgentCapability.Delete]: 'Delete',
    [AgentCapability.Publish]: 'Publish',
    [AgentCapability.DeployUpload]: 'Deploy',
    [AgentCapability.DbtWriteback]: 'dbt',
    [AgentCapability.Administration]: 'Admin',
    [AgentCapability.ExternalTools]: 'External tools',
};

export const AgentCapabilityMatrix = ({
    matrix,
    onChange,
    disabled,
}: {
    matrix: AgentSystemRoleMatrix;
    onChange: (matrix: AgentSystemRoleMatrix) => void;
    disabled: boolean;
}) => (
    <Stack gap="xs">
        <Table.ScrollContainer minWidth={660}>
            <Table layout="fixed" horizontalSpacing="xs" verticalSpacing="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th rowSpan={2} w={100}>
                            Role
                        </Table.Th>
                        {agentCapabilityGroups.map((group) => (
                            <Table.Th
                                key={group.label}
                                colSpan={group.capabilities.length}
                                scope="colgroup"
                            >
                                {group.label}
                            </Table.Th>
                        ))}
                    </Table.Tr>
                    <Table.Tr>
                        {agentCapabilityGroups
                            .flatMap((group) => group.capabilities)
                            .map((capability) => (
                                <Table.Th
                                    key={capability}
                                    scope="col"
                                    ta="center"
                                >
                                    <Tooltip
                                        events={{
                                            hover: true,
                                            focus: true,
                                            touch: false,
                                        }}
                                        label={`${agentCapabilityLabels[capability].label}: ${agentCapabilityLabels[capability].description}`}
                                        multiline
                                        w={240}
                                    >
                                        <Text
                                            size="xs"
                                            fw={500}
                                            tabIndex={0}
                                            aria-label={
                                                agentCapabilityLabels[
                                                    capability
                                                ].label
                                            }
                                        >
                                            {columnLabels[capability]}
                                        </Text>
                                    </Tooltip>
                                </Table.Th>
                            ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {(Object.keys(matrix) as OrganizationMemberRole[]).map(
                        (role) => (
                            <Table.Tr key={role}>
                                <Table.Th scope="row">
                                    {OrganizationMemberRoleLabels[role]}
                                </Table.Th>
                                {agentCapabilityGroups
                                    .flatMap((group) => group.capabilities)
                                    .map((capability) => (
                                        <Table.Td key={capability}>
                                            <Center>
                                                <Checkbox
                                                    aria-label={`${OrganizationMemberRoleLabels[role]}: ${agentCapabilityLabels[capability].label}`}
                                                    checked={matrix[
                                                        role
                                                    ].includes(capability)}
                                                    disabled={disabled}
                                                    onChange={(event) =>
                                                        onChange({
                                                            ...matrix,
                                                            [role]: event
                                                                .currentTarget
                                                                .checked
                                                                ? [
                                                                      ...matrix[
                                                                          role
                                                                      ],
                                                                      capability,
                                                                  ]
                                                                : matrix[
                                                                      role
                                                                  ].filter(
                                                                      (value) =>
                                                                          value !==
                                                                          capability,
                                                                  ),
                                                        })
                                                    }
                                                />
                                            </Center>
                                        </Table.Td>
                                    ))}
                            </Table.Tr>
                        ),
                    )}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
        <Text size="sm" c="dimmed">
            Raw SQL also needs the project warehouse confirmation.
        </Text>
    </Stack>
);
