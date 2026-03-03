module ddf::Syntax

// The structure / Context-Free Grammar
start syntax DDFModule
    = ddfModule: Statement* statements;

syntax Statement
    = interfaceStmt: InterfaceDef interfaceDef
    | constStmt: ConstDef constDef
    | typeDefStmt: TypeDefStatement typeDef
    | standaloneStmt: StandaloneDef standalone
    | metaStmt: MetaStatement meta
    | emptyStmt: ";"
    ;

syntax MetaStatement
    = sccsDate: "sccs_date" StringLiteral date ";"
    | sccsVersion: "sccs_version" StringLiteral version ";"
    | xmlSchemaUri: "xml_schema_uri" StringLiteral uri ";"
    | nocheckvp: "nocheckvp" ";" ;

syntax StandaloneDef
    = hashDef: HashStandalone
    | autoUnionDef: AutoUnionStandalone
    | enum2StrDef: Enum2StrStandalone
    | enum2DescDef: Enum2DescStandalone
    | externalDef: ExternalStandalone
    | typeChecksumDef: TypeChecksumStandalone
    | attributedDef: AttributedStandalone
    | xmlRootDef: XmlRootStandalone
    | cmExprDef: CmExpressionStandalone;

syntax HashStandalone
    = hashStandalone: "hash" "(" TypeRef type AttributeList? attrs ")" NameId name AttributeList? attrs2 ";" ;

syntax AutoUnionStandalone
    = autoUnionStandalone: "autounion" {StringLiteral ","}+ strings ":" TypeRef type NameId name ";" ;

syntax Enum2StrStandalone
    = enum2StrStandalone: "enum2str" TypeRef type NameId name ";" ;

syntax Enum2DescStandalone
    = enum2DescStandalone: "enum2desc" TypeRef type NameId name ";" ;

syntax ExternalStandalone
    = externalStandalone: "external" TypeRef remoteType TypeRef localType ";" ;

syntax TypeChecksumStandalone
    = typeChecksumStandalone: "typechecksum" TypeRef type NumberLiteral checksum ";" ;

syntax AttributedStandalone
    = attributedStandalone: "attributedef" NameId name TypeRef type AttributeList? attrs ";" ;

syntax XmlRootStandalone
    = xmlRootStandalone: "xml_root_element" TypeRef type NameId name ";" ;

syntax CmExpressionStandalone
    = cmExpressionStandalone: "cmexpression" NameId name "=" CmExpression expr ";" ;

syntax CmExpression
    = cmExpr: CmOrExpression expr ;

syntax CmOrExpression
    = cmOr: CmAndExpression lhs ("||" CmAndExpression)* rhs ;

syntax CmAndExpression
    = cmAnd: CmPrimary lhs ("&&" CmPrimary)* rhs ;

syntax CmPrimary
    = cmCompare: Id id ("==" | "!=") op StringLiteral str
    | cmNot: "!" CmPrimary expr
    | cmParen: "(" CmExpression expr ")" ;

syntax TypeDefStatement
    = typedefDecl: TypedefDeclaration
    | directDecl: DirectDeclaration;

syntax NameId
    = simpleName: Id id
    | namespacedName: NamespacedId nsId;

syntax TypedefDeclaration
    = typedefDeclaration: TypeModifier? modifier "typedef" ComplexType typeDef NameId newTypeName TypeExtras extras ;

syntax DirectDeclaration
    = directDeclaration: TypeRef type NameId name Dimension* dims AttributeList? attrs ";" ;

syntax ComplexType
    = enumType: EnumDef enumDef
    | structType: StructDef structDef
    | unionType: UnionDef unionDef
    | hashType: HashDef hashDef
    | refType: TypeRef type Dimension* dims;

syntax EnumDef
    = enumDef: "enum" "{" {EnumMember ","}* members ","? "}" ;

syntax EnumMember
    = enumMember: NameId name ("=" Expression val)? AttributeList? attrs ;

syntax StructDef
    = structDef: "struct" "{" StructMember* members "}" ;

syntax StructMember
    = structMember: TypeModifier? modifier TypeRef type Id name Dimension* dims AttributeList? attrs ";" ;

syntax UnionDef
    = unionDef: "union" "(" TypeRef discriminator AttributeList? attrs ")" Id? name "{" UnionMember* members "}" ;

syntax UnionMember
    = unionMember: UnionCase caseLabel TypeRef type Id name Dimension* dims AttributeList? attrs ";" ;

syntax UnionCase
    = caseLabel: "case" {Id ","}+ ids ":"
    | defaultLabel: "default" ":" ;

syntax HashDef
    = hashDef: "hash" "(" TypeRef type AttributeList? attrs ")" ;

syntax TypeModifier
    = optionalMod: "optional" 
    | xmlOptionalMod: "xml_optional" ;

syntax TypeExtras
    = typeExtras: "stringdefines"? stringDefines Dimension* dims SetCommand* commands AttributeList? attrs ";" ;

syntax Dimension
    = sizeDim: "[" Expression size "]"
    | starDim: "[" "*" "]" ;

syntax AttributeList
    = attributeList: "\<" {Attribute ","}* attrs "\>" ;

syntax Attribute
    = attribute: RawId name ("=" Expression val)? ;

syntax SetCommand
    = setCommand: "set" ("(" CmExpression condition ")")? "{" SetItem* items "}" ;

syntax SetItem
    = setItem: SetPath path "=" SetValue val ";" ;

syntax SetPath
    = setPath: {SetComponent "."}+ components ;

syntax SetComponent
    = idComp: Id id ("[" (Expression | "*") "]")* indices 
    | starComp: "*" ;

