import { type Explore } from '@lightdash/common';
import {
    Button,
    Center,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { lazy, Suspense, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    isClosingConfirmation: boolean;
    setIsClosingConfirmation: (value: boolean) => void;
    activeTableName: string;
    setIsEditVirtualViewOpen: (value: boolean) => void;
    explore: Explore;
};

const SqlRunnerNewPage = lazy(() => import('../../../pages/SqlRunnerNew'));

export const EditVirtualViewModal: FC<Props> = ({
    opened,
    onClose,
    isClosingConfirmation,
    setIsClosingConfirmation,
    activeTableName,
    setIsEditVirtualViewOpen,
    explore,
}) => {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                isClosingConfirmation ? (
                    <Group spacing="xs">
                        <MantineIcon icon={IconAlertCircle} />
                        <Text fw={500}>You have unsaved changes</Text>
                    </Group>
                ) : null
            }
            size="95vw"
            yOffset="3vh"
            xOffset="2vw"
            styles={(theme) => ({
                header: {
                    padding: 0,
                },
                body: {
                    padding: isClosingConfirmation ? theme.spacing.md : 0,
                },
                // TODO: This is a hack to position the close button a bit better with the Save button
                close: {
                    position: 'absolute',
                    top: 2,
                    right: 2,
                },
            })}
        >
            {isClosingConfirmation ? (
                <Stack>
                    <Text fz="sm">
                        Are you sure you want to close? Your changes will be
                        lost.
                    </Text>
                    <Group position="right">
                        <Button
                            variant="outline"
                            onClick={() => setIsClosingConfirmation(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={() => setIsEditVirtualViewOpen(false)}
                        >
                            Close
                        </Button>
                    </Group>
                </Stack>
            ) : (
                <Suspense
                    fallback={
                        <Center h="95vh" w="95vw">
                            <Stack align="center" justify="center">
                                <Loader variant="bars" />
                                <Text fw={500}>Loading SQL Runner...</Text>
                            </Stack>
                        </Center>
                    }
                >
                    <SqlRunnerNewPage
                        isEditMode
                        virtualViewState={{
                            name: explore.name,
                            sql: explore.tables[activeTableName].sqlTable,
                        }}
                    />
                </Suspense>
            )}
        </Modal>
    );
};
