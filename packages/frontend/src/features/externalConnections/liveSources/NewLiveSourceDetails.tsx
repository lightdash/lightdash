import { Anchor, TextInput } from '@mantine/core';
import { type GetInputPropsReturnType } from '@mantine/form';
import { type FC } from 'react';
import { type useNewSourceId } from '../hooks/useNewSourceId';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';

const NEW_LIVE_SOURCE_FIELD_WIDTH = 240;

/** What a new source is called, the same rows as its settings. */
export const NewLiveSourceDetails: FC<{
    nameProps: GetInputPropsReturnType;
    /** Absent where the sign-in names the explores itself. */
    sourceId?: ReturnType<typeof useNewSourceId>;
}> = ({ nameProps, sourceId }) => (
    <SettingsCard title="Details">
        <SettingsRow label="Name" hint="Shown in explores">
            <TextInput
                w={NEW_LIVE_SOURCE_FIELD_WIDTH}
                size="xs"
                aria-label="Name"
                {...nameProps}
            />
        </SettingsRow>
        {sourceId ? (
            <SettingsRow
                label="Explore prefix"
                hint={
                    sourceId.error ? (
                        <>
                            {sourceId.error}
                            {sourceId.suggestion ? (
                                <>
                                    , try{' '}
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="inherit"
                                        onClick={() =>
                                            sourceId.suggestion &&
                                            sourceId.onChange(
                                                sourceId.suggestion,
                                            )
                                        }
                                    >
                                        {sourceId.suggestion}
                                    </Anchor>
                                </>
                            ) : null}
                        </>
                    ) : (
                        "Added to the start of each explore name, can't be changed later"
                    )
                }
            >
                <TextInput
                    w={NEW_LIVE_SOURCE_FIELD_WIDTH}
                    size="xs"
                    aria-label="Explore prefix"
                    value={sourceId.value}
                    error={sourceId.error !== null}
                    onChange={(event) =>
                        sourceId.onChange(event.currentTarget.value)
                    }
                />
            </SettingsRow>
        ) : null}
    </SettingsCard>
);
