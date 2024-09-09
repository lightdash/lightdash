import { Button, Input, useMantineTheme } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

const Content: FC = () => {
    const theme = useMantineTheme();

    const name = useAppSelector((state) => state.semanticViewer.name);
    const dispatch = useAppDispatch();

    const handleOpenSaveModal = () => {
        dispatch(updateSaveModalOpen(true));
    };

    return (
        <>
            <Input
                w="100%"
                placeholder="Untitled chart"
                value={name}
                onChange={(e) => {
                    dispatch(updateName(e.currentTarget.value));
                }}
                styles={{
                    input: {
                        background: 'transparent',
                        border: 0,

                        '&:hover': {
                            background: theme.colors.gray[2],
                        },
                        '&:focus': {
                            background: theme.colors.gray[3],
                        },
                    },
                }}
            />

            <Button
                p={0}
                leftIcon={<MantineIcon icon={IconDeviceFloppy} />}
                variant="link"
                color="black"
                onClick={handleOpenSaveModal}
            >
                Save
            </Button>
        </>
    );
};

export default Content;
