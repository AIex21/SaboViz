module Parser

import IO;
import Set;
import List;
import Relation;
import lang::cpp::M3;
import lang::cpp::AST;
import util::FileSystem;
import String;

// Alpha modules
import utils::Common;
import utils::Constants;
import utils::Persistence;
import utils::Types;
import utils::PathMapper;
import utils::LocationInflator;

// Configuration variables
private loc inputFolderAbsolutePath;
private loc externalLibRoot;
private bool composeModels = true;
private bool verbose = false;
private bool saveFilesAsJson = true;
private bool saveUnresolvedIncludes = false;
private str localDrive = "C:";

//input files
list[loc] includeFiles;
list[loc] stdLibFiles;


/**
 * Entry point of the module. Loads the configuration, sets up processing flags, 
 * and initiates parsing of either a specific module or a default module list.
 * 
 * @param moduleName optional name of the module to process; if empty, all modules are processed.
 */
void main(str moduleName = "") {
    
    Configuration loadedConfig = loadConfiguration();

    inputFolderAbsolutePath = |file:///| + loadedConfig.inputFolderAbsolutePath;
    externalLibRoot = |file:///| + loadedConfig.externalLibRoot;

    saveFilesAsJson = loadedConfig.saveFilesAsJson;
    composeModels = loadedConfig.composeModels;
    verbose = loadedConfig.verbose;
    saveUnresolvedIncludes = loadedConfig.saveUnresolvedIncludes;
    localDrive = loadedConfig.localDrive;

    println("[CONFIG_VALUE] inputFolderAbsolutePath: <inputFolderAbsolutePath>");
    println("[CONFIG_VALUE] externalLibRoot: <externalLibRoot>");
    println("[CONFIG_VALUE] saveFilesAsJson: <saveFilesAsJson>");
    println("[CONFIG_VALUE] composeModels: <composeModels>");
    println("[CONFIG_VALUE] verbose: <verbose>");
    println("[CONFIG_VALUE] localDrive: <localDrive>");
    println("[CONFIG_VALUE] saveUnresolvedIncludes: <saveUnresolvedIncludes>");

    println("Scanning project headers in <inputFolderAbsolutePath>...");
    includeFiles = findAllIncludeDirs(inputFolderAbsolutePath);

    println("Scanning external libraries in <externalLibRoot>...");
    stdLibFiles = findAllIncludeDirs(externalLibRoot);

    if(verbose) {
        println("Using Include Dirs: <includeFiles>");
        println("Using Std Libs: <stdLibFiles>");
    }

    if(moduleName == "") {
        parseModuleListToComposedM3();
    }
    else {
        parseCppListToM3(moduleName);
    }
}

/**
 * Parses a list of C++ files for a specified module and extracts their M3 models.
 * 
 * @param m3FileName name of the output file for the extracted M3 model.
 */
public void parseCppListToM3(str m3FileName) {
    list[loc] cppFiles = [];

    cppFiles = findAllCppFiles(inputFolderAbsolutePath);
    
    processCppFiles(cppFiles, m3FileName);
}

/**
 * Parses a predefined list of modules, extracting and optionally composing M3 models for each module.
 */
public void parseModuleListToComposedM3() {
    list[loc] listsOfInputFilesForModules = [];

    cppFiles = findAllCppFiles(inputFolderAbsolutePath);
    processCppFiles(cppFiles, "FullProject");
}

/**
 * Processes a list of C++ files by extracting M3 models, saving the models as JSON if enabled,
 * and optionally composing all models into a single M3 model.
 * 
 * @param cppFilePaths list of locations of C++ source files to process.
 * @param appName name of the application/module for saving the composed M3 model.
 */
