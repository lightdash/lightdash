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
                    label="Name the Sync"
                    required
                    {...form.getInputProps('name')}
                />
                <Input.Wrapper label="Set the frequency" required>
                    <Box w="100%">
                        <CronInternalInputs
                            disabled={false}
                            {...form.getInputProps('cron')}
                            value={form.values.cron}
                            name="cron"
                        >
                            <TimeZonePicker
                                size="sm"
                                className="ld-grow"
                                placeholder={`Project Default ${
                                    projectDefaultOffsetString
                                        ? `(UTC ${projectDefaultOffsetString})`
                                        : ''
                                }`}
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
                        label="Show filters applied"
                        description="Add a fixed three-row filter summary above the synced data"
                        {...form.getInputProps('showFilters', {
                            type: 'checkbox',
                        })}
                    />
                )}

                {isApp && (
                    <Text size="xs" c="dimmed">
                        Each query in the app is written to its own tab, named
                        after the query.
                    </Text>
                )}

                {!isApp && (
                    <>
                        <Group>
                            <Switch
                                label="Save in a new tab"
                                {...form.getInputProps('saveInNewTab', {
                                    type: 'checkbox',
                                })}
                            ></Switch>
                            <Tooltip
                                label={`Type a tab name to save the sync in, instead of overriding the first existing tab in the Google sheet.
                                This will create a new tab if it doesn't exist. We will still create a tab called metadata with the Sync information.`}
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
                                label="Tab name"
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
