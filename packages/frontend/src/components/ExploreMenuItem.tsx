import React from 'react';
import { friendlyName, SummaryExplore } from 'common';
import { Icon, Intent, MenuItem } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';

type ExploreMenuItemProps = {
    explore: SummaryExplore;
    onClick: () => void;
};

export const ExploreMenuItem: React.FC<ExploreMenuItemProps> = ({
    explore,
    onClick,
}: ExploreMenuItemProps) => {
    if ('errors' in explore) {
        const errorMessage = explore.errors
            .map((error) => error.message)
            .join('\n');
        return (
            <Tooltip2 content={errorMessage} targetTagName="div">
                <MenuItem
                    icon="database"
                    text={friendlyName(explore.name)}
                    disabled
                    labelElement={
                        <Icon icon="warning-sign" intent={Intent.WARNING} />
                    }
                />
            </Tooltip2>
        );
    }
    return (
        <MenuItem
            icon="database"
            text={friendlyName(explore.name)}
            onClick={onClick}
        />
    );
};
