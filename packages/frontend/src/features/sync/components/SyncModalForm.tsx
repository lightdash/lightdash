import { formatMinutesOffset, getTzMinutesOffset } from '@lightdash/common';
import {
    Box,
    Group,
    Input,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import TimeZonePicker from '../../../components/common/TimeZonePicker';
import { CronInternalInputs } from '../../../components/CronInput';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { SelectGoogleSheetButton } from './SelectGoogleSheetButton';
import classes from './SyncModalForm.module.css';
import {
    useSyncModalFormContext,
    type SyncModalFormValues,
} from './syncModalFormContext';

type Props = {
    id: string;
    onSubmit: (data: SyncModalFormValues) => void;
    /** App syncs always write one tab per captured query — there's no single
     *  "first tab" to override, so the tab-name override doesn't apply. */
    isApp?: boolean;
    supportsFilters?: boolean;
};

export const SyncModalForm: FC<Props> = ({
    id,
    onSubmit,
    isApp = false,
    supportsFilters = false,
}) => {
    const { t } = useTranslation('sync');
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const projectDefaultOffsetString = useMemo(() => {
        if (!project) {
            return;
        }
        const minsOffset = getTzMinutesOffset('UTC', project.schedulerTimezone);
        return formatMinutesOffset(minsOffset);
    }, [project]);

    const form = useSyncModalFormContext();

    return (
        <form
            id={id}
            onSubmit={form.onSubmit(onSubmit)}
            className={classes.form}
        >
            <Stack>
                <TextInput
                    label={t('form.nameLabel')}
                    required
                    {...form.getInputProps('name')}
                />
                <Input.Wrapper label={t('form.frequencyLabel')} required>
                    <Box w="100%">
                        <CronInternalInputs
                            disabled={false}
                            {...form.getInputProps('cron')}
                            value={form.values.cron}
                            name="cron"
                        >
                            <TimeZonePicker
                                size="sm"
                                flex={1}
                                placeholder={
                                    projectDefaultOffsetString
                                        ? t('form.timezoneDefaultWithOffset', {
                                              offset: projectDefaultOffsetString,
                                          })
                                        : t('form.timezoneDefault')
                                }
                                maw={350}
                                searchable
                                clearable
                                variant="default"
                                comboboxProps={{
                                    withinPortal: true,
                                }}
                                {...form.getInputProps('timezone')}
                            />
                        </CronInternalInputs>
                    </Box>
                </Input.Wrapper>

                <SelectGoogleSheetButton />

                {supportsFilters && (
                    <Switch
                        label={t('form.showFiltersLabel')}
                        description={t('form.showFiltersDescription')}
                        {...form.getInputProps('showFilters', {
                            type: 'checkbox',
                        })}
                    />
                )}

                {isApp && (
                    <Text size="xs" c="dimmed">
                        {t('form.appTabsHint')}
                    </Text>
                )}

                {!isApp && (
                    <>
                        <Group>
                            <Switch
                                label={t('form.saveInNewTab')}
                                {...form.getInputProps('saveInNewTab', {
                                    type: 'checkbox',
                                })}
                            ></Switch>
                            <Tooltip
                                label={t('form.saveInNewTabTooltip')}
                                position="right"
                                maw={400}
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="dimmed"
                                />
                            </Tooltip>
                        </Group>
                        {form.values.saveInNewTab && (
                            <TextInput
                                required
                                label={t('form.tabNameLabel')}
                                placeholder="Sheet1"
                                {...form.getInputProps('options.tabName')}
                            />
                        )}
                    </>
                )}
            </Stack>
        </form>
    );
};
