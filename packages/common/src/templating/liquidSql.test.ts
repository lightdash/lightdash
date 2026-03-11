import {
    buildLiquidContext,
    renderLiquidSql,
    type FieldsContext,
} from './liquidSql';

describe('buildLiquidContext', () => {
    it('should nest parameters under ld.parameters and lightdash.parameters', () => {
        const context = buildLiquidContext({ grain: 'day' });
        expect(context).toEqual({
            ld: {
                parameters: { grain: 'day' },
                query: { fields: [], filters: [] },
            },
            lightdash: {
                parameters: { grain: 'day' },
                query: { fields: [], filters: [] },
            },
        });
    });

    it('should expose dotted names via both full and short keys', () => {
        const context = buildLiquidContext({ 'events.grain': 'week' });
        expect(context.ld.parameters).toEqual({
            'events.grain': 'week',
            grain: 'week',
        });
        expect(context.lightdash.parameters).toEqual({
            'events.grain': 'week',
            grain: 'week',
        });
    });

    it('should handle multiple parameters', () => {
        const context = buildLiquidContext({
            grain: 'day',
            currency: 'usd',
        });
        expect(context.ld.parameters).toEqual({
            grain: 'day',
            currency: 'usd',
        });
        expect(context.lightdash.parameters).toEqual({
            grain: 'day',
            currency: 'usd',
        });
    });

    it('should handle numeric parameter values', () => {
        const context = buildLiquidContext({ threshold: 42 });
        expect(context).toEqual({
            ld: {
                parameters: { threshold: 42 },
                query: { fields: [], filters: [] },
            },
            lightdash: {
                parameters: { threshold: 42 },
                query: { fields: [], filters: [] },
            },
        });
    });

    it('should derive query.fields and query.filters from fieldsContext', () => {
        const fieldsContext: FieldsContext = {
            events: {
                event_id: { inQuery: true, isFiltered: false },
                event: { inQuery: false, isFiltered: true },
                date: { inQuery: true, isFiltered: true },
            },
        };
        const context = buildLiquidContext({}, fieldsContext);
        expect(context.ld.query.fields).toEqual(
            expect.arrayContaining(['events.event_id', 'events.date']),
        );
        expect(context.ld.query.fields).toHaveLength(2);
        expect(context.ld.query.filters).toEqual(
            expect.arrayContaining(['events.event', 'events.date']),
        );
        expect(context.ld.query.filters).toHaveLength(2);
    });
});

