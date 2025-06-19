import { type CreateSavedChartVersion } from '@lightdash/common';
import { Group, Modal, Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../../../hooks/dashboard/useDashboardStorage';
import MantineIcon from '../../MantineIcon';
import { SaveToDashboard } from './SaveToDashboard';
import { SaveToSpaceOrDashboard } from './SaveToSpaceOrDashboard';
import { type ChartMetadata } from './types';

interface ChartCreateModalProps {
    savedData: CreateSavedChartVersion;
    isOpen: boolean;
    onClose: () => void;
    defaultSpaceUuid?: string;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
    chartMetadata?: ChartMetadata;
}

enum SaveMode {
    DEFAULT = 'DEFAULT',
    TO_DASHBOARD = 'TO_DASHBOARD',
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    isOpen,
    onClose,
    defaultSpaceUuid,
    onConfirm,
    chartMetadata,
}) => {
    // Store it in the state to avoid losing the param when the user switches between tables
    const [spaceUuid] = useState(defaultSpaceUuid);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const editingDashboardInfo = getEditingDashboardInfo();

    const saveMode = useMemo(() => {
        if (editingDashboardInfo.name && editingDashboardInfo.dashboardUuid) {
            return SaveMode.TO_DASHBOARD;
        }
        return SaveMode.DEFAULT;
    }, [editingDashboardInfo]);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const getModalTitle = useCallback(() => {
        if (saveMode === SaveMode.TO_DASHBOARD) {
            return `Save chart "${editingDashboardInfo.name}"`;
        }
        return 'Save chart';
    }, [saveMode, editingDashboardInfo]);

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>{getModalTitle()}</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            {saveMode === SaveMode.TO_DASHBOARD && (
                <SaveToDashboard
                    projectUuid={projectUuid}
                    dashboardName={editingDashboardInfo.name}
                    dashboardUuid={editingDashboardInfo.dashboardUuid}
                    savedData={savedData}
                    onClose={onClose}
                    defaults={chartMetadata}
                />
            )}

            {saveMode === SaveMode.DEFAULT && (
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={savedData}
                    onConfirm={onConfirm}
                    onClose={onClose}
                    defaultSpaceUuid={spaceUuid}
                    dashboardInfoFromSavedData={{
                        dashboardName: savedData.dashboardName ?? null,
                        dashboardUuid: savedData.dashboardUuid ?? null,
                    }}
                    chartMetadata={chartMetadata}
                />
            )}
        </Modal>
    );
};

export default ChartCreateModal;
