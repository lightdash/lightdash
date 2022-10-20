import * as peg from 'pegjs';
import { v4 as uuidv4 } from 'uuid';
import { UnexpectedServerError } from './errors';
import { FilterOperator, FilterRule } from './filter';

export type ParsedFilter = {
    type: string;
    values: any[];
    is?: boolean;
};

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
           values: [sequence.join('')]
       }
   }
   / sequence:raw_string {
    return {
        type:'${FilterOperator.EQUALS}',
        values: [sequence]
    }
}
PCT
=  CONTAINS / STARTS_WITH / ENDS_WITH / OTHER
CONTAINS
= PCT_SYMBOL value:string PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE)  {
  return {
      type: '${FilterOperator.INCLUDE}',
      values: [value]
    }
}
STARTS_WITH
= value:string PCT_SYMBOL !(string / PCT_SYMBOL / UNDERSCORE) {
      return {
      type: '${FilterOperator.STARTS_WITH}',
      values: [value]
  }
}
ENDS_WITH
=  PCT_SYMBOL value:string !(PCT_SYMBOL / UNDERSCORE) {
return {
     type: 'endsWith',
     values: [value]
 }
}
OTHER = value: $(string* (PCT_SYMBOL / UNDERSCORE) string*)+ {
 return {
     type: 'other',
     values: [value]
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

export const parseOperator = (
    operator: string,
    isTrue: boolean,
): FilterOperator => {
    switch (operator) {
        case FilterOperator.EQUALS:
            return isTrue ? FilterOperator.EQUALS : FilterOperator.NOT_EQUALS;
        case FilterOperator.INCLUDE:
            return isTrue ? FilterOperator.INCLUDE : FilterOperator.NOT_INCLUDE;
        case FilterOperator.STARTS_WITH:
            return FilterOperator.STARTS_WITH;
        case '>':
            return FilterOperator.GREATER_THAN;
        case '>=':
            return FilterOperator.GREATER_THAN_OR_EQUAL;
        case '<':
            return FilterOperator.LESS_THAN;
        case '<=':
            return FilterOperator.LESS_THAN_OR_EQUAL;

        default:
            throw new UnexpectedServerError(
                `Invalid filter operator type ${operator}`,
            );
    }
};

export const parseFilters = (
    rawFilters: Record<string, any>[] | undefined,
): FilterRule[] => {
    if (!rawFilters || rawFilters.length === 0) {
        return [];
    }
    const parser = peg.generate(filterGrammar);

    return rawFilters.reduce<FilterRule[]>((acc, filter) => {
        if (Object.entries(filter).length !== 1) return acc;

        const [key, value] = Object.entries(filter)[0];

        if (typeof value === 'string') {
            const parsedFilter: ParsedFilter = parser.parse(value);

            return [
                ...acc,
                {
                    id: uuidv4(),
                    target: { fieldId: key },
                    operator: parseOperator(
                        parsedFilter.type,
                        !!parsedFilter.is,
                    ),
                    values: parsedFilter.values,
                },
            ];
        }
        return [
            ...acc,
            {
                id: uuidv4(),
                target: { fieldId: key },
                operator: FilterOperator.EQUALS,
                values: [value],
            },
        ];
    }, []);
};

export default filterGrammar;
