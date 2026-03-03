module ddf::AST

import String;
import List;

// --- Root ---
data DDFModule = ddfModule(list[Statement] statements);

// --- Statements ---
data Statement
    = interfaceStmt(InterfaceDef interfaceDef)
    | constStmt(ConstDef constDef)
    | typeDefStmt(TypeDefStatement typeDef)
    | standaloneStmt(StandaloneDef standalone)
    | metaStmt(MetaStatement meta)
    | emptyStmt()
    ;

data MetaStatement
    = sccsDate(str date)
    | sccsVersion(str version)
    | xmlSchemaUri(str uri)
    | nocheckvp()
    ;

data StandaloneDef
    = hashDef(HashStandalone hashStandalone)
    | autoUnionDef(AutoUnionStandalone autoUnionStandalone)
    | enum2StrDef(Enum2StrStandalone enum2StrStandalone)
    | enum2DescDef(Enum2DescStandalone enum2DescStandalone)
    | externalDef(ExternalStandalone externalStandalone)
    | typeChecksumDef(TypeChecksumStandalone typeChecksumStandalone)
    | attributedDef(AttributedStandalone attributedStandalone)
    | xmlRootDef(XmlRootStandalone xmlRootStandalone)
    | cmExprDef(CmExpressionStandalone cmExpressionStandalone)
    ;

data HashStandalone = hashStandalone(str type, list[AttributeList] attrs, NameId name, list[AttributeList] attrs2);
data AutoUnionStandalone = autoUnionStandalone(list[str] strings, str type, NameId name);
data Enum2StrStandalone = enum2StrStandalone(str type, NameId name);
data Enum2DescStandalone = enum2DescStandalone(str type, NameId name);
data ExternalStandalone = externalStandalone(str remoteType, str localType);
data TypeChecksumStandalone = typeChecksumStandalone(str type, str checksum);
data AttributedStandalone = attributedStandalone(NameId name, str type, list[AttributeList] attrs);
data XmlRootStandalone = xmlRootStandalone(str type, NameId name);
data CmExpressionStandalone = cmExpressionStandalone(NameId name, CmExpression expr);

// --- Types & Declarations ---
data TypeDefStatement
    = typedefDecl(TypedefDeclaration typedefDeclaration)
    | directDecl(DirectDeclaration directDeclaration)
    ;

data NameId
    = simpleName(str id)
    | namespacedName(str nsId)
    ;

data TypedefDeclaration = typedefDeclaration(list[TypeModifier] modifier, ComplexType typeDef, NameId newTypeName, TypeExtras extras);

data DirectDeclaration = directDeclaration(str type, NameId name, list[Dimension] dims, list[AttributeList] attrs);

data ComplexType
    = enumType(EnumDef enumDef)
    | structType(StructDef structDef)
    | unionType(UnionDef unionDef)
    | hashType(HashDef hashDef)
    | refType(str type, list[Dimension] dims)
    ;

data EnumDef = enumDef(list[EnumMember] members);
data EnumMember = enumMember(NameId name, list[Expression] val, list[AttributeList] attrs);

data StructDef = structDef(list[StructMember] members);
data StructMember = structMember(list[TypeModifier] modifier, str type, str name, list[Dimension] dims, list[AttributeList] attrs);

data UnionDef = unionDef(str discriminator, list[AttributeList] attrs, list[str] name, list[UnionMember] members);
data UnionMember = unionMember(UnionCase caseLabel, str type, str name, list[Dimension] dims, list[AttributeList] attrs);

data UnionCase
    = caseLabel(list[str] ids)
    | defaultLabel()
    ;

data HashDef = hashDef(str type, list[AttributeList] attrs);

data TypeModifier
    = optionalMod()
    | xmlOptionalMod()
    ;

data TypeExtras = typeExtras(list[str] stringDefines, list[Dimension] dims, list[SetCommand] commands, list[AttributeList] attrs);

data Dimension
    = sizeDim(Expression size)
    | starDim()
    ;

data AttributeList = attributeList(list[Attribute] attrs);
data Attribute = attribute(str name, list[Expression] val);

// --- Sets & Constants ---
data SetCommand = setCommand(list[CmExpression] condition, list[SetItem] items);
data SetItem = setItem(SetPath path, SetValue val);
data SetPath = setPath(list[SetComponent] components);
data SetComponent
    = idComp(str id, list[value] indices)
    | starComp()
    ;

data SetValue
    = typeRefVal(str typeRef)
    | attrListVal(AttributeList attrList)
    ;

data ConstDef
    = nsConstDef(str name, Expression val)
    | constDef(str name, Expression val)
    ;

// --- Expressions ---
data CmExpression = cmExpr(CmOrExpression expr);
data CmOrExpression = cmOr(CmAndExpression lhs, list[value] rhs);
data CmAndExpression = cmAnd(CmPrimary lhs, list[value] rhs);
data CmPrimary
    = cmCompare(str id, str op, str strLit)
    | cmNot(CmPrimary expr)
    | cmParen(CmExpression expr)
    ;

data Expression = logicalExpr(LogicalExpr expr);
data LogicalExpr = logicalOpExpr(BitwiseExpr lhs, list[value] rhs);
data LogicalOp = orOp() | andOp();
data BitwiseExpr = bitwiseOpExpr(ShiftExpr lhs, list[value] rhs);
data BitwiseOp = bitOr() | bitAnd() | bitXor();
data ShiftExpr = shiftOpExpr(AdditiveExpr lhs, list[value] rhs);
data ShiftOp = shiftLeft() | shiftRight();
data AdditiveExpr = addOpExpr(MultiplicativeExpr lhs, list[value] rhs);
data AdditiveOp = plusOp() | minusOp();
data MultiplicativeExpr = mulOpExpr(UnaryExpr lhs, list[value] rhs);
data MultiplicativeOp = mulOp() | divOp() | modOp();
data UnaryExpr = unaryOpExpr(list[UnaryOp] op, PrimaryExpr expr);
data UnaryOp = plusUnary() | minusUnary() | bitNotUnary() | logNotUnary();
data PrimaryExpr
    = idPrimary(str id)
    | nsPrimary(str nsId)
    | numPrimary(str num)
    | strPrimary(str strLit)
    | charPrimary(str charLit)
    | atPrimary(str id)
    | parenPrimary(Expression expr)
    ;

// --- Interfaces (The Core for the Bridge) ---
data InterfaceDef = interfaceDef(str name, list[InterfaceElement] elements);

data InterfaceElement
    = interfaceSetting(InterfaceSetting setting)
    | methodDecl(MethodDeclaration method)
    ;

data InterfaceSetting
    = defaultTimeoutSetting(Expression expr)
    | connectionTimeoutSetting(Expression expr)
    | serverSetting(Expression expr1, list[Expression] expr2)
    | singletonSetting(str id)
    | librarySetting(str id)
    | brokerSetting(str id)
    | flagSetting(str flag, list[str] arg)
    ;

data MethodDeclaration = methodDeclaration(list[str] modifiers, str type, str name, list[Parameter] parameters);

data Parameter = parameter(str direction, str type, str name, list[str] modifiers, list[str] trace);