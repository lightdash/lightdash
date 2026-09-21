import { Button, Group } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    /** Danger copy discards the build; info copy tells it survives. */
    exitDiscardsBuild: boolean;
    onKeepBuilding: () => void;
    onConfirmExit: () => void;
};

/** The confirm shown when leaving Chart Studio mid-build. Render only while
 *  the confirm is open; every host shares this exact copy and layout. */
const BuildInProgressExitModal: FC<Props> = ({
    exitDiscardsBuild,
    onKeepBuilding,
    onConfirmExit,
}) => (
    <MantineModal opened onClose={onKeepBuilding} title="Build in progress">
        <Callout variant={exitDiscardsBuild ? 'danger' : 'info'} mb="md">
            {exitDiscardsBuild
                ? 'Leaving now discards the build that is still running.'
                : 'The build keeps running and lands in version history when it finishes.'}
        </Callout>
        <Group justify="flex-end">
            <Button variant="default" onClick={onKeepBuilding}>
                Keep building
            </Button>
            <Button
                color={exitDiscardsBuild ? 'red' : undefined}
                onClick={onConfirmExit}
            >
                {exitDiscardsBuild ? 'Discard and leave' : 'Leave'}
            </Button>
        </Group>
    </MantineModal>
);

export default BuildInProgressExitModal;
