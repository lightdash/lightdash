{% macro upstream_ref(name) %}
{{ return(ref('dyn_upstream', name)) }}
{% endmacro %}
