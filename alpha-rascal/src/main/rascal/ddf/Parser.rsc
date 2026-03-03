module ddf::Parser

import ddf::Syntax;
import ParseTree;
import IO;
import util::FileSystem;
import Set;
import Exception;

public Tree parseDdfFile(loc fileLocation) {
    println("Attempting to parse: <fileLocation.path>");
    try {
        Tree result = parse(#start[DDFModule], fileLocation);
        println("Parsing Succeeded for <fileLocation.path>!");
        return result;
    } catch ParseError(loc l): {
        println("Parse Error in <fileLocation.file> at line <l.begin.line>, column <l.begin.column>");
        println("  Snippet: <readFile(l)>"); // Prints the exact text it tripped on
        throw l;
    }
}

public void parseAllDdfFilesInDir(loc dirLocation) {
    if (!isDirectory(dirLocation)) {
        println("[ERROR] The provided location is not a directory: <dirLocation>");
        return;
    }

    println("Scanning <dirLocation> for .ddf files...");
    set[loc] allDdfFiles = find(dirLocation, "ddf");
    
    int totalFiles = size(allDdfFiles);
    int successCount = 0;
    int failCount = 0;
    
    println("Found <totalFiles> .ddf files.\n");

    for (loc file <- allDdfFiles) {
        try {
            parseDdfFile(file);
            successCount += 1;
        } catch ParseError(loc l): {
            failCount += 1;
        }
    }
    
    println("\n=== DDF Parsing Summary ===");
    println("Total files tested : <totalFiles>");
    println("Successfully parsed: <successCount>");
    println("Failed to parse    : <failCount>");
}