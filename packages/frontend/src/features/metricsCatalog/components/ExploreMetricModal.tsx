import { Box, Group, Modal, Text, type ModalProps } from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import RechartsPOC from './RechartsPOC';

type Props = ModalProps;

export const ExploreMetricModal: FC<Props> = ({ opened, onClose }) => {
    const activeMetric = useAppSelector(
        (state) => state.metricsCatalog.modals.exploreModal.activeMetric,
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
                <Modal.Body p={0} h="calc(100vh - 160px)">
                    <Box h="100%" p={100}>
                        <RechartsPOC />
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
