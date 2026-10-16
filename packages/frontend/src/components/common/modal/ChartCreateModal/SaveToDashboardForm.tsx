import {
    type DashboardBasicDetails,
    type SpaceSummary,
} from '@lightdash/common';
import {
    Anchor,
    Group,
    Loader,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../MantineIcon';
import {
    type SaveToDashboardFormType,
    type SaveToSpaceFormType,
} from './types';

type Props<T extends SaveToDashboardFormType & SaveToSpaceFormType> = {
    form: UseFormReturnType<T>;
    spaces: SpaceSummary[] | undefined;
    dashboards: DashboardBasicDetails[] | undefined;
    isLoading: boolean;
    isCreatingNewDashboard: boolean;
    onStartCreatingNewDashboard: () => void;
    onCancelCreatingNewDashboard: () => void;
    isCreatingNewSpaceForDashboard: boolean;
    onStartCreatingNewSpaceForDashboard: () => void;
    onCancelCreatingNewSpaceForDashboard: () => void;
};

const SaveToDashboardForm = <
    T extends SaveToDashboardFormType & SaveToSpaceFormType,
>({
    form,
    spaces = [],
    dashboards = [],
    isLoading,
    isCreatingNewDashboard,
    onStartCreatingNewDashboard,
    onCancelCreatingNewDashboard,
    isCreatingNewSpaceForDashboard,
    onStartCreatingNewSpaceForDashboard,
    onCancelCreatingNewSpaceForDashboard,
}: Props<T>) => {
    const { t } = useTranslation('modals');
    const groupedDashboardItems = useMemo(() => {
        const groupedBySpace = dashboards.reduce<
            Record<string, { value: string; label: string }[]>
        >((acc, d) => {
            const spaceName =
                spaces.find((s) => s.uuid === d.spaceUuid)?.name ??
                t('saveToDashboardForm.otherSpaceGroup');
            if (!acc[spaceName]) acc[spaceName] = [];
            acc[spaceName].push({ value: d.uuid, label: d.name });
            return acc;
        }, {});

        return Object.entries(groupedBySpace).map(([group, items]) => ({
            group,
            items,
        }));
    }, [dashboards, spaces, t]);

    if (isCreatingNewDashboard) {
        return (
            <Stack gap="md">
                <TextInput
                    id="new-dashboard-name"
                    label={t('dashboardCreate.nameLabel')}
                    placeholder={t('dashboardCreate.namePlaceholder')}
                    required
                    {...form.getInputProps('newDashboardName')}
                    value={form.values.newDashboardName ?? ''}
                />
                <Textarea
                    id="new-dashboard-description"
                    label={t('dashboardCreate.descriptionLabel')}
                    placeholder={t('descriptionPlaceholder')}
                    autosize
                    maxRows={3}
                    {...form.getInputProps('newDashboardDescription')}
                    value={form.values.newDashboardDescription ?? ''}
                />
                {!isCreatingNewSpaceForDashboard && spaces.length > 0 ? (
                    <>
                        <Select
                            id="new-dashboard-space"
                            label={t('saveToDashboardForm.selectSpace')}
                            data={spaces.map((s) => ({
                                value: s.uuid,
                                label: s.name,
                            }))}
                            searchable
                            required
                            {...form.getInputProps('spaceUuid')}
                            value={form.values.spaceUuid ?? null}
                        />
                        <Anchor
                            component="span"
                            onClick={onStartCreatingNewSpaceForDashboard}
                        >
                            <Group gap="two">
                                <MantineIcon icon={IconPlus} />
                                {t('saveToDashboardForm.createNewSpace')}
                            </Group>
                        </Anchor>
                    </>
                ) : (
                    <>
                        <TextInput
                            id="new-dashboard-new-space"
                            label={t('saveToDashboardForm.newSpaceNameLabel')}
                            placeholder={t('spaceAction.namePlaceholder')}
                            required
                            {...form.getInputProps('newSpaceName')}
                            value={form.values.newSpaceName ?? ''}
                        />
                        {spaces.length > 0 && (
                            <Anchor
                                component="span"
                                onClick={onCancelCreatingNewSpaceForDashboard}
                            >
                                <Group gap="two">
                                    <MantineIcon icon={IconArrowLeft} />
                                    {t(
                                        'saveToDashboardForm.saveToExistingSpace',
                                    )}
                                </Group>
                            </Anchor>
                        )}
                    </>
                )}
                {dashboards.length > 0 && (
                    <Anchor
                        component="span"
                        onClick={onCancelCreatingNewDashboard}
                    >
                        <Group gap="two">
                            <MantineIcon icon={IconArrowLeft} />
                            {t('saveToDashboardForm.saveToExistingDashboard')}
                        </Group>
                    </Anchor>
                )}
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            <Select
                id="select-dashboard"
                label={t('saveToDashboardForm.dashboardLabel')}
                data={groupedDashboardItems}
                rightSection={isLoading ? <Loader size="xs" /> : undefined}
                searchable
                nothingFoundMessage={t('saveToDashboardForm.noDashboardsFound')}
                required
                {...form.getInputProps('dashboardUuid')}
                value={form.values.dashboardUuid ?? null}
            />
            <Anchor component="span" onClick={onStartCreatingNewDashboard}>
                <Group gap="two">
                    <MantineIcon icon={IconPlus} />
                    {t('saveToDashboardForm.createNewDashboard')}
                </Group>
            </Anchor>
        </Stack>
    );
};

export default SaveToDashboardForm;