syntax SetValue
    = typeRefVal: TypeRef typeRef
    | attrListVal: AttributeList attrList;

syntax ConstDef
    = nsConstDef: "const" NamespacedId name "=" Expression val ";"
    | constDef: "const" Id name "=" Expression val ";" ;

syntax Expression
    = logicalExpr: LogicalExpr expr;

syntax LogicalExpr
    = logicalOpExpr: BitwiseExpr lhs (LogicalOp BitwiseExpr)* rhs;

syntax LogicalOp
    = orOp: "||" | andOp: "&&" ;

syntax BitwiseExpr
    = bitwiseOpExpr: ShiftExpr lhs (BitwiseOp ShiftExpr)* rhs ;

syntax BitwiseOp
    = bitOr: "|" | bitAnd: "&" | bitXor: "^" ;

syntax ShiftExpr
    = shiftOpExpr: AdditiveExpr lhs (ShiftOp AdditiveExpr)* rhs ;

syntax ShiftOp
    = shiftLeft: "\<\<" | shiftRight: "\>\>" ;

syntax AdditiveExpr
    = addOpExpr: MultiplicativeExpr lhs (AdditiveOp MultiplicativeExpr)* rhs ;

syntax AdditiveOp
    = plusOp: "+" | minusOp: "-" ;

syntax MultiplicativeExpr
    = mulOpExpr: UnaryExpr lhs (MultiplicativeOp UnaryExpr)* rhs ;

syntax MultiplicativeOp
    = mulOp: "*" | divOp: "/" | modOp: "%" ;

syntax UnaryExpr
    = unaryOpExpr: UnaryOp? op PrimaryExpr expr ;

syntax UnaryOp
    = plusUnary: "+" | minusUnary: "-" | bitNotUnary: "~" | logNotUnary: "!" ;

syntax PrimaryExpr
    = idPrimary: Id id
    | nsPrimary: NamespacedId nsId
    | numPrimary: NumberLiteral num
    | strPrimary: StringLiteral strLit
    | charPrimary: CharLiteral charLit
    | atPrimary: "@" Id id
    | parenPrimary: "(" Expression expr ")";

syntax InterfaceDef
    = interfaceDef: "interface" Id name "{" InterfaceElement* elements "}";

syntax InterfaceElement
    = interfaceSetting: InterfaceSetting setting
    | methodDecl: MethodDeclaration method ;

syntax InterfaceSetting
    = defaultTimeoutSetting: "defaulttimeout" Expression expr ";"
    | connectionTimeoutSetting: "connectiontimeout" Expression expr ";"
    | serverSetting: "server" Expression expr1 ("," Expression expr2)? ";"
    | singletonSetting: "singleton" Id id ";"
    | librarySetting: "library" Id id ";"
    | brokerSetting: "broker" Id id ";"
    | flagSetting: FlagSetting flag (Id | StringLiteral)? arg ";" ;

lexical FlagSetting
    = "fullconst" | "simulation" | "tracing" | "runtimeaccess" | "noruntimeaccess" ;

syntax MethodDeclaration
    = methodDeclaration: MethodModifier* modifiers MethodType type Id name "(" Parameter* parameters ")" ";" ;

lexical MethodModifier
    = "fcn" | "nonblocking" | "throughput" ;

lexical MethodType
    = "function" | "trigger" | "event" ;

syntax Parameter
    = parameter: ParamDirection direction TypeRef type Id name ParamModifier* modifiers ParamTrace? trace ("," | ";")? ;

lexical ParamDirection
    = "in" | "out" | "inout" | "return";

lexical TypeRef
    = "int" | "float" | "void" | "char" | "double" | "bool" | "string"
    | Id
    | NamespacedId;

lexical ParamModifier
    = "byvalue" | "bydefinition";

lexical ParamTrace
    = "notrace";

// Layout and Lexical Definitions
layout Standard
    = WhitespaceOrComment* !>> [\ \t\n\r\f] !>> "#";

lexical WhitespaceOrComment
    = [\ \t\n\r\f]
    | Comment ;

lexical Comment
    = @category="Comment" "#" ![\n]* $ ;

keyword DDFKeywords 
    = "int" | "float" | "void" | "char" | "double" | "bool" | "string" 
    | "interface" | "const" | "typedef" | "struct" | "enum" | "union" | "hash"
    | "set" | "default" | "case" | "fcn" | "nonblocking" | "throughput"
    | "function" | "trigger" | "event" | "in" | "out" | "inout" | "return"
    | "byvalue" | "bydefinition" | "notrace" | "optional" | "xml_optional"
    | "server" | "broker" | "singleton" | "library" | "defaulttimeout" | "connectiontimeout" // <-- Added "library" here
    | "fullconst" | "simulation" | "tracing" | "runtimeaccess" | "noruntimeaccess"
    | "sccs_date" | "sccs_version" | "xml_schema_uri" | "nocheckvp" 
    | "autounion" | "enum2str" | "enum2desc" | "external" 
    | "typechecksum" | "attributedef" | "xml_root_element" | "cmexpression" ;

lexical RawId
    = ([a-zA-Z_] [a-zA-Z0-9_]* !>> [a-zA-Z0-9_]) ;

lexical Id
    = RawId \ DDFKeywords ;

lexical NamespacedId
    = RawId ":" RawId;

lexical StringLiteral
    = "\"" ![\"]* "\"";

lexical NumberLiteral
    = [0-9]+
    | "0" [xX] [0-9a-fA-F]+ ;

lexical CharLiteral
    = "\'" ![\']* "\'" ;