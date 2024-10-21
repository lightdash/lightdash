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
import { lazy, Suspense, useState, useTransition, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useSearchParams from '../../../hooks/useSearchParams';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    activeTableName: string;
    setIsEditVirtualViewOpen: (value: boolean) => void;
    explore: Explore;
};

const SqlRunnerNewPage = lazy(() => import('../../../pages/SqlRunnerNew'));

export const EditVirtualViewModal: FC<Props> = ({
    opened,
    onClose,
    activeTableName,
    explore,
}) => {
    const hasUnsavedChanges = !!useSearchParams('create_saved_chart_version');
    const [isPending, startTransition] = useTransition();

    const [modalStep, setModalStep] = useState<
        'unsavedChanges' | 'editVirtualView' | undefined
    >(hasUnsavedChanges ? 'unsavedChanges' : 'editVirtualView');

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );

    const handleClose = () => {
        if (modalStep === 'editVirtualView') {
            setModalStep(undefined);
            onClose();
        }
    };

    return (
        <Modal
            opened={opened}
            closeOnClickOutside={false}
            withCloseButton={false}
            onClose={handleClose}
            title={
                modalStep === 'unsavedChanges' ? (
                    <Group spacing="xs">
                        <MantineIcon icon={IconAlertCircle} />
                        <Text fw={500}>You have unsaved changes</Text>
                    </Group>
                ) : null
            }
            size={modalStep === 'editVirtualView' ? '97vw' : 'lg'}
            yOffset={modalStep === 'editVirtualView' ? '3vh' : undefined}
            xOffset={modalStep === 'editVirtualView' ? '2vw' : undefined}
            centered={modalStep !== 'editVirtualView'}
            styles={(theme) => ({
                header: {
                    padding:
                        modalStep === 'editVirtualView' ? 0 : theme.spacing.md,
                },
                body: {
                    padding:
                        modalStep === 'editVirtualView' ? 0 : theme.spacing.md,
                },
            })}
        >
            {modalStep === 'unsavedChanges' && (
                <Stack>
                    <Text fz="sm">
                        Are you sure you want to leave this page? Changes you've
                        made to your query will not be saved.
                    </Text>
                    <Group position="right">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={() => {
                                startTransition(() => {
                                    clearQuery();
                                    setModalStep('editVirtualView');
                                });
                            }}
                            loading={isPending}
                        >
                            Discard & continue
                        </Button>
                    </Group>
                </Stack>
            )}
            {modalStep === 'editVirtualView' && (
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
                            label: explore.label,
                            sql: explore.tables[activeTableName].sqlTable,
                            onCloseEditVirtualView: onClose,
                        }}
                    />
                </Suspense>
            )}
        </Modal>
    );
};
