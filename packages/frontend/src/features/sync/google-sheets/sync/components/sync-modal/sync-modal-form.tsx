import {
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerFormat,
} from '@lightdash/common';
import { Button, Group, Input, Space, Stack, TextInput } from '@mantine/core';
import { IconCirclesRelation } from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import CronInput from '../../../../../../components/ReactHookForm/CronInput';
import { useChartSchedulerCreateMutation } from '../../../../../../hooks/scheduler/useChartSchedulers';
import { isInvalidCronExpression } from '../../../../../../utils/fieldValidators';
import {
    SyncWithGoogleSheetsModalAction,
    useSyncWithGoogleSheetsModal,
} from '../../hooks/use-sync-with-google-sheets-modal-provider';
import { SelectGoogleSheetButton } from '../select-google-sheet-button';

export const SyncModalForm: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { setAction } = useSyncWithGoogleSheetsModal();
    const {
        mutate: createChartScheduler,
        isLoading,
        isSuccess,
    } = useChartSchedulerCreateMutation();
    const methods = useForm<CreateSchedulerAndTargetsWithoutIds>({
        mode: 'onSubmit',
        defaultValues: {
            cron: '',
            name: '',
            options: {
                gdriveId: '',
                gdriveName: '',
                gdriveOrganizationName: '',
                url: '',
            },
        },
    });

    const handleSubmit = (data: CreateSchedulerAndTargetsWithoutIds) => {
        const defaultNewSchedulerValues = {
            format: SchedulerFormat.GSHEETS,
            targets: [],
        };

        createChartScheduler({
            resourceUuid: chartUuid,
            data: {
                ...data,
                ...defaultNewSchedulerValues,
            },
        });
    };

    useEffect(() => {
        if (isSuccess) {
            methods.reset();
            setAction(SyncWithGoogleSheetsModalAction.VIEW);
        }
    }, [isSuccess, methods, setAction]);

    const hasSetGoogleSheet = methods.watch('options.gdriveId') !== '';

    return (
        <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(handleSubmit)}>
                <Stack>
                    <TextInput
                        label="Name the Sync"
                        required
                        {...methods.register('name')}
                    />
                    <Input.Wrapper label="Set the frequency" required>
                        <CronInput
                            name="cron"
                            defaultValue="0 9 * * 1"
                            rules={{
                                required: 'Required field',
                                validate: {
                                    isValidCronExpression:
                                        isInvalidCronExpression(
                                            'Cron expression',
                                        ),
                                },
                            }}
                        />
                    </Input.Wrapper>

                    <SelectGoogleSheetButton />

                    <Space />

                    <Group position="apart">
                        <Button
                            variant="outline"
                            loading={isLoading}
                            onClick={() =>
                                setAction(SyncWithGoogleSheetsModalAction.VIEW)
                            }
                        >
                            Cancel
                        </Button>

                        <Button
                            display="block"
                            ml="auto"
                            type="submit"
                            disabled={!hasSetGoogleSheet}
                            loading={isLoading}
                            leftIcon={
                                <MantineIcon icon={IconCirclesRelation} />
                            }
                        >
                            Sync
                        </Button>
                    </Group>
                </Stack>
            </form>
        </FormProvider>
    );
};
