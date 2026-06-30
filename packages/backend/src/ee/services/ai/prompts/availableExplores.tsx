import { convertToAiHints, Explore } from '@lightdash/common';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import { xmlBuilder } from '../xmlBuilder';

export const renderAvailableExplores = (explores: Explore[]) => (
    <explores>
        {explores.map((explore) => {
            const ahints = explore.aiHint
                ? convertToAiHints(explore.aiHint)
                : undefined;
            const requiredFilters = getExploreRequiredFilters(explore);

            return (
                <explore tableName={explore.name} label={explore.label}>
                    {ahints && ahints.length > 0 && (
                        <aihints>
                            {ahints.map((hint) => (
                                <hint>{hint}</hint>
                            ))}
                        </aihints>
                    )}
                    {requiredFilters.length > 0 && (
                        <requiredFilters count={requiredFilters.length}>
                            {requiredFilters.map((filter) => (
                                <filter
                                    fieldId={filter.fieldId}
                                    fieldRef={filter.fieldRef}
                                    tableName={filter.tableName}
                                    operator={filter.operator}
                                    values={JSON.stringify(filter.values ?? [])}
                                    settings={
                                        filter.settings
                                            ? JSON.stringify(filter.settings)
                                            : undefined
                                    }
                                    required={filter.required}
                                />
                            ))}
                        </requiredFilters>
                    )}
                </explore>
            );
        })}
    </explores>
);
