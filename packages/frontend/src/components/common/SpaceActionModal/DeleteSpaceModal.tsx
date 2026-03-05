import { Group, Skeleton, Text, TextInput } from '@mantine-8/core';
import {
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { type DeleteSpaceModalBody } from '.';
import { useSpaceDeleteImpact } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';

const DeleteSpaceTextInputConfirmation: FC<{
    data: DeleteSpaceModalBody['data'];
    setCanDelete: (canDelete: boolean) => void;
}> = ({ data, setCanDelete }) => {
    const [value, setValue] = useState('');

    return (
        <TextInput
            label="Type the space name to confirm"
            placeholder="Space name"
            value={value}
            onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value === data?.name) {
                    setCanDelete(true);
                } else {
                    setCanDelete(false);
                }
            }}
        />
    );
};

const DeleteSpaceModalContent: FC<
    Pick<DeleteSpaceModalBody, 'data'> & { softDeleteEnabled: boolean }
> = ({ data, softDeleteEnabled }) => {
    const { data: impact, isLoading: isLoadingImpact } = useSpaceDeleteImpact(
        data?.projectUuid,
        data?.uuid,
    );

    if (isLoadingImpact) {
        return <Skeleton height={40} radius="sm" />;
    }

    if (!impact) {
        return null;
    }

    const descendantCount = impact.spaces.filter(
        (s) => s.uuid !== data?.uuid,
    ).length;

    const hasContent =
        descendantCount > 0 ||
        impact.chartCount > 0 ||
        impact.dashboardCount > 0;

    if (!hasContent) {
        return null;
    }

    const title = softDeleteEnabled
        ? 'This will also delete content within this space:'
        : 'This will permanently delete content within this space:';

    return (
        <Callout
            variant={softDeleteEnabled ? 'warning' : 'danger'}
            title={title}
        >
            <Group gap="lg">
                <Group gap={4}>
                    <MantineIcon
                        icon={IconFolder}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={700}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {descendantCount} space
                        {descendantCount !== 1 ? 's' : ''}
                    </Text>
                </Group>
                <Group gap={4}>
                    <MantineIcon
                        icon={IconChartBar}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={700}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {impact.chartCount} chart
                        {impact.chartCount !== 1 ? 's' : ''}
                    </Text>
                </Group>
                <Group gap={4}>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="sm"
                        color={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                        stroke={1.5}
                    />
                    <Text
                        size="sm"
                        fw={700}
                        c={softDeleteEnabled ? 'yellow.7' : 'red.7'}
                    >
                        {impact.dashboardCount} dashboard
                        {impact.dashboardCount !== 1 ? 's' : ''}
                    </Text>
                </Group>
            </Group>
        </Callout>
    );
};

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    form,
    handleSubmit,
    isLoading,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const retentionDays = health.data?.softDelete.retentionDays ?? 30;

    const [canDelete, setCanDelete] = useState(false);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            variant="delete"
            size="lg"
            onConfirm={form.onSubmit(handleSubmit)}
            confirmDisabled={!canDelete || isLoading}
            confirmLoading={isLoading}
        >
            <Text fz="sm">
                {softDeleteEnabled ? (
                    <>
                        Are you sure you want to delete the space{' '}
                        <Text span fw={700} fz="sm">
                            &ldquo;{data?.name}&rdquo;
                        </Text>
                        ?
                    </>
                ) : (
                    <>
                        Are you sure you want to delete the space{' '}
                        <Text span fw={700}>
                            &ldquo;{data?.name}&rdquo;
                        </Text>
                        ?
                    </>
                )}
            </Text>
            <DeleteSpaceModalContent
                data={data}
                softDeleteEnabled={softDeleteEnabled}
            />
            <Text fz="sm">
                This space and its contents will be moved to Recently deleted
                and permanently removed after {retentionDays} days.
            </Text>
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
