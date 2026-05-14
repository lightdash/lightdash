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
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
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
    const groupedDashboardItems = useMemo(() => {
        const groupedBySpace = dashboards.reduce<
            Record<string, { value: string; label: string }[]>
        >((acc, d) => {
            const spaceName =
                spaces.find((s) => s.uuid === d.spaceUuid)?.name ?? 'Other';
            if (!acc[spaceName]) acc[spaceName] = [];
            acc[spaceName].push({ value: d.uuid, label: d.name });
            return acc;
        }, {});

        return Object.entries(groupedBySpace).map(([group, items]) => ({
            group,
            items,
        }));
    }, [dashboards, spaces]);

    if (isCreatingNewDashboard) {
        return (
            <Stack gap="md">
                <TextInput
                    id="new-dashboard-name"
                    label="Name your dashboard"
                    placeholder="eg. KPI dashboard"
                    required
                    {...form.getInputProps('newDashboardName')}
                    value={form.values.newDashboardName ?? ''}
                />
                <Textarea
                    id="new-dashboard-description"
                    label="Dashboard description"
                    placeholder="A few words to give your team some context"
                    autosize
                    maxRows={3}
                    {...form.getInputProps('newDashboardDescription')}
                    value={form.values.newDashboardDescription ?? ''}
                />
                {!isCreatingNewSpaceForDashboard && spaces.length > 0 ? (
                    <>
                        <Select
                            id="new-dashboard-space"
                            label="Select a space"
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
                                Create new space
                            </Group>
                        </Anchor>
                    </>
                ) : (
                    <>
                        <TextInput
                            id="new-dashboard-new-space"
                            label="Name your new space"
                            placeholder="eg. KPIs"
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
                                    Save to existing space
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
                            Save to existing dashboard
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
                label="Dashboard"
                data={groupedDashboardItems}
                rightSection={isLoading ? <Loader size="xs" /> : undefined}
                searchable
                nothingFoundMessage="No matching dashboards found"
                required
                {...form.getInputProps('dashboardUuid')}
                value={form.values.dashboardUuid ?? null}
            />
            <Anchor component="span" onClick={onStartCreatingNewDashboard}>
                <Group gap="two">
                    <MantineIcon icon={IconPlus} />
                    Create new dashboard
                </Group>
            </Anchor>
        </Stack>
    );
};

export default SaveToDashboardForm;
