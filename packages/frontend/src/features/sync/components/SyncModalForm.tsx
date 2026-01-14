import { formatMinutesOffset, getTzMinutesOffset } from '@lightdash/common';
import {
    Box,
    Group,
    Input,
    Stack,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { CronInternalInputs } from '../../../components/ReactHookForm/CronInput';
import MantineIcon from '../../../components/common/MantineIcon';
import TimeZonePicker from '../../../components/common/TimeZonePicker';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { SelectGoogleSheetButton } from './SelectGoogleSheetButton';
import {
    useSyncModalFormContext,
    type SyncModalFormValues,
} from './syncModalFormContext';

type Props = {
    id: string;
    onSubmit: (data: SyncModalFormValues) => void;
};

export const SyncModalForm: FC<Props> = ({ id, onSubmit }) => {
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
        <form id={id} onSubmit={form.onSubmit(onSubmit)}>
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
                                style={{ flexGrow: 1 }}
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
                        multiline
                        withinPortal
                        position="right"
                        maw={400}
                    >
                        <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
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
            </Stack>
        </form>
    );
};
