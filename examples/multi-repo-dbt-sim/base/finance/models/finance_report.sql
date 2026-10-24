{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date
{% else %}
select f.id, f.label, (f.amount + r.amount)::numeric as amount, f.active, f.event_date
from {{ ref('finance_base') }} f
join {{ ref('risk', 'risk_base') }} r on f.id = r.id
{% endif %}
