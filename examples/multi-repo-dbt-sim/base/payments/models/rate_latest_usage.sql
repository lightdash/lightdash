{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date
{% else %}
select id, label, amount, active, event_date
from {{ ref('merchants', 'rate') }}
{% endif %}
