import { registerAction } from 'echarts';

export const SERIES_FOCUS_ACTION = 'lightdashSeriesFocus';
const MUTED_STATE = 'lightdash-muted-series';
const MUTED_OPACITY = 0.22;

// ECharts preserves custom states when its axis pointer changes native
// emphasis/blur. This state therefore has one owner: the tooltip controller.
registerAction(
    {
        type: SERIES_FOCUS_ACTION,
        event: 'lightdashseriesfocus',
        update: 'none',
    },
    (payload, model, api) => {
        model.eachSeries((series) => {
            const muted =
                typeof payload.seriesIndex === 'number' &&
                series.seriesIndex !== payload.seriesIndex;
            api.getViewOfSeriesModel(series).group.traverse((element) => {
                for (const target of [
                    element,
                    element.getTextContent(),
                    element.getTextGuideLine(),
                ]) {
                    if (!target || !('style' in target)) continue;
                    // Restore authored opacity before deriving the muted value.
                    // useStates([]) drops noAnimation, so the fade is sampled and compounds.
                    const remainingStates = (target.currentStates ?? []).filter(
                        (state) => state !== MUTED_STATE,
                    );
                    if (remainingStates.length === 0) {
                        target.clearStates(true);
                    } else {
                        target.useStates(remainingStates, true);
                    }
                    if (muted) {
                        const style = target.style as { opacity?: number };
                        Object.assign(target.ensureState(MUTED_STATE), {
                            style: {
                                opacity: (style.opacity ?? 1) * MUTED_OPACITY,
                            },
                        });
                        target.useState(MUTED_STATE, true, true);
                    }
                }
            });
        });
    },
);
