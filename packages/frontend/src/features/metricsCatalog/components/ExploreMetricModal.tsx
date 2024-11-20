import { Group, Modal, Stack, Text, type ModalProps } from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';

type Props = ModalProps;

export const ExploreMetricModal: FC<Props> = ({ opened, onClose }) => {
    const activeMetric = useAppSelector(
        (state) => state.metricsCatalog.modals.exploreModal.activeMetric,
    );

    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            yOffset={200}
            scrollAreaComponent={undefined}
            size="xl"
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
                <Modal.Body
                    p={0}
                    mah={300}
                    h="100%"
                    sx={{
                        overflowY: 'auto',
                    }}
                >
                    <Stack spacing="xs" p="md">
                        <Text>blabla</Text>
                    </Stack>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