describe('renderLiquidSql', () => {
    it('should pass through SQL without Liquid tags unchanged', () => {
        const sql = '"events".snapshot_date';
        expect(renderLiquidSql(sql, { grain: 'day' })).toBe(sql);
    });

    it('should evaluate simple if/else', () => {
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% else %}',
            '  "events".snapshot_week',
            '{% endif %}',
        ].join('\n');

        const result = renderLiquidSql(sql, { grain: 'day' });
        expect(result.trim()).toBe('"events".snapshot_date');
    });

    it('should evaluate elsif branch', () => {
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% elsif ld.parameters.grain == "week" %}',
            '  "events".snapshot_week',
            '{% elsif ld.parameters.grain == "month" %}',
            '  "events".snapshot_month',
            '{% else %}',
            '  "events".snapshot_date',
            '{% endif %}',
        ].join('\n');

        expect(renderLiquidSql(sql, { grain: 'week' }).trim()).toBe(
            '"events".snapshot_week',
        );
        expect(renderLiquidSql(sql, { grain: 'month' }).trim()).toBe(
            '"events".snapshot_month',
        );
    });

    it('should fall through to else when no condition matches', () => {
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% else %}',
            '  "events".snapshot_raw',
            '{% endif %}',
        ].join('\n');

        expect(renderLiquidSql(sql, { grain: 'unknown' }).trim()).toBe(
            '"events".snapshot_raw',
        );
    });

    it('should fall through to else with empty parameters', () => {
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% else %}',
            '  "events".snapshot_raw',
            '{% endif %}',
        ].join('\n');

        expect(renderLiquidSql(sql, {}).trim()).toBe('"events".snapshot_raw');
    });

    it('should handle full dynamic date granularity pattern', () => {
        const sql = [
            '{% if ld.parameters.date_granularity == "Day" %} ("events".snapshot_date)',
            '{% elsif ld.parameters.date_granularity == "Week" %} ("events".snapshot_week)',
            '{% elsif ld.parameters.date_granularity == "Month" %} ("events".snapshot_month)',
            '{% elsif ld.parameters.date_granularity == "Quarter" %} ("events".snapshot_quarter)',
            '{% elsif ld.parameters.date_granularity == "Year" %} ("events".snapshot_year)',
            '{% else %} ("events".snapshot_date)',
            '{% endif %}',
        ].join('\n');

        expect(renderLiquidSql(sql, { date_granularity: 'Day' }).trim()).toBe(
            '("events".snapshot_date)',
        );
        expect(
            renderLiquidSql(sql, { date_granularity: 'Quarter' }).trim(),
        ).toBe('("events".snapshot_quarter)');
        expect(renderLiquidSql(sql, { date_granularity: 'Year' }).trim()).toBe(
            '("events".snapshot_year)',
        );
    });

    it('should handle dotted parameter names from Lightdash format', () => {
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% else %}',
            '  "events".snapshot_week',
            '{% endif %}',
        ].join('\n');

        // Lightdash parameters may come as "model.param" — the short name should work
        expect(renderLiquidSql(sql, { 'events.grain': 'day' }).trim()).toBe(
            '"events".snapshot_date',
        );
    });

    it('should preserve ${ld.parameters.*} references for later substitution', () => {
        // Liquid blocks may coexist with Lightdash parameter references
        const sql = [
            '{% if ld.parameters.grain == "day" %}',
            '  ${ld.parameters.some_other_param}',
            '{% else %}',
            '  "events".fallback',
            '{% endif %}',
        ].join('\n');

        // The ${ld.parameters.*} should pass through — it uses $ not {% %}
        expect(renderLiquidSql(sql, { grain: 'day' }).trim()).toBe(
            '${ld.parameters.some_other_param}',
        );
    });

    it('should handle SQL with mixed content around Liquid blocks', () => {
        const sql =
            'SELECT {% if ld.parameters.grain == "day" %}"events".date{% else %}"events".week{% endif %} AS dynamic_col FROM events';

        expect(renderLiquidSql(sql, { grain: 'day' })).toBe(
            'SELECT "events".date AS dynamic_col FROM events',
        );
    });

    it('should support lightdash.parameters long syntax', () => {
        const sql = [
            '{% if lightdash.parameters.grain == "day" %}',
            '  "events".snapshot_date',
            '{% else %}',
            '  "events".snapshot_week',
            '{% endif %}',
        ].join('\n');

        expect(renderLiquidSql(sql, { grain: 'day' }).trim()).toBe(
            '"events".snapshot_date',
        );
    });

    it('should handle two-value column switching pattern', () => {
        const sql = [
            '{% if ld.parameters.weekend_treatment == "include" %}',
            '  ${TABLE}.first_response_time_hours',
            '{% else %}',
            '  ${TABLE}.first_response_time_weekday_hours',
            '{% endif %}',
        ].join('\n');

        expect(
            renderLiquidSql(sql, { weekend_treatment: 'include' }).trim(),
        ).toBe('${TABLE}.first_response_time_hours');
        expect(
            renderLiquidSql(sql, { weekend_treatment: 'exclude' }).trim(),
        ).toBe('${TABLE}.first_response_time_weekday_hours');
    });

    it('should evaluate case/when syntax', () => {
        const sql = [
            '{% case ld.parameters.date_granularity %}',
            '{% when "Day" %} ${TABLE}.date',
            '{% when "Week" %} DATE_TRUNC(\'week\', ${TABLE}.date)',
            '{% when "Month" %} DATE_TRUNC(\'month\', ${TABLE}.date)',
            '{% else %} ${TABLE}.date',
            '{% endcase %}',
        ].join('\n');

        expect(renderLiquidSql(sql, { date_granularity: 'Week' }).trim()).toBe(
            "DATE_TRUNC('week', ${TABLE}.date)",
        );
        expect(renderLiquidSql(sql, { date_granularity: 'Month' }).trim()).toBe(
            "DATE_TRUNC('month', ${TABLE}.date)",
        );
        expect(
            renderLiquidSql(sql, { date_granularity: 'unknown' }).trim(),
        ).toBe('${TABLE}.date');
    });

    it('should fall back to original SQL on malformed Liquid syntax', () => {
        const sql = '{% if ld.parameters.grain == "day" %} foo {% bad_tag %}';
        expect(renderLiquidSql(sql, { grain: 'day' })).toBe(sql);
    });

    it('should skip Liquid tags that do not reference ld.parameters', () => {
        // Non-Lightdash Liquid syntax should be returned as-is
        const sql = '{% if 1 == 1 %} foo {% else %} bar {% endif %}';
        expect(renderLiquidSql(sql, {})).toBe(sql);
    });

    it('should skip unrelated {% in SQL strings', () => {
        const sql = "SELECT '{%something%}' AS col";
        expect(renderLiquidSql(sql, { grain: 'day' })).toBe(sql);
    });
});

