{% set p = 'dyn_upstream' %}
select * from {{ ref(p, 'dim_a') }}
