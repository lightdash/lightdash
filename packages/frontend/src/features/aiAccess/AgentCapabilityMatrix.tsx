import {
    OrganizationMemberRoleLabels,
    AgentCapability,
    type OrganizationMemberRole,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import { Center, Checkbox, Stack, Table, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
    agentCapabilityGroups,
    agentPageCapabilityLabels,
} from './agentCapabilityLabels';

const columnLabelKeys: Record<AgentCapability, string> = {
    [AgentCapability.ReadDiscover]: 'read',
    [AgentCapability.Query]: 'query',
    [AgentCapability.Export]: 'export',
    [AgentCapability.RawSql]: 'rawSql',
    [AgentCapability.ContentWrite]: 'contentWrite',
    [AgentCapability.Delete]: 'delete',
    [AgentCapability.Publish]: 'publish',
    [AgentCapability.DeployUpload]: 'deploy',
    [AgentCapability.DbtWriteback]: 'dbt',
    [AgentCapability.Administration]: 'admin',
    [AgentCapability.ExternalTools]: 'externalTools',
};

export const AgentCapabilityMatrix = ({
    matrix,
    allowedCapabilities,
    onChange,
    disabled,
}: {
    matrix: AgentSystemRoleMatrix;
    allowedCapabilities: AgentCapability[];
    onChange: (matrix: AgentSystemRoleMatrix) => void;
    disabled: boolean;
}) => {
    const { t } = useTranslation('aiAccess');
    const allowed = new Set(allowedCapabilities);
    return (
        <Stack gap="xs">
            <Table.ScrollContainer minWidth={660}>
                <Table
                    layout="fixed"
                    horizontalSpacing="xs"
                    verticalSpacing="xs"
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th rowSpan={2} w={100}>
                                {t('capabilityMatrix.role')}
                            </Table.Th>
                            {agentCapabilityGroups.map((group) => (
                                <Table.Th
                                    key={group.key}
                                    colSpan={group.capabilities.length}
                                    scope="colgroup"
                                >
                                    {t(`capabilityGroups.${group.key}`)}
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
                                            label={t(
                                                'capabilityMatrix.columnTooltip',
                                                {
                                                    label: agentPageCapabilityLabels[
                                                        capability
                                                    ].label,
                                                    description:
                                                        agentPageCapabilityLabels[
                                                            capability
                                                        ].description,
                                                },
                                            )}
                                            multiline
                                            w={240}
                                        >
                                            <Text
                                                size="xs"
                                                fw={500}
                                                tabIndex={0}
                                                aria-label={
                                                    agentPageCapabilityLabels[
                                                        capability
                                                    ].label
                                                }
                                            >
                                                {t(
                                                    `capabilityMatrix.columns.${columnLabelKeys[capability]}`,
                                                )}
                                            </Text>
                                        </Tooltip>
                                    </Table.Th>
                                ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {(Object.keys(matrix) as OrganizationMemberRole[]).map(
                            (role) => {
                                const row = new Set(matrix[role]);
                                return (
                                    <Table.Tr key={role}>
                                        <Table.Th scope="row">
                                            {OrganizationMemberRoleLabels[role]}
                                        </Table.Th>
                                        {agentCapabilityGroups
                                            .flatMap(
                                                (group) => group.capabilities,
                                            )
                                            .map((capability) => (
                                                <Table.Td key={capability}>
                                                    <Center>
                                                        <Checkbox
                                                            aria-label={t(
                                                                'capabilityMatrix.cellAriaLabel',
                                                                {
                                                                    role: OrganizationMemberRoleLabels[
                                                                        role
                                                                    ],
                                                                    capability:
                                                                        agentPageCapabilityLabels[
                                                                            capability
                                                                        ].label,
                                                                },
                                                            )}
                                                            checked={row.has(
                                                                capability,
                                                            )}
                                                            disabled={
                                                                disabled ||
                                                                !allowed.has(
                                                                    capability,
                                                                )
                                                            }
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
                                                                              (
                                                                                  value,
                                                                              ) =>
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
                                );
                            },
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
};
