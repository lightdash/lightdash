import { subject } from '@casl/ability';
import { ActionIcon, Group, Paper, Title, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { TitleBreadCrumbs } from '../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { useApp } from '../../../providers/AppProvider';
import { useAppSelector } from '../store/hooks';

export const HeaderViewMode: FC = () => {
    const history = useHistory();
    const { user } = useApp();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const space = useAppSelector((state) => state.sqlRunner.space);
    const name = useAppSelector((state) => state.sqlRunner.name);
    const slug = useAppSelector((state) => state.sqlRunner.slug);

    const canManageSqlRunner = user.data?.ability?.can(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const canManageChart = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: [], // todo: update endpoint to return space "isPrivate" and "access"
        }),
    );

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="md" withBorder>
                <Group position="apart">
                    <Group spacing="two">
                        {space && (
                            <TitleBreadCrumbs
                                projectUuid={projectUuid}
                                spaceUuid={space.uuid}
                                spaceName={space.name}
                            />
                        )}
                        <Title c="dark.6" order={5} fw={600}>
                            {name}
                        </Title>
                    </Group>
                    <Group spacing="md">
                        {canManageSqlRunner && canManageChart && (
                            <Tooltip
                                variant="xs"
                                label="Edit chart"
                                position="bottom"
                            >
                                <ActionIcon size="xs">
                                    <MantineIcon
                                        icon={IconPencil}
                                        onClick={() =>
                                            history.push(
                                                `/projects/${projectUuid}/sql-runner-new/saved/${slug}/edit`,
                                            )
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>
            </Paper>
        </>
    );
};
