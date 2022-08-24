import { Colors, Icon, Intent, MenuItem } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { InlineErrorType, SummaryExplore } from '@lightdash/common';
import React from 'react';

type ExploreMenuItemProps = {
    explore: SummaryExplore;
    onClick: () => void;
};

const NoDimensionsIcon = () => (
    <a
        role="button"
        href="https://docs.lightdash.com/guides/how-to-create-dimensions"
        target="_blank"
        rel="noreferrer"
        style={{ color: Colors.GRAY5 }}
    >
        <Icon icon="info-sign" />
    </a>
);

export const ExploreMenuItem: React.FC<ExploreMenuItemProps> = ({
    explore,
    onClick,
}: ExploreMenuItemProps) => {
    if ('errors' in explore) {
        const showNoDimensionsIcon = explore.errors.every(
            (error) => error.type === InlineErrorType.NO_DIMENSIONS_FOUND,
        );
        const errorMessage = explore.errors
            .map((error) => error.message)
            .join('\n');
        return (
            <Tooltip2 content={errorMessage} targetTagName="div">
                <MenuItem
                    icon="th"
                    text={explore.label}
                    disabled
                    labelElement={
                        showNoDimensionsIcon ? (
                            <NoDimensionsIcon />
                        ) : (
                            <Icon icon="warning-sign" intent={Intent.WARNING} />
                        )
                    }
                />
            </Tooltip2>
        );
    }
    return <MenuItem icon="th" text={explore.label} onClick={onClick} />;
};
