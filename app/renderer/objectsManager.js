const fs = require("fs");
const path = require("path");
const {
    BLOB_CLASSES_FILENAME,
    BLOB_OBJECTS_FILENAME,
    VARS_FUNCTIONS_FILENAME,
    VARS_FUNCTIONS_STUB
} = require("./objectsConstants.js");
const {
    emptyDocument,
    normalizeDocument,
    parseJson,
    emptyObjectsDocument,
    normalizeObjectsDocument,
    parseObjectsJson,
    syncObjectsWithTypes,
    validateAll
} = require("./objectsSchema.js");
const { generateInk } = require("./objectsInkGenerator.js");
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;

function blobClassesPath(projectDir) {
    return path.join(projectDir, BLOB_CLASSES_FILENAME);
}

function blobObjectsPath(projectDir) {
    return path.join(projectDir, BLOB_OBJECTS_FILENAME);
}

function varsFunctionsPath(projectDir) {
    return path.join(projectDir, VARS_FUNCTIONS_FILENAME);
}

function writeJsonFile(filePath, data) {
    var tempPath = filePath + ".tmp";
    var content = JSON.stringify(data, null, 2) + "\n";
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, filePath);
}

function getStatus(project) {
    var projectDir = project.mainInk.projectDir;
    if( !projectDir ) {
        return {
            projectSaved: false,
            jsonExists: false,
            objectsJsonExists: false,
            inkExists: false,
            includePresent: false
        };
    }

    return {
        projectSaved: true,
        jsonExists: fs.existsSync(blobClassesPath(projectDir)),
        objectsJsonExists: fs.existsSync(blobObjectsPath(projectDir)),
        inkExists: fs.existsSync(varsFunctionsPath(projectDir)),
        includePresent: project.mainInk.includes.indexOf(VARS_FUNCTIONS_FILENAME) !== -1
    };
}

function filesReady(status) {
    return status.projectSaved
        && status.jsonExists
        && status.objectsJsonExists
        && status.inkExists
        && status.includePresent;
}

function loadObjectTypes(projectDir) {
    if( !projectDir )
        return emptyDocument().objectTypes;

    var filePath = blobClassesPath(projectDir);
    if( !fs.existsSync(filePath) )
        return emptyDocument().objectTypes;

    try {
        var text = fs.readFileSync(filePath, "utf8");
        var doc = parseJson(text);
        if( !doc )
            return emptyDocument().objectTypes;
        return doc.objectTypes;
    } catch( err ) {
        return emptyDocument().objectTypes;
    }
}

function loadObjects(projectDir) {
    if( !projectDir )
        return emptyObjectsDocument().objects;

    var filePath = blobObjectsPath(projectDir);
    if( !fs.existsSync(filePath) )
        return emptyObjectsDocument().objects;

    try {
        var text = fs.readFileSync(filePath, "utf8");
        var doc = parseObjectsJson(text);
        if( !doc )
            return emptyObjectsDocument().objects;
        return doc.objects;
    } catch( err ) {
        return emptyObjectsDocument().objects;
    }
}

function loadObjectVariables(projectDir) {
    if( !projectDir )
        return [];

    var filePath = blobClassesPath(projectDir);
    if( !fs.existsSync(filePath) )
        return [];

    try {
        var text = fs.readFileSync(filePath, "utf8");
        var doc = parseJson(text);
        if( !doc )
            return [];
        return doc.objectVariables || [];
    } catch( err ) {
        return [];
    }
}

function loadAll(projectDir) {
    var objectTypes = loadObjectTypes(projectDir);
    var objects = syncObjectsWithTypes(objectTypes, loadObjects(projectDir));
    var objectVariables = loadObjectVariables(projectDir);
    return { objectTypes, objects, objectVariables };
}

function saveObjectTypes(projectDir, objectTypes, objectVariables) {
    var doc = normalizeDocument({ version: 1, objectTypes: objectTypes, objectVariables: objectVariables || [] });
    writeJsonFile(blobClassesPath(projectDir), doc);
}

