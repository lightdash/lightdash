import { CloseButton, Text } from '@mantine/core';
import { IconCode, IconColumns } from '@tabler/icons-react';
import { type FC } from 'react';
import { TableIcon } from '../../../../../components/common/ContentIcons';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { KindTypeIcon } from '../../../../../features/semanticStudio/KindTypeIcon';
import { type StudioChatRef } from '../../../../../features/semanticStudio/studioChatRefs';
import classes from './SemanticStudioAgent.module.css';

/** What the next message is about, dragged in or added from a field. */
export const StudioChatRefChips: FC<{
    refs: StudioChatRef[];
    onRemove: (ref: StudioChatRef) => void;
}> = ({ refs, onRemove }) =>
    refs.length === 0 ? null : (
        <div
            className={classes.refChips}
            aria-label="Added to the next message"
        >
            {refs.map((ref) => {
                const name = ref.code
                    ? `${ref.code.path.split('/').pop()} ${ref.code.from}-${ref.code.to}`
                    : (ref.fieldLabel ?? ref.modelLabel);
                return (
                    <span
                        key={`${ref.modelName}:${ref.fieldName ?? ''}:${ref.code?.from ?? ''}-${ref.code?.to ?? ''}`}
                        title={ref.code?.path}
                        className={classes.refChip}
                    >
                        {ref.fieldName && ref.fieldKind ? (
                            <KindTypeIcon
                                fieldKind={ref.fieldKind}
                                type={ref.fieldType ?? ''}
                                name={ref.fieldName}
                            />
                        ) : (
                            <MantineIcon
                                icon={
                                    ref.code
                                        ? IconCode
                                        : ref.fieldName
                                          ? IconColumns
                                          : TableIcon
                                }
                                size={12}
                            />
                        )}
                        {ref.fieldLabel ? (
                            <Text component="span" className={classes.refModel}>
                                {ref.modelLabel}
                            </Text>
                        ) : null}
                        <Text component="span" className={classes.refName}>
                            {name}
                        </Text>
                        <CloseButton
                            size="xs"
                            aria-label={`Remove ${name}`}
                            onClick={() => onRemove(ref)}
                        />
                    </span>
                );
            })}
        </div>
    );
