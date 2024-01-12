import { assertUnreachable } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    MultiSelect,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolder } from '@tabler/icons-react';
import { FC, forwardRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
    useDashboards,
    useUpdateMultipleDashboard,
} from '../../../hooks/dashboard/useDashboards';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useUpdateMultipleMutation } from '../../../hooks/useSavedQuery';
import { useSpace, useSpaceSummaries } from '../../../hooks/useSpaces';
import MantineIcon from '../../common/MantineIcon';

export enum AddToSpaceResources {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
}

const getResourceTypeLabel = (resourceType: AddToSpaceResources) => {
    switch (resourceType) {
        case AddToSpaceResources.DASHBOARD:
            return 'Dashboard';
        case AddToSpaceResources.CHART:
            return 'Chart';
        default:
            return assertUnreachable(
                resourceType,
                'Unexpected resource type when getting label',
            );
    }
};

type SelectItemData = {
    value: string;
    label: string;
    disabled: boolean;
    title: string;
    spaceName: string | undefined;
};

const SelectItem = forwardRef<HTMLDivElement, SelectItemData>(
    (
        {
            label,
            value,
            spaceName,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & SelectItemData,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing="two">
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Group spacing="xs">
                <MantineIcon size="sm" icon={IconFolder} />
                <Text fz="xs" opacity={0.65}>
                    {spaceName}
                </Text>
            </Group>
        </Stack>
    ),
);

type AddItemForm = {
    items: string[];
};

type Props = Pick<ModalProps, 'onClose'> & {
    resourceType: AddToSpaceResources;
};

const AddResourceToSpaceModal: FC<Props> = ({ resourceType, onClose }) => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();

    const { data: space } = useSpace(projectUuid, spaceUuid);
    const { data: spaces } = useSpaceSummaries(projectUuid);

    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);
    const { data: dashboards } = useDashboards(projectUuid);

    const { mutate: chartMutation } = useUpdateMultipleMutation(projectUuid);
    const { mutate: dashboardMutation } =
        useUpdateMultipleDashboard(projectUuid);

    const form = useForm<AddItemForm>();
    const { reset } = form;

    const closeModal = useCallback(() => {
        reset();
        if (onClose) onClose();
    }, [reset, onClose]);

    const allItems =
        resourceType === AddToSpaceResources.CHART ? savedCharts : dashboards;

    if (!allItems) {
        return null;
    }

    const selectItems: SelectItemData[] = allItems.map(
        ({ uuid: itemUuid, name, spaceUuid: itemSpaceUuid }) => {
            const disabled = spaceUuid === itemSpaceUuid;
            const spaceName = spaces?.find(
                (sp) => sp.uuid === itemSpaceUuid,
            )?.name;

            return {
                value: itemUuid,
                label: name,
                disabled,
                title: disabled
                    ? `${getResourceTypeLabel(
                          resourceType,
                      )} already added on this space ${spaceName}`
                    : '',
                spaceName,
            };
        },
    );

    const handleSubmit = form.onSubmit(({ items }) => {
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                if (savedCharts && items) {
                    const selectedCharts = items.map((item) => {
                        const chart = savedCharts.find(
                            (savedChart) => savedChart.uuid === item,
                        );
                        return {
                            uuid: item,
                            name: chart?.name || '',
                            spaceUuid,
                        };
                    });

                    chartMutation(selectedCharts);
                }
                break;
            case AddToSpaceResources.DASHBOARD:
                if (dashboards && items) {
                    const selectedDashboards = items.map((item) => {
                        const dashboard = dashboards.find(
                            ({ uuid }) => uuid === item,
                        );
                        return {
                            uuid: item,
                            name: dashboard?.name || '',
                            spaceUuid,
                        };
                    });

                    dashboardMutation(selectedDashboards);
                }
                break;
        }

        closeModal();
    });

    return (
        <Modal
            opened
            onClose={closeModal}
            title={<Title order={4}>{`Add ${resourceType} to space`}</Title>}
        >
            <form name="add_items_to_space" onSubmit={handleSubmit}>
                <Stack spacing="xs" pt="sm">
                    <Text>
                        Select the {resourceType}s that you would like to move
                        into{' '}
                        <Text span fw={500}>
                            {space?.name}
                        </Text>
                        :
                    </Text>

                    <MultiSelect
                        withinPortal
                        searchable
                        required
                        data={selectItems}
                        itemComponent={SelectItem}
                        disabled={isLoading}
                        placeholder={`Search for a ${resourceType}`}
                        {...form.getInputProps('items')}
                    />
                </Stack>

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={closeModal}>
                        Cancel
                    </Button>
                    <Button
                        disabled={isLoading}
                        type="submit"
                    >{`Move ${resourceType}s`}</Button>
                </Group>
            </form>
        </Modal>
    );
};

export default AddResourceToSpaceModal;
