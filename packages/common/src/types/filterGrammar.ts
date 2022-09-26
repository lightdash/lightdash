import { FilterOperator } from './filter';

export type ParsedFilter = {
    type: string;
    value: any[];
    is: boolean;
};
const filterGrammar = `ROOT
= EXPRESSION / EMPTY_STRING
EMPTY_STRING = '' {
    return {
      type: '${FilterOperator.EQUALS}',
      value: [],
      is: true, 
    }
  }

EXPRESSION
= NUMERICAL / LIST / TERM  


NUMERICAL = SPACE_SYMBOL* operator:OPERATOR SPACE_SYMBOL* value:NUMBER {
    return {
        type: operator,
        values: [value]
    }
   }

OPERATOR = '>=' / '<=' / '>' / '<'

NUMBER 
  = FLOAT ([Ee] [+-]? INTEGER)?
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
= quotation_mark sequence:(char / PCT_SYMBOL / COMMA / UNDERSCORE / CARET)+ quotation_mark {
       return {
           type:'${FilterOperator.EQUALS}',
           value: [sequence.join('')]
       }
   }
   / sequence:raw_string {
    return {
        type:'${FilterOperator.EQUALS}',
        value: [sequence]
    }
}
PCT
=  CONTAINS / STARTS_WITH / ENDS_WITH / OTHER
CONTAINS
= PCT_SYMBOL value:string PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE)  {
  return {
      type: '${FilterOperator.INCLUDE}',
      value: [value]
    }
}
STARTS_WITH
= value:string PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE) {
      return {
      type: '${FilterOperator.STARTS_WITH}',
      value: [value]
  }
}
ENDS_WITH
=  PCT_SYMBOL value:string !(PCT_SYMBOL / UNDERSCORE) {
return {
     type: 'endsWith',
     value: [value]
 }
}
OTHER = value: $(string* (PCT_SYMBOL / UNDERSCORE) string*)+ {
 return {
     type: 'other',
     value: [value]
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
