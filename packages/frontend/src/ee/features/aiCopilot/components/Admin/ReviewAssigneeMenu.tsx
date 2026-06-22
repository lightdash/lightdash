import {
    Box,
    Menu,
    ScrollArea,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { IconSearch, IconUserMinus, IconUserPlus } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjectUsersWithRoles } from '../../../../../hooks/useProjectUsersWithRolesV2';
import { useUpdateAiAgentReviewItemAssignee } from '../../hooks/useAiAgentAdmin';
import classes from './ReviewKanbanBoard.module.css';

type Props = {
    projectUuid: string | null;
    fingerprint: string;
    assignedToUserUuid: string | null;
    /** CSS module class applied to the wrapper Box (for hover visibility control) */
    className?: string;
};

export const ReviewAssigneeMenu: FC<Props> = ({
    projectUuid,
    fingerprint,
    assignedToUserUuid,
    className,
}) => {
    // Source the candidate list from the same hook the project users & groups
    // table uses, so anyone who can access the project is assignable — not just
    // users with a direct project membership (which excluded group- and
    // org-inherited access).
    const { usersWithProjectRole } = useProjectUsersWithRoles(
        projectUuid ?? '',
    );
    const updateAssignee = useUpdateAiAgentReviewItemAssignee();
    const [search, setSearch] = useState('');

    if (!projectUuid) return null;

    const allMembers = usersWithProjectRole;
    const assignable = allMembers;

    const query = search.trim().toLowerCase();
    const filtered = query
        ? assignable.filter((m) =>
              `${m.firstName} ${m.lastName} ${m.email}`
                  .toLowerCase()
                  .includes(query),
          )
        : assignable;

    // Resolve from all members so a downgraded user still shows their avatar
    const assignee =
        allMembers.find((m) => m.userUuid === assignedToUserUuid) ?? null;
    const assigneeName = assignee
        ? `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.email
        : null;

    return (
        <Box className={className}>
            <Menu
                width={210}
                position="bottom-end"
                shadow="sm"
                withinPortal
                onClose={() => setSearch('')}
            >
                <Menu.Target>
                    <UnstyledButton
                        className={classes.assigneeTrigger}
                        aria-label={
                            assigneeName
                                ? `Assigned to ${assigneeName}`
                                : 'Assign user'
                        }
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <Tooltip label={assigneeName ?? 'Assign'} withinPortal>
                            {assignee ? (
                                <LightdashUserAvatar
                                    name={assigneeName ?? undefined}
                                    size="sm"
                                    radius="xl"
                                />
                            ) : (
                                <LightdashUserAvatar
                                    size="sm"
                                    radius="xl"
                                    variant="light"
                                    color="gray"
                                >
                                    <MantineIcon
                                        icon={IconUserPlus}
                                        size={12}
                                        color="dimmed"
                                    />
                                </LightdashUserAvatar>
                            )}
                        </Tooltip>
                    </UnstyledButton>
                </Menu.Target>

                <Menu.Dropdown
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <TextInput
                        size="xs"
                        placeholder="Search people"
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        leftSection={
                            <MantineIcon icon={IconSearch} size={13} />
                        }
                        mb={4}
                    />
                    <ScrollArea.Autosize mah={200} type="scroll">
                        {filtered.length === 0 ? (
                            <Text fz="xs" c="dimmed" ta="center" py="xs">
                                No people
                            </Text>
                        ) : (
                            filtered.map((member) => {
                                const name =
                                    `${member.firstName} ${member.lastName}`.trim() ||
                                    member.email;
                                return (
                                    <Menu.Item
                                        key={member.userUuid}
                                        fz="xs"
                                        leftSection={
                                            <LightdashUserAvatar
                                                name={name}
                                                size="xs"
                                                radius="xl"
                                            />
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateAssignee.mutate({
                                                fingerprint,
                                                assignedToUserUuid:
                                                    member.userUuid,
                                            });
                                        }}
                                    >
                                        {name}
                                    </Menu.Item>
                                );
                            })
                        )}
                    </ScrollArea.Autosize>

                    {assignee && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                color="red"
                                fz="xs"
                                leftSection={
                                    <MantineIcon
                                        icon={IconUserMinus}
                                        size={14}
                                    />
                                }
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateAssignee.mutate({
                                        fingerprint,
                                        assignedToUserUuid: null,
                                    });
                                }}
                            >
                                Unassign
                            </Menu.Item>
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>
        </Box>
    );
};
