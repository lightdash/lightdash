import { subject } from '@casl/ability';
import {
    Button,
    Code,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { IconDatabase, IconTerminal2, IconUsers } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { usePlaygroundAvailability } from '../../../hooks/usePlaygroundAvailability';
import useApp from '../../../providers/App/useApp';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import classes from './PickerSecondaryOptions.module.css';
import {
    getPlaygroundSetupFailure,
    SAMPLE_DATA_FAILURE_MESSAGES,
} from './playgroundSetupFailure';

const CLI_COMMAND = 'lightdash deploy --create';

const OptionCard: FC<{
    icon: typeof IconDatabase;
    title: string;
    description: string;
    children: ReactNode;
}> = ({ icon, title, description, children }) => (
    <Paper radius="md" className={classes.option}>
        <Group gap="xs">
            <MantineIcon icon={icon} color="ldGray.7" />
            <Text fw={600} size="sm">
                {title}
            </Text>
        </Group>
        <Text size="sm" c="dimmed">
            {description}
        </Text>
        <Stack gap="xs" className={classes.action}>
            {children}
        </Stack>
    </Paper>
);

const SampleDataOption: FC = () => {
    const navigate = useNavigate();
    const ensurePlayground = useEnsurePlaygroundProject();
    const failure = ensurePlayground.error
        ? getPlaygroundSetupFailure(ensurePlayground.error)
        : null;

    const explore = async () => {
        const { projectUuid } = await ensurePlayground.mutateAsync({
            trigger: 'warehouse_picker',
        });
        void navigate(`/projects/${projectUuid}/home`);
    };

    return (
        <OptionCard
            icon={IconDatabase}
            title="Explore sample data"
            description="Try Lightdash on a sample dataset first. Your own data stays separate."
        >
            <Button
                variant="default"
                loading={ensurePlayground.isLoading}
                onClick={() => void explore().catch(() => undefined)}
            >
                Explore sample data
            </Button>
            {failure && (
                <Text size="sm" c="red">
                    {SAMPLE_DATA_FAILURE_MESSAGES[failure]}
                </Text>
            )}
        </OptionCard>
    );
};

export const PickerSecondaryOptions: FC = () => {
    const { pathname } = useLocation();
    const { user } = useApp();
    const { isAvailable: canAddSampleData } = usePlaygroundAvailability();
    const canInviteUsers =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;

    return (
        <Stack gap="md">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts={0.5}>
                Other ways to start
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                {canAddSampleData && <SampleDataOption />}
                {canInviteUsers && (
                    <OptionCard
                        icon={IconUsers}
                        title="Invite a teammate"
                        description="Ask someone who has the warehouse details to connect it for you."
                    >
                        <Button
                            variant="default"
                            component={Link}
                            to="/onboarding/invite-expert"
                            state={{ returnTo: pathname }}
                        >
                            Invite a teammate
                        </Button>
                    </OptionCard>
                )}
                <OptionCard
                    icon={IconTerminal2}
                    title="Already use the CLI?"
                    description="Create the project from your dbt project with one command."
                >
                    <Group gap="xs" wrap="nowrap">
                        <Code className={classes.command}>{CLI_COMMAND}</Code>
                        <CopyActionIcon
                            value={CLI_COMMAND}
                            copyLabel="Copy command"
                            variant="subtle"
                        />
                    </Group>
                </OptionCard>
            </SimpleGrid>
        </Stack>
    );
};
