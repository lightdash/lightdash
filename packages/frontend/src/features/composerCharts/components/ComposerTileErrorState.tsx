import { Button, Code, Popover, ScrollArea } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';

const getLastLine = (message: string): string | null =>
    message
        .split('\n')
        .map((line) => line.trim())
        .findLast((line) => line.length > 0) ?? null;

type Props = {
    message: string;
    /** Screenshot view: summary only, nothing to expand */
    minimal: boolean;
};

/** A failed composer tile: the error's last line, the full text on request. */
export const ComposerTileErrorState: FC<Props> = ({ message, minimal }) => {
    const couldNotLoad = useUiString('tile.error.couldNotLoad');
    const showDetails = useUiString('tile.error.showDetails');
    const summary = getLastLine(message);
    const hasDetails =
        !minimal && summary !== null && summary !== message.trim();

    return (
        <SuboptimalState
            adaptive
            icon={IconAlertCircle}
            description={summary ?? couldNotLoad}
            data-testid="composer-chart-error"
            action={
                hasDetails && (
                    <Popover position="bottom" width={480} withinPortal>
                        <Popover.Target>
                            <Button variant="subtle" size="compact-xs">
                                {showDetails}
                            </Button>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <ScrollArea.Autosize mah={320}>
                                <Code block>{message}</Code>
                            </ScrollArea.Autosize>
                        </Popover.Dropdown>
                    </Popover>
                )
            }
        />
    );
};
