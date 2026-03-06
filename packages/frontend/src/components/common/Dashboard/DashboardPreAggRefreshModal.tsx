import { Code, List, Text } from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import { useRefreshPreAggregateByDefinitionName } from '../../../hooks/usePreAggregateRefresh';
import MantineModal from '../MantineModal';

type DashboardPreAggRefreshModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    preAggregateNames: string[];
};

const DashboardPreAggRefreshModal: FC<DashboardPreAggRefreshModalProps> = ({
    opened,
    onClose,
    projectUuid,
    preAggregateNames,
}) => {
    const { mutateAsync: refreshByName, isLoading } =
        useRefreshPreAggregateByDefinitionName(projectUuid);

    const handleConfirm = async () => {
        await Promise.all(preAggregateNames.map((name) => refreshByName(name)));
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Refresh pre-aggregates"
            icon={IconRefresh}
            size="lg"
            onConfirm={handleConfirm}
            confirmLabel="Refresh"
            confirmLoading={isLoading}
        >
            <Text fz="sm">
                This will refresh {preAggregateNames.length} pre-aggregate
                {preAggregateNames.length === 1 ? '' : 's'} used by this
                dashboard:
            </Text>
            <List fz="sm" spacing={4}>
                {preAggregateNames.map((name) => (
                    <List.Item key={name}>
                        <Code>{name}</Code>
                    </List.Item>
                ))}
            </List>
        </MantineModal>
    );
};

export default DashboardPreAggRefreshModal;
