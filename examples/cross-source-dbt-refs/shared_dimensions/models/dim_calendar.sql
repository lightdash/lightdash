{% if target.type == 'bigquery' %}
select
    day as calendar_date,
    extract(year from day) as calendar_year,
    extract(month from day) as calendar_month,
    format_date('%A', day) as day_name,
    extract(dayofweek from day) in (1, 7) as is_weekend
from unnest(generate_date_array('2024-01-01', '2024-12-31', interval 1 day)) as day
{% else %}
select
    day::date as calendar_date,
    extract(year from day)::integer as calendar_year,
    extract(month from day)::integer as calendar_month,
    to_char(day, 'Day') as day_name,
    extract(isodow from day) in (6, 7) as is_weekend
from generate_series('2024-01-01'::date, '2024-12-31'::date, interval '1 day') as day
{% endif %}
