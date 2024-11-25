import {
    Box,
    Group,
    Modal,
    SegmentedControl,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { TimeSeriesChart } from './joaopoc';
import {
    staticMockData,
    staticMockDataPreviousYear,
} from './joaopoc/generateMockData';
import RechartsPOC from './RechartsPOC';

type Props = ModalProps;

export const ExploreMetricModal: FC<Props> = ({ opened, onClose }) => {
    const activeMetric = useAppSelector(
        (state) => state.metricsCatalog.modals.exploreModal.activeMetric,
    );

    const [selectedChart, setSelectedChart] = useState<'recharts' | 'joaopoc'>(
        'joaopoc',
    );

    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            scrollAreaComponent={undefined}
            size="100%"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius="md">
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[4]}`,
                    })}
                >
                    <Group spacing="xs">
                        <MantineIcon icon={IconHash} size="lg" color="gray.7" />
                        <Text fw={500}>Exploring {activeMetric?.name}</Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>
                <Modal.Body h="calc(100vh - 160px)">
                    <SegmentedControl
                        data={[
                            { label: 'Recharts', value: 'recharts' },
                            { label: 'Joao', value: 'joaopoc' },
                        ]}
                        value={selectedChart}
                        onChange={(value) =>
                            setSelectedChart(value as 'recharts' | 'joaopoc')
                        }
                    />
                    <Box h="100%" p="md">
                        {selectedChart === 'recharts' && <RechartsPOC />}
                        {selectedChart === 'joaopoc' && (
                            <TimeSeriesChart
                                data={staticMockData}
                                previousPeriodData={staticMockDataPreviousYear}
                            />
                        )}
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
