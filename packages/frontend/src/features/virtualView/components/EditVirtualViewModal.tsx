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
import { lazy, Suspense, useState, type FC } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
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

    const [modalStep, setModalStep] = useState<
        'unsavedChanges' | 'closingConfirmation' | 'editVirtualView' | undefined
    >(hasUnsavedChanges ? 'unsavedChanges' : 'editVirtualView');

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );

    const handleClose = () => {
        if (modalStep === 'closingConfirmation') {
            setModalStep(undefined);
            onClose();
        } else if (modalStep === 'editVirtualView') {
            setModalStep('closingConfirmation');
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                modalStep === 'closingConfirmation' ||
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
                // TODO: This is a hack to position the close button a bit better with the Save button
                close: {
                    position: 'absolute',
                    top: 2,
                    right: 2,
                },
            })}
        >
            <ConditionalVisibility isVisible={modalStep === 'unsavedChanges'}>
                <Stack>
                    <Text fz="sm">
                        Your changes will be lost. Save them before continuing.
                    </Text>
                    <Group position="right">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            color="orange"
                            onClick={() => {
                                clearQuery();

                                setModalStep('editVirtualView');
                            }}
                        >
                            Discard & continue
                        </Button>
                    </Group>
                </Stack>
            </ConditionalVisibility>
            <ConditionalVisibility isVisible={modalStep === 'editVirtualView'}>
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
                        }}
                    />
                </Suspense>
            </ConditionalVisibility>
            <ConditionalVisibility
                isVisible={modalStep === 'closingConfirmation'}
            >
                <Stack>
                    <Text fz="sm">
                        Are you sure you want to close? Your changes will be
                        lost.
                    </Text>
                    <Group position="right">
                        <Button
                            variant="outline"
                            onClick={() => setModalStep('editVirtualView')}
                        >
                            Cancel
                        </Button>
                        <Button color="red" onClick={onClose}>
                            Close
                        </Button>
                    </Group>
                </Stack>
            </ConditionalVisibility>
        </Modal>
    );
};
