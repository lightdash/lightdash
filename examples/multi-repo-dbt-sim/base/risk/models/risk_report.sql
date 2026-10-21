{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date
{% else %}
select r.id, r.label, (r.amount + f.amount)::numeric as amount, r.active, r.event_date
from {{ ref('risk_base') }} r
join {{ ref('finance', 'finance_base') }} f on r.id = f.id
{% endif %}
