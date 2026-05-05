{
  const zeroArgFns = options.zeroArgFns;
  const singleArgFns = options.singleArgFns;
  const oneOrTwoArgFns = options.oneOrTwoArgFns;
  const twoArgFns = options.twoArgFns;
  const threeArgFns = options.threeArgFns;
  const zeroOrOneArgFns = options.zeroOrOneArgFns;
  const variadicFns = options.variadicFns;
  const windowFns = options.windowFns;
  const movingWindowFns = options.movingWindowFns;
  const conditionalAggFns = options.conditionalAggFns;
  const dateFns = options.dateFns;
  const dateUnits = options.dateUnits;
  const allFunctionNames = options.allFunctionNames;
  const booleanFns = options.booleanFns;
}

Formula
  = "=" _ expr:Expression _ { return expr; }

Expression
  = BooleanOr
  / Arithmetic

// --- Boolean layer (OR > AND > comparison/leaf) ---

BooleanOr
  = head:BooleanAnd tail:(_ "OR"i _ BooleanAnd)* {
      return tail.reduce((left, [, , , right]) => ({
        type: "Logical", op: "OR", left, right
      }), head);
    }

BooleanAnd
  = head:BooleanAtom tail:(_ "AND"i _ BooleanAtom)* {
      return tail.reduce((left, [, , , right]) => ({
        type: "Logical", op: "AND", left, right
      }), head);
    }

BooleanAtom
  // NOT must be tried before Comparison: PEG is first-match-wins, and
  // `NOT(expr)` otherwise falls through `Comparison → Arithmetic → Primary
  // → InvalidFn`, which throws "Unknown function: NOT" before the unary
  // NOT rule ever gets a chance. Trying NOT first lets both
  // `=NOT A > 100` and `=NOT(A > 100)` parse.
  = "NOT"i _ operand:BooleanAtom {
      return { type: "UnaryOp", op: "NOT", operand };
    }
  / Comparison
  / BooleanFn
  / "(" _ expr:BooleanOr _ ")" { return expr; }
  / BooleanLiteral

Comparison
  = left:Arithmetic _ op:ComparisonOp _ right:Arithmetic {
      return { type: "Comparison", op, left, right };
    }

ComparisonOp
  = "<>" / ">=" / "<=" / "=" / ">" / "<"

BooleanFn
  = name:Identifier &{ return booleanFns.includes(name.toUpperCase()); }
    _ "(" _ arg:Expression _ ")" {
      return { type: "SingleArgFn", name: name.toUpperCase(), arg };
    }

// --- Arithmetic layer ---

Arithmetic
  = Addition

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
  / Primary

// --- Primary (function calls, literals, refs) ---

Primary
  = IfExpr
  / CaseExpr
  / ConditionalAggregate
  / CountIf
  / CountDistinctExpr
  / DateTruncExpr
  / DateAddOrSubExpr
  / DateDiffExpr
  / MovingWindowFn
  / ZeroArgFn
  / SingleArgFn
  / OneOrTwoArgFn
  / TwoArgFn
  / ThreeArgFn
  / ZeroOrOneArgFn
  / VariadicFn
  / WindowFn
  / InvalidFn
  / "(" _ expr:Expression _ ")" { return expr; }
  / NumberLiteral
  / StringLiteral
  / ColumnRef

// --- Dedicated function rules ---

IfExpr
  = "IF"i _ "(" _ condition:BooleanOr _ "," _ then:Expression _ else_:(_ "," _ Expression)? _ ")" {
      return { type: "If", condition, then, "else": else_ ? else_[3] : null };
    }

// Searched CASE (CASE WHEN c1 THEN v1 [WHEN c2 THEN v2]* [ELSE v] END)
// desugars to nested `If` nodes at parse time so the AST and per-dialect
// codegen are identical to a hand-written nested IF.
CaseExpr
  = "CASE"i _ first:WhenClause rest:(_ WhenClause)* elseClause:(_ "ELSE"i _ Expression)? _ "END"i {
      const clauses = [first, ...rest.map(r => r[1])];
      const else_ = elseClause ? elseClause[3] : null;
      return clauses.reduceRight(
        (acc, c) => ({ type: "If", condition: c.condition, then: c.then, "else": acc }),
        else_
      );
    }

WhenClause
  = "WHEN"i _ condition:BooleanOr _ "THEN"i _ then:Expression {
      return { condition, then };
    }

