import {
    GIT_HOST_LABELS,
    GIT_HOST_ORDER,
    getGitHostTileLabels,
    GitHost,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Code,
    Collapse,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconBrandAzure,
    IconBrandBitbucket,
    IconBrandGithub,
    IconBrandGitlab,
    IconChevronRight,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import classes from '../../../pages/SemanticLayerStep.module.css';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';

const HOST_ICONS: Record<GitHost, Icon> = {
    [GitHost.GITHUB]: IconBrandGithub,
    [GitHost.GITLAB]: IconBrandGitlab,
    [GitHost.BITBUCKET]: IconBrandBitbucket,
    [GitHost.AZURE_DEVOPS]: IconBrandAzure,
};

const SETUP_DOCS =
    'https://docs.lightdash.com/get-started/setup-lightdash/connect-project';

export const SectionHeader: FC<{
    title: string;
    description: string;
    linkLabel: string;
}> = ({ title, description, linkLabel }) => (
    <Stack gap={2}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts={0.5}>
            {title}
        </Text>
        <Text size="sm" c="dimmed">
            {description}{' '}
            <Anchor href={SETUP_DOCS} target="_blank" rel="noreferrer" inherit>
                {linkLabel}
            </Anchor>
        </Text>
    </Stack>
);

const HostTileLimits: FC<{ host: GitHost }> = ({ host }) => {
    const labels = getGitHostTileLabels(host);
    if (labels.length === 0) {
        return (
            <Text size="xs" c="dimmed">
                Every feature is available.
            </Text>
        );
    }
    return (
        <Stack gap={2}>
            {labels.map((label) => (
                <Text key={label} size="xs" c="dimmed">
                    {label}
                </Text>
            ))}
        </Stack>
    );
};

export const GitHostTiles: FC<{ onPick: (host: GitHost) => void }> = ({
    onPick,
}) => (
    <Stack gap="md">
        <SectionHeader
            title="Connect a repository"
            description="Lightdash pulls your project and redeploys when you refresh."
            linkLabel="Read about git connections"
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {GIT_HOST_ORDER.map((host) => (
                <Paper
                    key={host}
                    component="button"
                    type="button"
                    radius="md"
                    className={classes.hostTile}
                    onClick={() => onPick(host)}
                >
                    <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs">
                            <MantineIcon icon={HOST_ICONS[host]} size="lg" />
                            <Text fw={600}>{GIT_HOST_LABELS[host]}</Text>
                        </Group>
                        <MantineIcon icon={IconChevronRight} color="dimmed" />
                    </Group>
                    <HostTileLimits host={host} />
                </Paper>
            ))}
        </SimpleGrid>
    </Stack>
);

export const CliDeployOption: FC<{
    projectUuid: string;
    isWaiting: boolean;
}> = ({ projectUuid, isWaiting }) => {
    const command = `lightdash deploy --project ${projectUuid}`;
    return (
        <Stack gap="md">
            <SectionHeader
                title="Deploy from the CLI"
                description="You or your CI push models. There is nothing to connect."
                linkLabel="Read about the CLI"
            />
            <Group gap="xs" wrap="nowrap">
                <Code className={classes.command}>{command}</Code>
                <CopyActionIcon
                    value={command}
                    copyLabel="Copy command"
                    variant="subtle"
                />
            </Group>
            {isWaiting && (
                <Text size="sm" c="dimmed">
                    This page moves on by itself when the first deploy finishes.
                </Text>
            )}
        </Stack>
    );
};

export const MoreOptions: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [opened, setOpened] = useState(false);
    return (
        <Stack gap="xs">
            <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={() => setOpened((value) => !value)}
            >
                {opened ? 'Fewer options' : 'More options'}
            </Anchor>
            <Collapse expanded={opened}>
                <Text size="sm" c="dimmed">
                    To upload a dbt manifest or connect dbt Cloud, use the
                    semantic layer connection in{' '}
                    <Anchor
                        component={Link}
                        to={`/generalSettings/projectManagement/${projectUuid}/settings`}
                        inherit
                    >
                        project settings
                    </Anchor>
                    .
                </Text>
            </Collapse>
        </Stack>
    );
};

export const SkipOption: FC<{
    onSkip: () => void;
    isSkipping: boolean;
}> = ({ onSkip, isSkipping }) => (
    <Button variant="default" flex="none" loading={isSkipping} onClick={onSkip}>
        Skip for now
    </Button>
);
