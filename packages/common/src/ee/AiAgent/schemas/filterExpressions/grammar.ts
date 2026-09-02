import { filterExpressionOperatorDefinitions } from './operators';

export const FILTER_EXPRESSION_MIXED_CONNECTORS_CODE =
    'FILTER_EXPRESSION_MIXED_CONNECTORS';
export const FILTER_EXPRESSION_MIXED_CONNECTORS_MESSAGE =
    'A flat filter expression cannot mix AND and OR connectors.';

const getOperatorAlternatives = (syntax: 'presence' | 'values'): string =>
    filterExpressionOperatorDefinitions
        .filter((definition) => definition.syntax === syntax)
        .map(({ operator }) => operator)
        .sort((left, right) => right.length - left.length)
        .map((operator) => `"${operator}"`)
        .join(' / ');

const presenceOperators = getOperatorAlternatives('presence');
const valueOperators = getOperatorAlternatives('values');

export const filterExpressionGrammar = String.raw`{
  function node(kind, value, span) {
    return { kind: kind, value: value, span: span };
  }
}

START
  = _ expression:EXPRESSION _ !. { return expression; }

EXPRESSION
  = first:RULE rest:(__ connector:CONNECTOR __ rule:RULE {
      return { connector: connector, rule: rule };
    })* {
      var connector = null;
      for (var index = 0; index < rest.length; index += 1) {
        if (connector === null) {
          connector = rest[index].connector.value;
        } else if (connector !== rest[index].connector.value) {
          return {
            kind: "parseError",
            code: ${JSON.stringify(FILTER_EXPRESSION_MIXED_CONNECTORS_CODE)},
            message: ${JSON.stringify(FILTER_EXPRESSION_MIXED_CONNECTORS_MESSAGE)},
            span: rest[index].connector.span
          };
        }
      }
      var rules = [first].concat(rest.map(function (item) { return item.rule; }));
      return {
        kind: "expression",
        connector: connector,
        rules: rules,
        span: { start: first.span.start, end: rules[rules.length - 1].span.end }
      };
    }

RULE
  = PRESENCE_RULE
  / VALUE_RULE

PRESENCE_RULE
  = field:FIELD __ operator:PRESENCE_OPERATOR !(_ "=") {
      return {
        kind: "rule",
        field: field,
        operator: operator,
        arguments: [],
        span: { start: field.span.start, end: operator.span.end }
      };
    }

VALUE_RULE
  = field:FIELD __ operator:VALUE_OPERATOR _ "=" _ values:ARGUMENTS settings:(_ value:SETTINGS { return value; })? {
      var rule = {
        kind: "rule",
        field: field,
        operator: operator,
        arguments: values,
        span: {
          start: field.span.start,
          end: settings === null
            ? values[values.length - 1].span.end
            : settings.span.end
        }
      };
      if (settings !== null) {
        rule.settings = settings;
      }
      return rule;
    }

SETTINGS
  = "{" _ first:SETTING rest:(_ "," _ setting:SETTING { return setting; })* _ "}" {
      return {
        kind: "settings",
        entries: [first].concat(rest),
        span: location()
      };
    }

SETTING
  = name:SETTING_NAME _ ":" _ value:SCALAR {
      return {
        kind: "setting",
        name: name,
        value: value,
        span: { start: name.span.start, end: value.span.end }
      };
    }

SETTING_NAME
  = value:$([A-Za-z] [A-Za-z0-9_]*) {
      return node("settingName", value, location());
    }

FIELD
  = QUOTED_FIELD
  / SAFE_FIELD

SAFE_FIELD
  = !RESERVED_CONNECTOR value:$([A-Za-z0-9_.-]+) {
      return node("field", value, location());
    }

QUOTED_FIELD
  = "\x60" characters:(FIELD_CHARACTER)+ "\x60" {
      return node("field", characters.join(""), location());
    }

FIELD_CHARACTER
  = ESCAPE
  / value:[^\x00-\x1F\\\x60] { return value; }

PRESENCE_OPERATOR
  = value:(${presenceOperators}) !IDENTIFIER_CHARACTER {
      return node("operator", value, location());
    }

VALUE_OPERATOR
  = value:(${valueOperators}) !IDENTIFIER_CHARACTER {
      return node("operator", value, location());
    }

CONNECTOR
  = value:("AND"i / "OR"i) !IDENTIFIER_CHARACTER {
      return node("connector", value.toLowerCase(), location());
    }

RESERVED_CONNECTOR
  = ("AND"i / "OR"i) !IDENTIFIER_CHARACTER

IDENTIFIER_CHARACTER
  = [A-Za-z0-9_.-]

ARGUMENTS
  = first:SCALAR rest:(_ "," _ scalar:SCALAR { return scalar; })* {
      return [first].concat(rest);
    }

SCALAR
  = BARE_NULL
  / SINGLE_QUOTED_SCALAR
  / DOUBLE_QUOTED_SCALAR
  / BARE_SCALAR

BARE_NULL
  = value:$("null"i) !BARE_CHARACTER {
      return node("bareNull", value, location());
    }

BARE_SCALAR
  = !RESERVED_SCALAR value:$((!BARE_DELIMITER .)+) {
      return node("bare", value, location());
    }

RESERVED_SCALAR
  = ("AND"i / "OR"i / "null"i) !BARE_CHARACTER

BARE_CHARACTER
  = !BARE_DELIMITER .

BARE_DELIMITER
  = [ \t\r\n,{}()'"=\\]

SINGLE_QUOTED_SCALAR
  = "'" characters:SINGLE_QUOTED_CHARACTER* "'" {
      return node("quoted", characters.join(""), location());
    }

SINGLE_QUOTED_CHARACTER
  = ESCAPE
  / value:[^\x00-\x1F'\\] { return value; }

DOUBLE_QUOTED_SCALAR
  = '"' characters:DOUBLE_QUOTED_CHARACTER* '"' {
      return node("quoted", characters.join(""), location());
    }

DOUBLE_QUOTED_CHARACTER
  = ESCAPE
  / value:[^\x00-\x1F"\\] { return value; }

ESCAPE
  = "\\" sequence:(
      "'"
    / '"'
    / "\x60"
    / "\\"
    / "/"
    / "b" { return "\b"; }
    / "f" { return "\f"; }
    / "n" { return "\n"; }
    / "r" { return "\r"; }
    / "t" { return "\t"; }
    / "u" digits:$([0-9a-f]i [0-9a-f]i [0-9a-f]i [0-9a-f]i) {
        return String.fromCharCode(parseInt(digits, 16));
      }
    ) { return sequence; }

_ = [ \t\r\n]*
__ = [ \t\r\n]+
`;