describe('renderLiquidSql with ld.query contains syntax', () => {
    it('should evaluate ld.query.fields contains (true)', () => {
        const sql = [
            '{% if ld.query.fields contains "events.event_id" %}',
            '  ${TABLE}.event_id',
            '{% else %}',
            '  NULL',
            '{% endif %}',
        ].join('\n');

        const fieldsContext: FieldsContext = {
            events: {
                event_id: { inQuery: true, isFiltered: false },
            },
        };

        expect(renderLiquidSql(sql, {}, fieldsContext).trim()).toBe(
            '${TABLE}.event_id',
        );
    });

    it('should evaluate ld.query.fields contains (false)', () => {
        const sql = [
            '{% if ld.query.fields contains "events.event_id" %}',
            '  ${TABLE}.event_id',
            '{% else %}',
            '  NULL',
            '{% endif %}',
        ].join('\n');

        const fieldsContext: FieldsContext = {
            events: {
                event_id: { inQuery: false, isFiltered: false },
            },
        };

        expect(renderLiquidSql(sql, {}, fieldsContext).trim()).toBe('NULL');
    });

    it('should evaluate ld.query.filters contains', () => {
        const sql = [
            '{% if ld.query.filters contains "events.event" %}',
            "  'Filtered'",
            '{% else %}',
            "  'All'",
            '{% endif %}',
        ].join('\n');

        const fieldsContext: FieldsContext = {
            events: {
                event: { inQuery: false, isFiltered: true },
            },
        };

        expect(renderLiquidSql(sql, {}, fieldsContext).trim()).toBe(
            "'Filtered'",
        );
    });

    it('should support lightdash.query long syntax', () => {
        const sql = [
            '{% if lightdash.query.fields contains "events.event_id" %}',
            '  ${TABLE}.event_id',
            '{% else %}',
            '  NULL',
            '{% endif %}',
        ].join('\n');

        const fieldsContext: FieldsContext = {
            events: {
                event_id: { inQuery: true, isFiltered: false },
            },
        };

        expect(renderLiquidSql(sql, {}, fieldsContext).trim()).toBe(
            '${TABLE}.event_id',
        );
    });

    it('should return false for empty fieldsContext', () => {
        const sql =
            '{% if ld.query.fields contains "events.event_id" %} col {% else %} NULL {% endif %}';
        expect(renderLiquidSql(sql, {}, {}).trim()).toBe('NULL');
    });

    it('should combine query fields and parameters in same SQL', () => {
        const sql = [
            '{% if ld.query.fields contains "events.event_id" %}',
            '  {% if ld.parameters.grain == "day" %}',
            "    DATE_TRUNC('day', ${TABLE}.event_date)",
            '  {% else %}',
            '    ${TABLE}.event_date',
            '  {% endif %}',
            '{% else %}',
            '  NULL',
            '{% endif %}',
        ].join('\n');

        const fieldsContext: FieldsContext = {
            events: {
                event_id: { inQuery: true, isFiltered: false },
            },
        };

        expect(
            renderLiquidSql(sql, { grain: 'day' }, fieldsContext).trim(),
        ).toBe("DATE_TRUNC('day', ${TABLE}.event_date)");
    });
});
