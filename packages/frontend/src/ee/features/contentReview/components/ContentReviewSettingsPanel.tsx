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
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
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
    const { t } = useTranslation('eeMisc');
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
            {
                group: t('contentReview.settings.defaultGroup'),
                items: [
                    {
                        value: SPACE_EDITORS,
                        label: t('contentReview.settings.spaceEditors'),
                    },
                ],
            },
            {
                group: t('contentReview.settings.organizationGroups'),
                items: groups.map((group) => ({
                    value: group.uuid,
                    label: group.name,
                })),
            },
        ],
        [groups, t],
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
            <Stack gap="lg">
                <Select
                    label={t('contentReview.settings.whoReviews')}
                    description={t(
                        'contentReview.settings.whoReviewsDescription',
                    )}
                    data={groupOptions}
                    rightSection={isLoadingGroups ? <Loader size="xs" /> : null}
                    allowDeselect={false}
                    {...form.getInputProps('reviewerGroupUuid')}
                />
                <Switch
                    label={t('contentReview.settings.verifyOnApprove')}
                    description={t(
                        'contentReview.settings.verifyOnApproveDescription',
                    )}
                    {...form.getInputProps('verifyOnApproveDefault', {
                        type: 'checkbox',
                    })}
                />
                {isSlackConnected ? (
                    <SlackChannelSelect
                        label={t('contentReview.settings.slackChannel')}
                        placeholder={t(
                            'contentReview.settings.slackChannelPlaceholder',
                        )}
                        value={form.values.slackChannelId}
                        onChange={(value) =>
                            form.setFieldValue('slackChannelId', value)
                        }
                    />
                ) : (
                    <Stack gap={2}>
                        <Text fz="sm" fw={500}>
                            {t('contentReview.settings.slackChannel')}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            <Trans
                                t={t}
                                i18nKey="contentReview.settings.connectSlack"
                                components={{
                                    anchor: (
                                        <Anchor
                                            component={Link}
                                            to="/generalSettings/integrations"
                                            fz="xs"
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </Stack>
                )}
                <Group justify="space-between">
                    <Button
                        component={Link}
                        to={getContentReviewRequestsPath(projectUuid)}
                        variant="subtle"
                        size="xs"
                        rightSection={<MantineIcon icon={IconArrowUpRight} />}
                    >
                        {t('contentReview.settings.openQueue')}
                    </Button>
                    <Button
                        type="submit"
                        loading={isSaving}
                        disabled={!form.isDirty()}
                    >
                        {t('actions.save', { ns: 'common' })}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const ContentReviewSettingsPanel: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { t } = useTranslation('eeMisc');
    const { data: settings, isInitialLoading } = useContentReviewSettings(
        projectUuid,
        true,
    );
    return (
        <SettingsGridCard>
            <Stack gap="xs">
                <Title order={5}>{t('contentReview.reviewRequests')}</Title>
                <Text c="dimmed" fz="xs">
                    {t('contentReview.settings.description')}
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
