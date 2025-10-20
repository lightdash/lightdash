import { convertToAiHints, Explore } from '@lightdash/common';
import { xmlBuilder } from '../xmlBuilder';

export const renderAvailableExplores = (explores: Explore[]) => (
    <explores>
        {explores.map((explore) => {
            const ahints = explore.aiHint
                ? convertToAiHints(explore.aiHint)
                : undefined;

            return (
                <explore tableName={explore.name} label={explore.label}>
                    {ahints && ahints.length > 0 && (
                        <aihints>
                            {ahints.map((hint) => (
                                <hint>{hint}</hint>
                            ))}
                        </aihints>
                    )}
                </explore>
            );
        })}
    </explores>
);
