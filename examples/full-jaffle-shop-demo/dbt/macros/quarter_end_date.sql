{% macro quarter_end_date(quarter_start_column) %}
  {% if target.type == 'bigquery' %}
    DATE_ADD(DATE_ADD({{ quarter_start_column }}, INTERVAL 3 MONTH), INTERVAL -1 DAY)
  {% elif target.type == 'postgres' or target.type == 'redshift' %}
    ({{ quarter_start_column }} + INTERVAL '3 months' - INTERVAL '1 day')::date
  {% elif target.type == 'snowflake' %}
    DATEADD(day, -1, DATEADD(month, 3, {{ quarter_start_column }}))
  {% else %}
    {{ exceptions.raise_compiler_error("Unsupported database type: " ~ target.type) }}
  {% endif %}
{% endmacro %}