ConditionalAggregate
  = name:Identifier &{ return conditionalAggFns.includes(name.toUpperCase()); }
    _ "(" _ value:Expression _ "," _ condition:BooleanOr _ ")" {
      return { type: "ConditionalAggregate", name: name.toUpperCase(), value, condition };
    }

CountIf
  = "COUNTIF"i _ "(" _ condition:BooleanOr _ ")" {
      return { type: "CountIf", condition };
    }

// COUNT(DISTINCT expr) is parsed as a dedicated AST node rather than smuggling
// a `distinct` flag onto ZeroOrOneArgFn — keeps the AST shape per node strict.
// Must be tried before the generic ZeroOrOneArgFn rule (which would otherwise
// fail at the DISTINCT token and bubble through to InvalidFn).
CountDistinctExpr
  = "COUNT"i _ "(" _ "DISTINCT"i _ arg:Expression _ ")" {
      return { type: "CountDistinct", arg };
    }

// DATE_TRUNC("unit", date) — first arg must be a whitelisted string literal.
// Validated at parse time so bad units fail fast with a specific error rather
// than producing invalid SQL (or, worse, valid SQL that rounds to the wrong
// period).
DateTruncExpr
  = "DATE_TRUNC"i _ "(" _ first:Expression _ "," _ arg:Expression _ ")" {
      if (first.type !== "StringLiteral") {
        error('DATE_TRUNC first argument must be a string literal unit like "month"');
      }
      const unit = first.value.toLowerCase();
      if (!dateUnits.includes(unit)) {
        error('DATE_TRUNC unit must be one of: ' + dateUnits.join(', ') + '. Got: "' + first.value + '"');
      }
      return { type: "DateFn", name: "DATE_TRUNC", unit, args: [arg] };
    }

// DATE_ADD(date, n, "unit") / DATE_SUB(date, n, "unit") — third arg must be a
// whitelisted string literal. DATE_SUB desugars to DATE_ADD with n wrapped in
// UnaryOp('-') so the AST + codegen only deal with DATE_ADD.
DateAddOrSubExpr
  = name:Identifier &{ return name.toUpperCase() === 'DATE_ADD' || name.toUpperCase() === 'DATE_SUB'; }
    _ "(" _ date:Expression _ "," _ n:Expression _ "," _ unitArg:Expression _ ")" {
      const fnName = name.toUpperCase();
      if (unitArg.type !== "StringLiteral") {
        error(fnName + ' third argument must be a string literal unit like "month"');
      }
      const unit = unitArg.value.toLowerCase();
      if (!dateUnits.includes(unit)) {
        error(fnName + ' unit must be one of: ' + dateUnits.join(', ') + '. Got: "' + unitArg.value + '"');
      }
      const nArg = fnName === 'DATE_SUB'
        ? { type: "UnaryOp", op: "-", operand: n }
        : n;
      return { type: "DateFn", name: "DATE_ADD", unit, args: [date, nArg] };
    }

// DATE_DIFF(start, end, "unit") — whole-unit calendar-boundary difference,
// positive when end > start. Third arg must be a whitelisted string literal
// validated at parse time.
DateDiffExpr
  = "DATE_DIFF"i _ "(" _ start:Expression _ "," _ end:Expression _ "," _ unitArg:Expression _ ")" {
      if (unitArg.type !== "StringLiteral") {
        error('DATE_DIFF third argument must be a string literal unit like "month"');
      }
      const unit = unitArg.value.toLowerCase();
      if (!dateUnits.includes(unit)) {
        error('DATE_DIFF unit must be one of: ' + dateUnits.join(', ') + '. Got: "' + unitArg.value + '"');
      }
      return { type: "DateFn", name: "DATE_DIFF", unit, args: [start, end] };
    }

// `n` is a parse-time positive integer literal, lifted onto `preceding`.
MovingWindowFn
  = name:Identifier &{ return movingWindowFns.includes(name.toUpperCase()); }
    _ "(" _ arg:Expression _ "," _ n:Expression rest:WindowClausePart* _ ")" {
      const fnName = name.toUpperCase();
      if (n.type !== "NumberLiteral" || !Number.isInteger(n.value) || n.value <= 0) {
        error(fnName + ' second argument must be a positive integer literal');
      }
      const node = { type: "MovingWindowFn", name: fnName, arg, preceding: n.value, windowClause: null };
      for (const p of rest) {
        if (!node.windowClause) node.windowClause = { type: "WindowClause" };
        if (p.orderBy) node.windowClause.orderBy = p.orderBy;
        if (p.partitionBy) node.windowClause.partitionBy = p.partitionBy;
      }
      return node;
    }

