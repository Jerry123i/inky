const fs = require("fs");
const path = require("path");
const {
    BLOB_CLASSES_FILENAME,
    BLOB_OBJECTS_FILENAME,
    VARS_FUNCTIONS_FILENAME,
    VARS_FUNCTIONS_STUB,
    FILES_MANAGER_FILENAME,
    BLOB_FILES_FILENAME
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
const { generateInk, generateFilesInk } = require("./objectsInkGenerator.js");
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

function filesManagerPath(projectDir) {
    return path.join(projectDir, FILES_MANAGER_FILENAME);
}

function blobFilesPath(projectDir) {
    return path.join(projectDir, BLOB_FILES_FILENAME);
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
            includePresent: false,
            filesJsonExists: false,
            filesInkExists: false,
            filesIncludePresent: false
        };
    }

    return {
        projectSaved: true,
        jsonExists: fs.existsSync(blobClassesPath(projectDir)),
        objectsJsonExists: fs.existsSync(blobObjectsPath(projectDir)),
        inkExists: fs.existsSync(varsFunctionsPath(projectDir)),
        includePresent: project.mainInk.includes.indexOf(VARS_FUNCTIONS_FILENAME) !== -1,
        filesJsonExists: fs.existsSync(blobFilesPath(projectDir)),
        filesInkExists: fs.existsSync(filesManagerPath(projectDir)),
        filesIncludePresent: project.mainInk.includes.indexOf(FILES_MANAGER_FILENAME) !== -1
    };
}

function filesReady(status) {
    return status.projectSaved
        && status.jsonExists
        && status.objectsJsonExists
        && status.inkExists
        && status.includePresent
        && status.filesJsonExists
        && status.filesInkExists
        && status.filesIncludePresent;
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

function loadEnums(projectDir) {
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
        return doc.enums || [];
    } catch( err ) {
        return [];
    }
}

function loadFiles(projectDir) {
    if( !projectDir )
        return [];

    var filePath = blobFilesPath(projectDir);
    if( !fs.existsSync(filePath) )
        return [];

    try {
        var text = fs.readFileSync(filePath, "utf8");
        var doc = JSON.parse(text);
        if( !doc )
            return [];
        return doc.files || [];
    } catch( err ) {
        return [];
    }
}

function saveFiles(projectDir, files) {
    var doc = { version: 1, files: files || [] };
    writeJsonFile(blobFilesPath(projectDir), doc);
}

function loadAll(projectDir) {
    var objectTypes = loadObjectTypes(projectDir);
    var objects = syncObjectsWithTypes(objectTypes, loadObjects(projectDir));
    var objectVariables = loadObjectVariables(projectDir);
    var enums = loadEnums(projectDir);
    var files = loadFiles(projectDir);
    return { objectTypes, objects, objectVariables, enums, files };
}

