import { FilterOperator } from './filter';

// PEG.js grammar for parsing dbt/YAML metric filter expressions (e.g. ">= 5",
// "inThePast 7 days", "%contains%"). The `FilterOperator` enum values are
// interpolated so the grammar and the operator enum can never drift apart.
//
// This string is the single source of truth for the parser. The runtime parser
// is precompiled from it into `filterGrammar.parser.ts` (an eval-free recursive
// descent parser) so the SDK bundle contains no `eval()`/`new Function()` — see
// `scripts/generateFilterGrammarParser.ts`. After editing this grammar, run
// `pnpm -F common generate:filter-grammar-parser` to regenerate the parser.
const filterGrammar = `ROOT
= EXPRESSION / EMPTY_STRING
EMPTY_STRING = '' {
    return {
      type: '${FilterOperator.EQUALS}',
      values: [],
      is: true,
    }
  }

EXPRESSION
= BETWEEN_DATE / BETWEEN_NUMERICAL / NUMERICAL / DATE_RESTRICTION / LIST / TERM

BETWEEN_DATE = SPACE_SYMBOL* ("between"i / "BETWEEN") SPACE_SYMBOL+ min:DATE_STRING SPACE_SYMBOL+ ("and"i / "AND") SPACE_SYMBOL+ max:DATE_STRING {
    return {
        type: '${FilterOperator.IN_BETWEEN}',
        values: [min, max],
        is: true
    }
   }

BETWEEN_NUMERICAL = SPACE_SYMBOL* ("between"i / "BETWEEN") SPACE_SYMBOL+ min:NUMBER SPACE_SYMBOL+ ("and"i / "AND") SPACE_SYMBOL+ max:NUMBER {
    return {
        type: '${FilterOperator.IN_BETWEEN}',
        values: [min, max],
        is: true
    }
   }

NUMERICAL = SPACE_SYMBOL* operator:OPERATOR SPACE_SYMBOL* value:NUMBER {
    return {
        type: operator,
        values: [value]
    }
   }

OPERATOR = '>=' / '<=' / '>' / '<'

DATE_STRING
  = quotation_mark date:ISO_DATE quotation_mark { return date }
  / ISO_DATE

ISO_DATE
  = year:YEAR "-" month:MONTH "-" day:DAY time:("T" TIME "Z"?)? {
      return text();
    }

YEAR = [0-9][0-9][0-9][0-9]
MONTH = ("0" [1-9]) / ("1" [0-2])
DAY = ("0" [1-9]) / ([1-2] [0-9]) / ("3" [0-1])
TIME = [0-9][0-9] ":" [0-9][0-9] ":" [0-9][0-9] ("." [0-9]+)?

DATE_RESTRICTION = SPACE_SYMBOL* operator:DATE_OPERATOR SPACE_SYMBOL* value:NUMBER SPACE_SYMBOL* interval:DATE_INTERVAL {
    return {
        type: operator,
        values: [value],
        date_interval: interval
    }
   }

DATE_OPERATOR = 'inThePast' / 'inTheNext'
DATE_INTERVAL = 'milliseconds' / 'seconds' / 'minutes' / 'hours' / 'days' / 'weeks' / 'months' / 'years'

NUMBER
  = '-'? FLOAT ([Ee] [+-]? INTEGER)?
    { return Number(text()) }

FLOAT
  = INTEGER '.'? INTEGER?

INTEGER
  = [0-9]+

LIST
= left:TERM COMMA right:EXPRESSION {
 return {
     type: ',',
       left: left,
       right: right
   }
}

TERM
=  not:(NOT)? term:(PCT / KEYWORDS / MATCH) {
    term.is = not ? false : true
    return term
   }



KEYWORDS = ("EMPTY" / "empty") {
    return {
        type: 'blank',
    }
}
/ ("NULL" / "null") {
    return {
        type: 'null',
    }
}
MATCH
= quotation_mark sequence:(char  / COMMA / UNDERSCORE / CARET)+ quotation_mark {
       return {
           type:'${FilterOperator.EQUALS}',
           values: [sequence.join('')]
       }
   }
   / sequence:(char  / COMMA / UNDERSCORE / CARET)+ {
    return {
        type:'${FilterOperator.EQUALS}',
        values: [sequence.join('')]
    }
}
PCT
=  CONTAINS / STARTS_WITH / ENDS_WITH
CONTAINS
= PCT_SYMBOL value:(char / UNDERSCORE)+ PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE)  {
  return {
      type: '${FilterOperator.INCLUDE}',
      values: [value.join('')]
    }
}
STARTS_WITH
= value:(char / UNDERSCORE)+ PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE) {
      return {
      type: '${FilterOperator.STARTS_WITH}',
      values: [value.join('')]
  }
}
ENDS_WITH
=  PCT_SYMBOL value:(char / UNDERSCORE)+ !(PCT_SYMBOL ) {
return {
     type: '${FilterOperator.ENDS_WITH}',
     values: [value.join('')]
 }
}
NOT = '!'
COMMA = COMMA_SYMBOL
raw_string "string"
= str:char_sequence { return str }
string "string"
= str:char_sequence { return str ? str.trim():str}
/* ----- 7. Strings ----- */
char_sequence "string"
= quotation_mark chars:(valid_char / escaped_quotation_mark)* quotation_mark {
  return '"' + chars.join("") + '"'
}
/
chars:char+ {return chars.join('') }
char "character"
=  ESCAPE_CARET
/ escape symbol:SYMBOLS { return symbol}
/ escape
sequence:(
      '"'
  / "\\\\"
  / "/"
  / "b" { return "\\b"; }
  / "f" { return "\\f"; }
  / "n" { return "\\n"; }
  / "r" { return "\\r"; }
  / "t" { return "\\t"; }
  / "u" digits:$(HEXDIG HEXDIG HEXDIG HEXDIG) {
      return String.fromCharCode(parseInt(digits, 16));
    }
)
{ return sequence }
/ unescaped
/ NOT_SYMBOL
/* Returns a single space for double escaped space at the end, or before a comma
to reverse escapeWithDoubleLastEscape */
ESCAPE_CARET
= CARET (SPACE_SYMBOL ! FOLLOWING_SPACE_END / ESCAPED_DOUBLE_SPACE) {
  return " "
}
/
CARET symbol:(PCT_SYMBOL / UNDERSCORE / COMMA_SYMBOL / CARET / NOT_SYMBOL) {
  return symbol
}
SYMBOLS = PCT_SYMBOL / COMMA_SYMBOL / NOT_SYMBOL / UNDERSCORE / CARET
PCT_SYMBOL 		        = '%'
UNDERSCORE 		        = '_'
COMMA_SYMBOL   	        = ","
NOT_SYMBOL	  	        = "-"
SPACE_SYMBOL            = " "
FOLLOWING_SPACE_END     = "^ " (&COMMA_SYMBOL / !.)
ESCAPED_DOUBLE_SPACE    = " ^ "
CARET 	   		        = "^"
escape         	        = "\\\\"
escaped_quotation_mark  = '\\\\"'
quotation_mark 	        = '"'
unescaped      	        = !SYMBOLS char:char_range { return char;}
valid_char              = char:char_range { return char;}
char_range              = [^\\0-\\x1F\\x22\\x5C]
HEXDIG                  = [0-9a-f]i


`;

export default filterGrammar;
