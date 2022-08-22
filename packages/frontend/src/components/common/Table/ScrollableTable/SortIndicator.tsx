import { Icon, Tag } from '@blueprintjs/core';
import { FC } from 'react';
import { Sort } from '../types';

const SortIndicator: FC<Sort> = ({
    sortIndex,
    isMultiSort,
    isNumeric,
    sort,
}) => {
    const style = { marginLeft: '5px' };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {isMultiSort && (
                <Tag minimal style={style}>
                    {sortIndex + 1}
                </Tag>
            )}
            {sort.descending ? (
                <Icon
                    style={style}
                    icon={
                        !isNumeric
                            ? 'sort-alphabetical-desc'
                            : 'sort-numerical-desc'
                    }
                />
            ) : (
                <Icon
                    style={style}
                    icon={!isNumeric ? 'sort-alphabetical' : 'sort-numerical'}
                />
            )}
        </div>
    );
};

export default SortIndicator;
