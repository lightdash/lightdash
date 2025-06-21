import { Button, Group, Modal, Text } from '@mantine-8/core';
import { IconChartBar, IconDeviceFloppy } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';

type SaveVisualizationProps = {
    projectUuid?: string;
};

const SaveVisualization: FC<SaveVisualizationProps> = ({ projectUuid }) => {
    const { visualizationConfig, columnOrder, resultsData, chartConfig } =
        useVisualizationContext();
    const [modalOpen, setModalOpen] = useState<boolean>(false);
    const closeModal = () => {
        setModalOpen(false);
    };
    const metadata = {
        name:
            'title' in visualizationConfig &&
            typeof visualizationConfig.title === 'string'
                ? visualizationConfig.title
                : '',
        description:
            'description' in visualizationConfig &&
            typeof visualizationConfig.description === 'string'
                ? visualizationConfig.description
                : '',
    };
    const metricQuery = resultsData?.metricQuery;
    if (!metricQuery) return null;
    return (
        <>
            <Button
                onClick={() => setModalOpen(true)}
                variant="subtle"
                color="gray"
                size="xs"
                aria-label="open in explore"
                leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                style={{
                    color: '#868e96',
                }}
            >
                Save chart
            </Button>
            <Modal
                opened={modalOpen}
                onClose={closeModal}
                size="lg"
                title={
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconChartBar}
                            size="lg"
                            color="gray.7"
                        />
                        <Text fw={500}>Save chart</Text>
                    </Group>
                }
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={{
                        metricQuery: metricQuery,
                        tableName: metricQuery.exploreName,
                        chartConfig,
                        tableConfig: { columnOrder },
                    }}
                    onConfirm={closeModal}
                    onClose={closeModal}
                    chartMetadata={metadata}
                    redirectOnSuccess={false}
                />
            </Modal>
        </>
    );
};

export default SaveVisualization;
