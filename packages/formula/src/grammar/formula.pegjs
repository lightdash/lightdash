{{
// Formula grammar — Google Sheets-like syntax → AST
// Supports: arithmetic, comparisons, logical ops, function calls, column refs, literals
}}

Formula
  = "=" _ expr:Expression _ { return expr; }

Expression
  = LogicalOr

LogicalOr
  = head:LogicalAnd tail:(_ "OR"i _ LogicalAnd)* {
      return tail.reduce((left, [, , , right]) => ({
        type: "Logical", op: "OR", left, right
      }), head);
    }

LogicalAnd
  = head:Comparison tail:(_ "AND"i _ Comparison)* {
      return tail.reduce((left, [, , , right]) => ({
        type: "Logical", op: "AND", left, right
      }), head);
    }

Comparison
  = left:Addition _ op:ComparisonOp _ right:Addition {
      return { type: "Comparison", op, left, right };
    }
  / Addition

ComparisonOp
  = "<>" / ">=" / "<=" / "=" / ">" / "<"

Addition
  = head:Multiplication tail:(_ ("+" / "-") _ Multiplication)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: "BinaryOp", op, left, right
      }), head);
    }

Multiplication
  = head:Power tail:(_ ("*" / "/" / "%") _ Power)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: "BinaryOp", op, left, right
      }), head);
    }

Power
  = head:UnaryExpr tail:(_ "^" _ UnaryExpr)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: "BinaryOp", op: "^", left, right
      }), head);
    }

UnaryExpr
  = "-" _ operand:UnaryExpr {
      return { type: "UnaryOp", op: "-", operand };
    }
  / "NOT"i _ operand:UnaryExpr {
      return { type: "UnaryOp", op: "NOT", operand };
    }
  / Primary

Primary
  = FunctionCall
  / "(" _ expr:Expression _ ")" { return expr; }
  / BooleanLiteral
  / NumberLiteral
  / StringLiteral
  / ColumnRef

FunctionCall
  = name:Identifier _ "(" _ content:FuncContent? _ ")" {
      const node = { type: "FunctionCall", name: name.toUpperCase(), args: [] };
      if (content) {
        node.args = content.args;
        if (content.windowClause) node.windowClause = content.windowClause;
      }
      return node;
    }

FuncContent
  = first:WindowClausePartFirst rest:WindowClausePart* {
      const wc = { type: "WindowClause" };
      const parts = [first, ...rest];
      for (const p of parts) {
        if (p.orderBy) wc.orderBy = p.orderBy;
        if (p.partitionBy) wc.partitionBy = p.partitionBy;
      }
      return { args: [], windowClause: wc };
    }
  / head:Expression tail:FuncContentTail* {
      const args = [head];
      let windowClause = undefined;
      for (const item of tail) {
        if (item._tag === 'arg') args.push(item.value);
        else {
          if (!windowClause) windowClause = { type: "WindowClause" };
          if (item.orderBy) windowClause.orderBy = item.orderBy;
          if (item.partitionBy) windowClause.partitionBy = item.partitionBy;
        }
      }
      const result = { args };
      if (windowClause) result.windowClause = windowClause;
      return result;
    }

FuncContentTail
  = _ "," _ "ORDER"i _ "BY"i _ col:Expression dir:(_ ("ASC"i / "DESC"i))? {
      return { _tag: 'window', orderBy: { column: col, direction: dir ? dir[1].toUpperCase() : undefined } };
    }
  / _ "," _ "PARTITION"i _ "BY"i _ col:Expression {
      return { _tag: 'window', partitionBy: col };
    }
  / _ "," _ expr:Expression {
      return { _tag: 'arg', value: expr };
    }

WindowClausePartFirst
  = "ORDER"i _ "BY"i _ col:Expression dir:(_ ("ASC"i / "DESC"i))? {
      return { orderBy: { column: col, direction: dir ? dir[1].toUpperCase() : undefined } };
    }
  / "PARTITION"i _ "BY"i _ col:Expression {
      return { partitionBy: col };
    }

WindowClausePart
  = _ "," _ "ORDER"i _ "BY"i _ col:Expression dir:(_ ("ASC"i / "DESC"i))? {
      return { orderBy: { column: col, direction: dir ? dir[1].toUpperCase() : undefined } };
    }
  / _ "," _ "PARTITION"i _ "BY"i _ col:Expression {
      return { partitionBy: col };
    }

ArgList
  = head:Expression tail:(_ "," _ Expression)* {
      return [head, ...tail.map(t => t[3])];
    }

ColumnRef
  = name:Identifier {
      return { type: "ColumnRef", name };
    }

Identifier
  = head:[A-Za-z_] tail:[A-Za-z0-9_]* { return head + tail.join(""); }

NumberLiteral
  = digits:([0-9]+ ("." [0-9]+)?) {
      const text = digits[0].join("") + (digits[1] ? "." + digits[1][1].join("") : "");
      return { type: "NumberLiteral", value: parseFloat(text) };
    }

StringLiteral
  = '"' chars:[^"]* '"' { return { type: "StringLiteral", value: chars.join("") }; }
  / "'" chars:[^']* "'" { return { type: "StringLiteral", value: chars.join("") }; }

BooleanLiteral
  = "TRUE"i { return { type: "BooleanLiteral", value: true }; }
  / "FALSE"i { return { type: "BooleanLiteral", value: false }; }

_ "whitespace"
  = [ \t\n\r]*