ZeroArgFn
  = name:Identifier &{ return zeroArgFns.includes(name.toUpperCase()); }
    _ "(" _ ")" {
      return { type: "ZeroArgFn", name: name.toUpperCase() };
    }

SingleArgFn
  = name:Identifier &{ return singleArgFns.includes(name.toUpperCase()); }
    _ "(" _ arg:Expression _ ")" {
      return { type: "SingleArgFn", name: name.toUpperCase(), arg };
    }

OneOrTwoArgFn
  = name:Identifier &{ return oneOrTwoArgFns.includes(name.toUpperCase()); }
    _ "(" _ first:Expression _ second:("," _ Expression)? _ ")" {
      const args = second ? [first, second[2]] : [first];
      return { type: "OneOrTwoArgFn", name: name.toUpperCase(), args };
    }

TwoArgFn
  = name:Identifier &{ return twoArgFns.includes(name.toUpperCase()); }
    _ "(" _ first:Expression _ "," _ second:Expression _ ")" {
      return { type: "TwoArgFn", name: name.toUpperCase(), args: [first, second] };
    }

ThreeArgFn
  = name:Identifier &{ return threeArgFns.includes(name.toUpperCase()); }
    _ "(" _ first:Expression _ "," _ second:Expression _ "," _ third:Expression _ ")" {
      return { type: "ThreeArgFn", name: name.toUpperCase(), args: [first, second, third] };
    }

ZeroOrOneArgFn
  = name:Identifier &{ return zeroOrOneArgFns.includes(name.toUpperCase()); }
    _ "(" _ arg:Expression? _ ")" {
      return { type: "ZeroOrOneArgFn", name: name.toUpperCase(), arg: arg ?? null };
    }

VariadicFn
  = name:Identifier &{ return variadicFns.includes(name.toUpperCase()); }
    _ "(" _ head:Expression tail:(_ "," _ Expression)* _ ")" {
      return { type: "VariadicFn", name: name.toUpperCase(), args: [head, ...tail.map(t => t[3])] };
    }

WindowFn
  = name:Identifier &{ return windowFns.includes(name.toUpperCase()); }
    _ "(" _ content:WindowFnContent? _ ")" {
      const node = { type: "WindowFn", name: name.toUpperCase(), args: [], windowClause: null };
      if (content) {
        node.args = content.args;
        if (content.windowClause) node.windowClause = content.windowClause;
      }
      return node;
    }

// --- Error fallback ---

InvalidFn
  = "IF"i _ "(" _ Expression _ "," _ Expression _ ("," _ Expression)? _ ")" {
      error("IF requires a condition (e.g. A > 0) as its first argument");
    }
  / name:Identifier &{ return conditionalAggFns.includes(name.toUpperCase()); }
    _ "(" _ Expression _ "," _ Expression _ ")" {
      error(name.toUpperCase() + " requires a condition (e.g. B > 0) as its second argument");
    }
  / "COUNTIF"i _ "(" _ Expression _ ")" {
      error("COUNTIF requires a condition (e.g. A > 0) as its argument");
    }
  / name:Identifier &{ return allFunctionNames.includes(name.toUpperCase()); }
    _ "(" _ ArgListPermissive? _ ")" {
      error(name.toUpperCase() + " called with wrong number of arguments");
    }
  / name:Identifier _ "(" _ ArgListPermissive? _ ")" {
      error("Unknown function: " + name);
    }

ArgListPermissive
  = Expression (_ "," _ Expression)*

// --- Window function content ---

WindowFnContent
  = first:WindowClausePartFirst rest:WindowClausePart* {
      const wc = { type: "WindowClause" };
      const parts = [first, ...rest];
      for (const p of parts) {
        if (p.orderBy) wc.orderBy = p.orderBy;
        if (p.partitionBy) wc.partitionBy = p.partitionBy;
      }
      return { args: [], windowClause: wc };
    }
  / head:Expression tail:WindowFnContentTail* {
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

WindowFnContentTail
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

// --- Terminals ---

ColumnRef
  = name:Identifier !{ return allFunctionNames.includes(name.toUpperCase()); } {
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
