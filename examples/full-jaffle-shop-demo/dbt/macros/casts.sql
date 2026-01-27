{# Cast to numeric/double #}
{% macro cast_numeric(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS DOUBLE)
  {% else %}
    {{ column }}::numeric
  {% endif %}
{% endmacro %}

{# Cast to date #}
{% macro cast_date(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS DATE)
  {% else %}
    {{ column }}::date
  {% endif %}
{% endmacro %}

{# Cast to timestamp #}
{% macro cast_timestamp(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS TIMESTAMP)
  {% else %}
    {{ column }}::timestamp
  {% endif %}
{% endmacro %}

{# Cast to integer #}
{% macro cast_integer(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS INTEGER)
  {% else %}
    {{ column }}::integer
  {% endif %}
{% endmacro %}

{# Cast to boolean #}
{% macro cast_boolean(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS BOOLEAN)
  {% else %}
    {{ column }}::boolean
  {% endif %}
{% endmacro %}

{# Cast to time - Athena doesn't support TIME type, use VARCHAR #}
{% macro cast_time(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS VARCHAR)
  {% else %}
    {{ column }}::time
  {% endif %}
{% endmacro %}

{# Cast to json - Athena uses JSON type but different syntax #}
{% macro cast_json(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS JSON)
  {% else %}
    {{ column }}::json
  {% endif %}
{% endmacro %}

{# Cast to decimal #}
{% macro cast_decimal(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS DOUBLE)
  {% else %}
    {{ column }}::decimal
  {% endif %}
{% endmacro %}

{# Date difference in days #}
{% macro date_diff_days(date1, date2) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    DATE_DIFF('day', CAST({{ date2 }} AS DATE), CAST({{ date1 }} AS DATE))
  {% else %}
    ({{ date1 }}::date - {{ date2 }}::date)
  {% endif %}
{% endmacro %}

{# Timestamp difference in days #}
{% macro timestamp_diff_days(ts1, ts2) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    DATE_DIFF('day', CAST({{ ts2 }} AS TIMESTAMP), CAST({{ ts1 }} AS TIMESTAMP))
  {% else %}
    EXTRACT(day FROM {{ ts1 }}::timestamp - {{ ts2 }}::timestamp)
  {% endif %}
{% endmacro %}

{# Age in years - PostgreSQL age() function equivalent #}
{% macro age_years(date_col) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    DATE_DIFF('year', CAST({{ date_col }} AS DATE), CURRENT_DATE)
  {% else %}
    date_part('year', age(current_date, {{ date_col }}::date))
  {% endif %}
{% endmacro %}

{# Cast to float #}
{% macro cast_float(column) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    CAST({{ column }} AS DOUBLE)
  {% else %}
    {{ column }}::float
  {% endif %}
{% endmacro %}

{# Extract string from JSON - PostgreSQL ->>'key' works on both json and jsonb #}
{# Wrapped in parentheses to ensure correct operator precedence when casting result #}
{% macro json_extract_string(column, key) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    JSON_EXTRACT_SCALAR(CAST({{ column }} AS JSON), '$.{{ key }}')
  {% else %}
    ({{ column }}->>'{{ key }}')
  {% endif %}
{% endmacro %}

{# Unsupported feature placeholder #}
{% macro unsupported(feature_name) %}
  {% if target.type == 'trino' or target.type == 'athena' %}
    NULL {# {{ feature_name }} not supported in Athena/Trino #}
  {% else %}
    {{ caller() }}
  {% endif %}
{% endmacro %}