function saveObjects(projectDir, objects) {
    var doc = normalizeObjectsDocument({ version: 1, objects: objects });
    writeJsonFile(blobObjectsPath(projectDir), doc);
}

function updateManagedInkFile(project, content) {
    var projectDir = project.mainInk.projectDir;
    fs.writeFileSync(varsFunctionsPath(projectDir), content, "utf8");

    var inkFile = project.inkFileWithRelativePath(VARS_FUNCTIONS_FILENAME);
    if( inkFile ) {
        inkFile.justLoadedContent = true;
        inkFile.setValue(content);
        inkFile.hasUnsavedChanges = false;
        inkFile.compilerVersionDirty = true;
        inkFile.justLoadedContent = false;
    }

    LiveCompiler.setEdited();
}

function regenerateInk(project, objectTypes, objects, objectVariables) {
    if( typeof objectVariables === "undefined" ) {
        var projectDir = project.mainInk.projectDir;
        objectVariables = loadObjectVariables(projectDir);
    }
    var content = generateInk(objectTypes, objects, objectVariables);
    updateManagedInkFile(project, content);
}

function saveAll(project, objectTypes, objects, objectVariables) {
    var projectDir = project.mainInk.projectDir;
    if( !projectDir )
        return { success: false, errors: [] };

    if( typeof objectVariables === "undefined" ) {
        objectVariables = loadObjectVariables(projectDir);
    }

    objects = syncObjectsWithTypes(objectTypes, objects);
    var errors = validateAll(objectTypes, objects);
    if( errors.length > 0 )
        return { success: false, errors: errors, objects: objects };

    saveObjectTypes(projectDir, objectTypes, objectVariables);
    saveObjects(projectDir, objects);
    regenerateInk(project, objectTypes, objects, objectVariables);
    return { success: true, errors: [], objects: objects };
}

function markHiddenSystemFiles(project) {
    project.files.forEach(file => {
        if( file.relativePath() === VARS_FUNCTIONS_FILENAME )
            file.isHiddenSystemFile = true;
    });
}

function createObjectsFiles(project) {
    var projectDir = project.mainInk.projectDir;
    if( !projectDir )
        return false;

    if( !fs.existsSync(blobClassesPath(projectDir)) )
        saveObjectTypes(projectDir, [], []);

    if( !fs.existsSync(blobObjectsPath(projectDir)) )
        saveObjects(projectDir, []);

    var objectTypes = loadObjectTypes(projectDir);
    var objects = loadObjects(projectDir);
    var objectVariables = loadObjectVariables(projectDir);
    var inkContent = generateInk(objectTypes, objects, objectVariables);

    if( !fs.existsSync(varsFunctionsPath(projectDir)) )
        fs.writeFileSync(varsFunctionsPath(projectDir), inkContent, "utf8");

    var inkFile = project.inkFileWithRelativePath(VARS_FUNCTIONS_FILENAME);
    if( !inkFile )
        inkFile = project.createInkFile(VARS_FUNCTIONS_FILENAME, isBrandNew = false);
    inkFile.isHiddenSystemFile = true;
    updateManagedInkFile(project, inkContent);

    if( project.mainInk.includes.indexOf(VARS_FUNCTIONS_FILENAME) === -1 )
        project.mainInk.addIncludeLine(VARS_FUNCTIONS_FILENAME);

    project.refreshIncludes();
    markHiddenSystemFiles(project);
    return true;
}

exports.getStatus = getStatus;
exports.filesReady = filesReady;
exports.loadObjectTypes = loadObjectTypes;
exports.loadObjects = loadObjects;
exports.loadObjectVariables = loadObjectVariables;
exports.loadAll = loadAll;
exports.saveObjectTypes = saveObjectTypes;
exports.saveObjects = saveObjects;
exports.saveAll = saveAll;
exports.regenerateInk = regenerateInk;
exports.createObjectsFiles = createObjectsFiles;
exports.markHiddenSystemFiles = markHiddenSystemFiles;
exports.VARS_FUNCTIONS_FILENAME = VARS_FUNCTIONS_FILENAME;
