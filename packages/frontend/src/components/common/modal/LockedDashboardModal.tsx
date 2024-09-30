import { Modal, Stack, Text, type ModalProps } from '@mantine/core';
import { type FC } from 'react';

export const LockedDashboardModal: FC<Pick<ModalProps, 'opened'>> = ({
    opened,
}) => (
    <Modal
        opened={opened}
        lockScroll={false}
        withCloseButton={false}
        centered
        withinPortal
        withOverlay={false}
        onClose={() => {}}
        styles={(theme) => ({
            content: {
                border: `1px solid ${theme.colors.gray[2]}`,
                boxShadow: 'none',
            },
        })}
    >
        <Text fw={600} fz="lg" ta="center" mb="lg">
            Set filter values to get started
        </Text>
        <Stack spacing="xs">
            <Text>
                This dashboard cannot be run without setting the filter values
                that are required
            </Text>
        </Stack>
    </Modal>
);
