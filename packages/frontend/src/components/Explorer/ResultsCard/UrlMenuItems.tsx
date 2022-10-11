import { Icon } from '@blueprintjs/core';
import { MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import { FieldUrl, renderTemplatedUrl, ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

const UrlMenuItems: FC<{
    urls: FieldUrl[] | undefined;
    cell: Cell<ResultRow, ResultRow[0]>;
}> = ({ urls, cell }) => {
    const { track } = useTracking();

    const value: ResultRow[0]['value'] = cell.getValue()?.value || {};
    return (
        <>
            {(urls || []).map((urlConfig) => {
                let parsedUrl: string | undefined = undefined;
                let error: string | undefined = undefined;
                try {
                    parsedUrl = renderTemplatedUrl(
                        urlConfig.url,
                        {
                            raw: value.raw,
                            formatted: value.formatted,
                        },
                        cell.row.original,
                    );
                } catch (e) {
                    error = `${e}`;
                }
                return (
                    <MenuItem2
                        key={`url_entry_${urlConfig.label}`}
                        icon="open-application"
                        text={urlConfig.label}
                        labelElement={
                            error && (
                                <Tooltip2
                                    content={
                                        <>
                                            <p>
                                                Error parsing the url template:{' '}
                                                {urlConfig.url}
                                            </p>
                                            <p>{error}</p>
                                        </>
                                    }
                                >
                                    <Icon icon="issue" />
                                </Tooltip2>
                            )
                        }
                        disabled={!parsedUrl}
                        onClick={() => {
                            track({
                                name: EventName.GO_TO_LINK_CLICKED,
                            });
                            window.open(parsedUrl, '_blank');
                        }}
                    />
                );
            })}
        </>
    );
};

export default UrlMenuItems;
