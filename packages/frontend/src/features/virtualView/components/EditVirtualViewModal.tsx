import { type Explore } from '@lightdash/common';
import { Button, Center, Loader, Modal, Stack, Text } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import {
    Suspense,
    lazy,
    useCallback,
    useState,
    useTransition,
    type FC,
} from 'react';
import { useNavigate } from 'react-router';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import {
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useSearchParams from '../../../hooks/useSearchParams';
import { defaultState } from '../../../providers/Explorer/defaultState';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    activeTableName: string;
    setIsEditVirtualViewOpen: (value: boolean) => void;
    explore: Explore;
};

const SqlRunnerPage = lazy(() => import('../../../pages/SqlRunner'));

export const EditVirtualViewModal: FC<Props> = ({
    opened,
    onClose,
    activeTableName,
    explore,
}) => {
    const hasUnsavedChanges = !!useSearchParams('create_saved_chart_version');
    const [isPending, startTransition] = useTransition();
    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();
    const tableName = useExplorerSelector(selectTableName);

    const [modalStep, setModalStep] = useState<
        'unsavedChanges' | 'editVirtualView' | undefined
    >(hasUnsavedChanges ? 'unsavedChanges' : 'editVirtualView');

    const handleClearQuery = useCallback(() => {
        dispatch(
            explorerActions.clearQuery({
                defaultState,
                tableName,
            }),
        );
        // Clear state in URL params
        void navigate({ search: '' }, { replace: true });
    }, [dispatch, tableName, navigate]);

    const handleClose = () => {
        if (modalStep === 'editVirtualView') {
            setModalStep(undefined);
            onClose();
        }
    };

    if (modalStep === 'unsavedChanges') {
        return (
            <MantineModal
                opened={opened}
                onClose={onClose}
                title="You have unsaved changes"
                icon={IconAlertCircle}
                description="Are you sure you want to leave this page? Changes you've made to your query will not be saved."
                actions={
                    <Button
                        color="red"
                        onClick={() => {
                            startTransition(() => {
                                handleClearQuery();
                                setModalStep('editVirtualView');
                            });
                        }}
                        loading={isPending}
                    >
                        Discard & continue
                    </Button>
                }
            />
        );
    }

    return (
        <Modal.Root
            opened={opened && modalStep === 'editVirtualView'}
            onClose={handleClose}
            size="97vw"
            centered={false}
            yOffset="3vh"
            xOffset="2vw"
            closeOnClickOutside={false}
        >
            <Modal.Overlay />
            <Modal.Content>
                <Modal.Body p={0}>
                    <Suspense
                        fallback={
                            <Center h="95vh" w="95vw">
                                <Stack align="center" justify="center">
                                    <Loader type="bars" />
                                    <Text fw={500}>Loading SQL Runner...</Text>
                                </Stack>
                            </Center>
                        }
                    >
                        <SqlRunnerPage
                            isEditMode
                            virtualViewState={{
                                name: explore.name,
                                label: explore.label,
                                sql: explore.tables[activeTableName].sqlTable,
                                onCloseEditVirtualView: onClose,
                            }}
                        />
                    </Suspense>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
