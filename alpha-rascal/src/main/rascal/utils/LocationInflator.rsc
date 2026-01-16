module utils::LocationInflator

import IO;
import String;
import List;
import Map;
import Set;
import lang::cpp::M3;

// Cache to store line offsets so we don't re-read files
private map[loc, list[int]] fileTopologyCache = ();

// Resets the Cache
public void clearTopologyCache() {
    fileTopologyCache = ();
}

// Reads a file and calculates the offset of every new line
private list[int] buildLineIndex(loc file) {
    if (file in fileTopologyCache) {
        return fileTopologyCache[file];
    }

    str content = "";
    
    try {
        content = readFile(file);
    } catch PathNotFound(loc _): {
        return [];
    } catch IO(str msg): {
        return [];
    }

    // Line 1 always starts at offset 0
    list[int] offsets = [0];
    int len = size(content);

    // Find all newlines
    for (int i <- [0..len]) {
        if (content[i] == "\n") {
            offsets += (i + 1);
        }
    }

    fileTopologyCache[file] = offsets;
    return offsets;
}

// Maps a linear character offset to a (Line Column) tuple
private tuple[int line, int col] offsetToCoord(int offset, list[int] indices) {
    int lineIndex = 0;

    // Find the segment containing the offset
    for (int i <- [0..size(indices)]) {
        if (indices[i] <= offset) {
            lineIndex = i;
        } else {
            break;
        }
    }

    int lineNr = lineIndex + 1;
    int colNr = offset - indices[lineIndex];

    return <lineNr, colNr>;
}

// Takes a "stripped" location (offset only) and returns a full location
public loc inflateLoc(loc original) {
    // Optimization: If it already has lines, don't do anything
    try {
        int _ = original.begin.line;
        return original;
    } catch UnavailableInformation(): {
        ; // Proceed to inflation
    }

    loc fileURI = original.top;
    list[int] lineOffsets = buildLineIndex(fileURI);

    // If file read failed, return original to avoid crashing
    if (lineOffsets == []) {
        return original;
    }

    // Calculate Coordinates
    tuple[int line, int col] startCoord = offsetToCoord(original.offset, lineOffsets);
    tuple[int line, int col] endCoord = offsetToCoord(original.offset + original.length, lineOffsets);

    // Return new location with full fileTopologyCache
    return fileURI(
        original.offset,
        original.length,
        <startCoord.line, startCoord.col>,
        <endCoord.line, endCoord.col>
    );
}

// Upgrades an entire M3 model to have line numbers
public M3 inflateM3(M3 model) {
    println("Inflating M3 model with line coordinates...");

    // Update declarations
    // model.declarations = {<name, inflateLoc(src)> | <name, src> <- model.declarations};
    model.functionDefinitions = { <name, inflateLoc(src)> | <name, src> <- model.functionDefinitions };

    return model;
}