function saveObjectTypes(projectDir, objectTypes, objectVariables, enums) {
    var doc = normalizeDocument({ version: 1, objectTypes: objectTypes, objectVariables: objectVariables || [], enums: enums || [] });
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

function updateManagedFilesInkFile(project, content) {
    var projectDir = project.mainInk.projectDir;
    fs.writeFileSync(filesManagerPath(projectDir), content, "utf8");

    var inkFile = project.inkFileWithRelativePath(FILES_MANAGER_FILENAME);
    if( inkFile ) {
        inkFile.justLoadedContent = true;
        inkFile.setValue(content);
        inkFile.hasUnsavedChanges = false;
        inkFile.compilerVersionDirty = true;
        inkFile.justLoadedContent = false;
    }

    LiveCompiler.setEdited();
}

function regenerateInk(project, objectTypes, objects, objectVariables, enums) {
    var projectDir = project.mainInk.projectDir;
    if( typeof objectVariables === "undefined" )
        objectVariables = loadObjectVariables(projectDir);
    if( typeof enums === "undefined" )
        enums = loadEnums(projectDir);
    var content = generateInk(objectTypes, objects, objectVariables, enums);
    updateManagedInkFile(project, content);
}

function regenerateFilesInk(project, files) {
    var projectDir = project.mainInk.projectDir;
    if( typeof files === "undefined" )
        files = loadFiles(projectDir);
    var content = generateFilesInk(files);
    updateManagedFilesInkFile(project, content);
}

function saveAll(project, objectTypes, objects, objectVariables, enums, files) {
    var projectDir = project.mainInk.projectDir;
    if( !projectDir )
        return { success: false, errors: [] };

    if( typeof objectVariables === "undefined" )
        objectVariables = loadObjectVariables(projectDir);
    if( typeof enums === "undefined" )
        enums = loadEnums(projectDir);
    if( typeof files === "undefined" )
        files = loadFiles(projectDir);

    objects = syncObjectsWithTypes(objectTypes, objects);
    var errors = validateAll(objectTypes, objects, enums);
    if( errors.length > 0 )
        return { success: false, errors: errors, objects: objects };

    saveObjectTypes(projectDir, objectTypes, objectVariables, enums);
    saveObjects(projectDir, objects);
    saveFiles(projectDir, files);
    regenerateInk(project, objectTypes, objects, objectVariables, enums);
    regenerateFilesInk(project, files);
    return { success: true, errors: [], objects: objects };
}

function markHiddenSystemFiles(project) {
    project.files.forEach(file => {
        if( file.relativePath() === VARS_FUNCTIONS_FILENAME || file.relativePath() === FILES_MANAGER_FILENAME )
            file.isHiddenSystemFile = true;
    });
}

function createObjectsFiles(project) {
    var projectDir = project.mainInk.projectDir;
    if( !projectDir )
        return false;

    if( !fs.existsSync(blobClassesPath(projectDir)) )
        saveObjectTypes(projectDir, [], [], []);

    if( !fs.existsSync(blobObjectsPath(projectDir)) )
        saveObjects(projectDir, []);

    if( !fs.existsSync(blobFilesPath(projectDir)) )
        saveFiles(projectDir, []);

    var objectTypes = loadObjectTypes(projectDir);
    var objects = loadObjects(projectDir);
    var objectVariables = loadObjectVariables(projectDir);
    var enums = loadEnums(projectDir);
    var inkContent = generateInk(objectTypes, objects, objectVariables, enums);

    if( !fs.existsSync(varsFunctionsPath(projectDir)) )
        fs.writeFileSync(varsFunctionsPath(projectDir), inkContent, "utf8");

    var inkFile = project.inkFileWithRelativePath(VARS_FUNCTIONS_FILENAME);
    if( !inkFile )
        inkFile = project.createInkFile(VARS_FUNCTIONS_FILENAME, isBrandNew = false);
    inkFile.isHiddenSystemFile = true;
    updateManagedInkFile(project, inkContent);

    if( project.mainInk.includes.indexOf(VARS_FUNCTIONS_FILENAME) === -1 )
        project.mainInk.addIncludeLine(VARS_FUNCTIONS_FILENAME);

    var files = loadFiles(projectDir);
    var filesInkContent = generateFilesInk(files);
    if( !fs.existsSync(filesManagerPath(projectDir)) )
        fs.writeFileSync(filesManagerPath(projectDir), filesInkContent, "utf8");

    var filesInkFile = project.inkFileWithRelativePath(FILES_MANAGER_FILENAME);
    if( !filesInkFile )
        filesInkFile = project.createInkFile(FILES_MANAGER_FILENAME, isBrandNew = false);
    filesInkFile.isHiddenSystemFile = true;
    updateManagedFilesInkFile(project, filesInkContent);

    if( project.mainInk.includes.indexOf(FILES_MANAGER_FILENAME) === -1 )
        project.mainInk.addIncludeLine(FILES_MANAGER_FILENAME);

    project.refreshIncludes();
    markHiddenSystemFiles(project);
    return true;
}

exports.getStatus = getStatus;
exports.filesReady = filesReady;
exports.loadObjectTypes = loadObjectTypes;
exports.loadObjects = loadObjects;
exports.loadObjectVariables = loadObjectVariables;
exports.loadEnums = loadEnums;
exports.loadFiles = loadFiles;
exports.saveFiles = saveFiles;
exports.loadAll = loadAll;
exports.saveObjectTypes = saveObjectTypes;
exports.saveObjects = saveObjects;
exports.saveAll = saveAll;
exports.regenerateInk = regenerateInk;
exports.regenerateFilesInk = regenerateFilesInk;
exports.createObjectsFiles = createObjectsFiles;
exports.markHiddenSystemFiles = markHiddenSystemFiles;
exports.VARS_FUNCTIONS_FILENAME = VARS_FUNCTIONS_FILENAME;
exports.FILES_MANAGER_FILENAME = FILES_MANAGER_FILENAME;