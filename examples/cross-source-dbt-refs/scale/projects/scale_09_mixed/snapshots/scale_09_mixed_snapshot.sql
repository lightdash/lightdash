{% snapshot scale_09_mixed_snapshot %}
{{ config(strategy='check', check_cols='all', unique_key='id') }}
select * from {{ ref('scale_09_mixed_seed') }}
{% endsnapshot %}
