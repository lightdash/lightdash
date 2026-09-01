import {
    getContentReviewRequestsPath,
    type ContentReviewSettings,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import { SettingsGridCard } from '../../../../components/common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import {
    useContentReviewSettings,
    useUpdateContentReviewSettings,
} from '../hooks/useContentReviewRequests';

const SPACE_EDITORS = '__space_editors__';

const SettingsForm: FC<{
    projectUuid: string;
    settings: ContentReviewSettings;
}> = ({ projectUuid, settings }) => {
    const { data: groups = [], isInitialLoading: isLoadingGroups } =
        useOrganizationGroups({});
    const { data: slack } = useGetSlack();
    const isSlackConnected = !!slack?.organizationUuid;
    const { mutate: updateSettings, isLoading: isSaving } =
        useUpdateContentReviewSettings(projectUuid);

    const form = useForm({
        initialValues: {
            reviewerGroupUuid: settings.reviewerGroupUuid ?? SPACE_EDITORS,
            verifyOnApproveDefault: settings.verifyOnApproveDefault,
            slackChannelId: settings.slackChannelId,
        },
    });

    const groupOptions = useMemo(
        () => [
            { value: SPACE_EDITORS, label: 'Editors of the target space' },
            ...groups.map((group) => ({
                value: group.uuid,
                label: group.name,
            })),
        ],
        [groups],
    );

    return (
        <form
            onSubmit={form.onSubmit((values) => {
                updateSettings({
                    reviewerGroupUuid:
                        values.reviewerGroupUuid === SPACE_EDITORS
                            ? null
                            : values.reviewerGroupUuid,
                    verifyOnApproveDefault: values.verifyOnApproveDefault,
                    slackChannelId: values.slackChannelId,
                });
            })}
        >
            <Stack gap="md">
                <Select
                    label="Who reviews requests"
                    description="Requests go to these people. They must also be able to edit the target space."
                    data={groupOptions}
                    rightSection={isLoadingGroups ? <Loader size="xs" /> : null}
                    allowDeselect={false}
                    {...form.getInputProps('reviewerGroupUuid')}
                />
                <Switch
                    label="Verify content when approving"
                    description="Reviewers can still untick it per request"
                    {...form.getInputProps('verifyOnApproveDefault', {
                        type: 'checkbox',
                    })}
                />
                {isSlackConnected ? (
                    <SlackChannelSelect
                        label="Slack channel for new requests"
                        placeholder="Organization notification channel"
                        value={form.values.slackChannelId}
                        onChange={(value) =>
                            form.setFieldValue('slackChannelId', value)
                        }
                    />
                ) : (
                    <Text fz="xs" c="ldGray.6">
                        Connect Slack in organization settings to post new
                        requests to a channel.
                    </Text>
                )}
                <Group justify="space-between">
                    <Anchor
                        component={Link}
                        to={getContentReviewRequestsPath(projectUuid)}
                        fz="sm"
                    >
                        Open the review queue
                    </Anchor>
                    <Button
                        type="submit"
                        loading={isSaving}
                        disabled={!form.isDirty()}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const ContentReviewSettingsPanel: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: settings, isInitialLoading } = useContentReviewSettings(
        projectUuid,
        true,
    );
    return (
        <SettingsGridCard>
            <Stack gap="xs">
                <Text fw={600}>Review requests</Text>
                <Text c="ldGray.6" fz="xs">
                    People submit charts and dashboards from their personal
                    space. Approving moves the content to the shared space they
                    picked.
                </Text>
            </Stack>
            {isInitialLoading || !settings ? (
                <Loader size="sm" />
            ) : (
                <SettingsForm
                    key={projectUuid}
                    projectUuid={projectUuid}
                    settings={settings}
                />
            )}
        </SettingsGridCard>
    );
};

export default ContentReviewSettingsPanel;
