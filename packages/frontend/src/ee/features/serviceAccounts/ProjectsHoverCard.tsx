import { ProjectMemberRoleLabels } from '@lightdash/common';
import { HoverCard, Loader, Stack, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import { useServiceAccountProjectGrants } from './useProjectAccess';

type Props = {
    serviceAccountUuid: string;
    children: ReactNode;
};

/**
 * Lightweight hover preview of a service account's project grants.
 *
 * The query inside `HoverCard.Dropdown` only mounts when the dropdown is
 * shown, so we don't fetch grants for every SA on the page — only the one
 * the operator is hovering over. The Edit modal handles the same data
 * eagerly when opened, so the two paths stay independent.
 */
export const ProjectsHoverCard: FC<Props> = ({
    serviceAccountUuid,
    children,
}) => (
    <HoverCard
        position="bottom-start"
        withArrow
        shadow="md"
        withinPortal
        openDelay={150}
    >
        <HoverCard.Target>{children}</HoverCard.Target>
        <HoverCard.Dropdown w={280}>
            <Stack gap={6}>
                <Text size="xs" fw={600} c="dimmed">
                    Project access
                </Text>
                <ProjectsHoverList serviceAccountUuid={serviceAccountUuid} />
            </Stack>
        </HoverCard.Dropdown>
    </HoverCard>
);

const ProjectsHoverList: FC<{ serviceAccountUuid: string }> = ({
    serviceAccountUuid,
}) => {
    const { data, isLoading } =
        useServiceAccountProjectGrants(serviceAccountUuid);

    if (isLoading) {
        return <Loader size="xs" />;
    }
    if (!data || data.length === 0) {
        return (
            <Text size="xs" c="dimmed">
                No projects.
            </Text>
        );
    }
    return (
        <Stack gap={2}>
            {data.map((g) => {
                // Custom-role grants carry `roleName` from the backend join;
                // system-role grants carry the `ProjectMemberRole` enum and
                // we look up the human label client-side. Mutually exclusive
                // — see ServiceAccountProjectGrant in @lightdash/common.
                const label = g.roleUuid
                    ? g.roleName
                    : g.role && ProjectMemberRoleLabels[g.role];
                return (
                    <Text size="sm" key={g.projectUuid}>
                        {g.projectName}{' '}
                        <Text span c="dimmed" size="xs">
                            — {label}
                        </Text>
                    </Text>
                );
            })}
        </Stack>
    );
};
