{# August-start school year label, e.g. '2025-2026' #}
{% macro school_year(col) -%}
case
    when extract(month from {{ col }}) >= 8
        then cast(cast(extract(year from {{ col }}) as integer) as text) || '-' || cast(cast(extract(year from {{ col }}) as integer) + 1 as text)
    else cast(cast(extract(year from {{ col }}) as integer) - 1 as text) || '-' || cast(cast(extract(year from {{ col }}) as integer) as text)
end
{%- endmacro %}