private void processCppFiles(list[loc] cppFilePaths, str appName) {
    set[M3] M3Models = {};

    int i = 0;
    int length = size(cppFilePaths);

    for (loc cppFilePath <- cppFilePaths) {
        if (!exists(cppFilePath)) {
            println("[ERROR] File does not exist: <cppFilePath>");
            continue; 
        }
        str fileName = getNameFromFilePath(cppFilePath);
        extractedModels = extractModelsFromCppFile(cppFilePath, includeFiles, stdLibFiles);
        extractedModels[0] = filterSystemLibs(extractedModels[0], stdLibFiles);
        M3Models += extractedModels[0];
        // saveExtractedModelsToDisk(extractedModels, fileName, saveFilesAsJson);
        
        if(saveUnresolvedIncludes) {
            outputUnresolvedIncludes(fileName, extractedModels[0].includeResolution);
        }

        i = i + 1;
        
        println("File <fileName> processed.");
        println("Processed: <i>/<length>");
    }
    if (composeModels) {
        M3 composedModels = composeCppM3(|file:///|, M3Models);
        saveComposedExtractedM3ModelsAsJSON(composedModels, appName);
    }
}

/**
 * Outputs unresolved include directives to a file for further inspection.
 * 
 * @param fileName name of the C++ source file being processed.
 * @param includeResolution relation mapping include directives to their resolved paths.
 */
private void outputUnresolvedIncludes(str fileName, rel[loc directive, loc resolved] includeResolution) {
    rel[loc directive, loc resolved] unresolvedIncludes = rangeR(includeResolution, {|unresolved:///|});
    listOfUnresolvedIncludes = toList(unresolvedIncludes);

    list[str] UnresolvedIncludesAsStrings = [];

    for(tuple[loc directive, loc resolved] binaryRelation <- listOfUnresolvedIncludes) {
        UnresolvedIncludesAsStrings = UnresolvedIncludesAsStrings + binaryRelation.directive.path;
    }

    saveListToFile(fileName, UnresolvedIncludesAsStrings);
}

/**
 * Extracts M3 and AST models from a single C++ source file. 
 * Includes verbose output of include directories and standard library files if enabled.
 * 
 * @param filePath location of the C++ file to process.
 * @param includeFiles list of folders containing the C++ included headers to process.
 * @param stdLibFiles list of folders containing the standard libraries used in the analysed system.
 * @return ModelContainer holding the extracted M3 and AST models for the given C++ file.
 */
private ModelContainer extractModelsFromCppFile(loc filePath, list[loc] includeFiles, list[loc] stdLibFiles){
    ModelContainer extractedModels = createM3AndAstFromCppFile(filePath, stdLib = stdLibFiles, includeDirs = includeFiles);
    // extractedModels[0] = inflateM3(extractedModels[0]);

    return extractedModels;
}

/**
 * Recursively finds all C++ source files in a given directory.
 */
public list[loc] findAllCppFiles(loc rootDirectory) {
    // find(loc, str) returns a set[loc] of files with that extension
    set[loc] cppFiles = find(rootDirectory, "cpp");
    
    // Combine them and convert to a list
    return toList(cppFiles);
}

/**
 * Recursively finds all folders that contain header files.
 */
public list[loc] findAllIncludeDirs(loc rootDirectory) {
    set[loc] hFiles   = find(rootDirectory, "h");
    
    // We only want the folder containing the file, not the file itself
    set[loc] includeDirs = { file.parent | loc file <- hFiles };
    
    return toList(includeDirs);
}

public list[loc] findSystemHeaders(loc vsRoot, loc winKitsRoot) {
    list[loc] results = [];

    // 1. Find MSVC C++ Headers (inside Visual Studio)
    // We look for the folder named "include" deep inside "VC/Tools/MSVC"
    // We sort specifically to get the latest version (highest number)
    try {
        loc msvcRoot = vsRoot + "VC/Tools/MSVC";
        // Get all version folders
        set[loc] versions = { d | d <- msvcRoot.ls, isDirectory(d) };
        
        if (size(versions) > 0) {
            // Pick the last one (alphabetically usually means latest version)
            loc latestVersion = sort(toList(versions))[-1];
            loc includePath = latestVersion + "include";
            results += includePath;
            println("Auto-detected MSVC Headers: <includePath>");
        }
    } catch: {
        println("[WARNING] Could not auto-detect MSVC headers in <vsRoot>");
    }

    // 2. Find Windows SDK Headers (stdio.h, etc)
    // We look inside "Include"
    try {
        loc kitsInclude = winKitsRoot + "Include";
        set[loc] kitVersions = { d | d <- kitsInclude.ls, isDirectory(d) };

        if (size(kitVersions) > 0) {
            loc latestKit = sort(toList(kitVersions))[-1];
            
            // Windows Kits usually have subfolders: ucrt, shared, um, winrt. 
            // We need 'ucrt' (Universal C Runtime) and 'um' (User Mode) mainly.
            results += (latestKit + "ucrt");
            results += (latestKit + "um");
            results += (latestKit + "shared");
            println("Auto-detected Windows Kit Headers: <latestKit>");
        }
    } catch: {
        println("[WARNING] Could not auto-detect Windows Kits in <winKitsRoot>");
    }

    return results;
}

/**
 * Filters out entities and relations that are defined in the Standard Library paths.
 */
M3 filterSystemLibs(M3 model, list[loc] systemLibs) {
    
    str normalize(str s) = replaceAll(toLowerCase(s), "\\", "/");
    
    // 1. Helper: Is this a System Entity?
    bool isSystem(loc l) {
        if (startsWith(l.path, "/std/") || startsWith(l.path, "/std::") || startsWith(l.path, "/_")) return true;
        
        // Check physical path if available
        if (l in model.declarations<0>) {
             loc phys = getOneFrom(model.declarations[l]);
             str p = normalize(phys.path);
             return any(lib <- systemLibs, startsWith(p, normalize(lib.path)));
        }
        return false;
    }

    // 2. Collect ALL nodes referenced in the model
    // (This catches implicit templates like 'Vector' that might be missing from declarations)
    set[loc] allNodes = domain(model.declarations)
                      + domain(model.containment) + range(model.containment)
                      + domain(model.methodInvocations) + range(model.methodInvocations)
                      + domain(model.extends) + range(model.extends)
                      + domain(model.typeDependency) + range(model.typeDependency)
                      + domain(model.methodOverrides) + range(model.methodOverrides)
                      + domain(model.callGraph) + range(model.callGraph)
                      + domain(model.uses) + range(model.uses)
                      + model.implicitDeclarations;

    // 3. Identify User Entities (The "Keep" List)
    // Keep anything that is NOT definitely a system entity
    set[loc] userEntities = { n | n <- allNodes, !isSystem(n) };
    
    // 4. Find "Boundary" System Entities (System things used by User things)
    // If User code touches System code, we keep the System node.
    rel[loc, loc] allRel = model.methodInvocations + model.typeDependency 
                         + model.extends + model.callGraph + model.uses;
                         
    set[loc] boundaryEntities = { t | <s, t> <- allRel, s in userEntities, isSystem(t) };
    
    // 5. Find Parents of Boundary Entities
    // Keep the containers (e.g. keep 'std' and 'vector' if 'push_back' is used)
    set[loc] requiredSystem = boundaryEntities;
    bool changed = true;
    while(changed) {
        int sizeBefore = size(requiredSystem);
        requiredSystem += { p | <p, c> <- model.containment, c in requiredSystem };
        changed = size(requiredSystem) > sizeBefore;
    }
    
    // 6. Final "Keep" Set
    set[loc] toKeep = userEntities + requiredSystem;
    int sysCount = size(requiredSystem);
    println("Keeping <sysCount> used system entities (and their parents).");

    // 7. Filter the Model
    // Rule: Both ends of a relation must be in 'toKeep'.
    
    model.declarations = { <n, s> | <n, s> <- model.declarations, n in toKeep };
    model.containment = { <p, c> | <p, c> <- model.containment, p in toKeep && c in toKeep };
    model.methodInvocations = { <c, t> | <c, t> <- model.methodInvocations, c in toKeep && t in toKeep };
    model.extends = { <sub, sup> | <sub, sup> <- model.extends, sub in toKeep && sup in toKeep };
    model.typeDependency = { <f, t> | <f, t> <- model.typeDependency, f in toKeep && t in toKeep };
    model.names = { <n, e> | <n, e> <- model.names, e in toKeep };
    
    model.methodOverrides = { <d, b> | <d, b> <- model.methodOverrides, d in toKeep && b in toKeep };
    model.callGraph = { <c, t> | <c, t> <- model.callGraph, c in toKeep && t in toKeep };
    model.uses = { <u, n> | <u, n> <- model.uses, u in toKeep && n in toKeep };
    model.implicitDeclarations = { n | n <- model.implicitDeclarations, n in toKeep };

    return model;
}