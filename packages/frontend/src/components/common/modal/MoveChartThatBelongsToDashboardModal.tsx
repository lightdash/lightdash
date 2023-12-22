import {
    Button,
    Flex,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconFolders } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useMoveChartMutation } from '../../../hooks/useSavedQuery';
import MantineIcon from '../MantineIcon';

interface Props extends ModalProps {
    uuid: string;
    name: string;
    spaceUuid: string;
    spaceName: string;
    onConfirm: () => void;
}

const MoveChartThatBelongsToDashboardModal: FC<
    React.PropsWithChildren<Props>
> = ({ uuid, name, spaceUuid, spaceName, onConfirm, ...modelProps }) => {
    const { mutate: moveChartToSpace } = useMoveChartMutation({
        onSuccess: async () => {
            onConfirm();
            modelProps.onClose();
        },
    });

    return (
        <Modal
            size="lg"
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon icon={IconFolders} size="lg" />
                    <Title order={5}>
                        <Text span fw={400}>
                            Move{' '}
                        </Text>
                        {name}
                    </Title>
                </Flex>
            }
            {...modelProps}
        >
            <Stack mt="sm">
                <Text>
                    Are you sure you want to move the chart{' '}
                    <Text fw={600} span>
                        {name}
                    </Text>{' '}
                    to the space{' '}
                    <Text fw={600} span>
                        {spaceName}
                    </Text>
                    ?
                </Text>
                <Text>
                    This chart was created from within the dashboard, moving the
                    chart to the space will make it available in chart lists
                    across the app.
                </Text>
                <Text fw={600}>This change cannot be undone.</Text>

                <Group position="right" spacing="xs">
                    <Button variant="outline" onClick={modelProps.onClose}>
                        Cancel
                    </Button>

                    <Button
                        onClick={() => {
                            moveChartToSpace({
                                uuid,
                                spaceUuid,
                            });
                        }}
                        type="submit"
                    >
                        Move
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default MoveChartThatBelongsToDashboardModal;
