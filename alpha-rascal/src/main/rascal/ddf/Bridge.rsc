module ddf::Bridge

import String;
import List;
import Set;
import Relation;
import lang::cpp::M3;
import ddf::AST;

public list[str] predictCppSignatures(str interfaceName, str methodName, list[str] modifiers, str methodType) {
    list[str] expectedSignatures = [];

    expectedSignatures += methodName;

    if ("fcn" in modifiers) {
        expectedSignatures += "<methodName>_fcn";
    }

    if ("nonblocking" in modifiers) {
        expectedSignatures += "<methodName>_req";
        expectedSignatures += "ReplyHandler_<methodName>/wait";
    }

    if (methodType == "event") {
        expectedSignatures += "subscribe_<methodName>";
    }

    return expectedSignatures;
}

public M3 stitchDdfToCpp(M3 cppModel, DDFModule ddfAst) {
    println("Bridging DDF interfaces to C++ M3 Model...");

    rel[loc, loc] clientToDdf = {};
    rel[loc, loc] serverToDdf = {};

    for (stmt <- ddfAst.statements) {
        if (interfaceStmt(interfaceDef(str intfName, list[InterfaceElement] elements)) := stmt) {
            loc ddfInterfaceLoc = |ddf+interface://<intfName>|;

            for (elem <- elements) {
                if (methodDecl(methodDeclaration(list[str] mods, str mType, str mName, list[Parameter] params)) := elem) {
                    loc ddfMethodLoc = |ddf+method://<intfName>/<mName>|;

                    list[str] expectedCppNames = predictCppSignatures(intfName, mName, mods, mType);

                    for (<callerLoc, calleeLoc> <- cppModel.methodInvocations) {
                        if (any(name <- expectedCppNames, endsWith(calleeLoc.path, "/<name>"))) {
                            clientToDdf += <callerLoc, ddfMethodLoc>;
                        }
                    }

                    for (<declLoc, _> <- cppModel.declarations) {
                        if (declLoc.scheme == "cpp+method" && endsWith(declLoc.path, "/<mName>")) {
                            serverToDdf += <declLoc, ddfMethodLoc>;
                        }
                    }
                }
            }
        }
    }

    rel[loc, loc] architecturalEdges = {
        <caller, server> | <caller, ddf1> <- clientToDdf, <server, ddf2> <- serverToDdf, ddf1 == ddf2
    };

    int edgeCount = size(architecturalEdges);
    println("Synthesized <edgeCount> direct architectural edges over DDF bounds.");
    cppModel.methodInvocations += architecturalEdges;

    return cppModel;
}