const path = require("path");

exports.BLOB_CLASSES_FILENAME = "Ink_blob_classes.json";
exports.BLOB_OBJECTS_FILENAME = "Ink_blob_objects.json";
exports.BLOB_FILES_FILENAME = "Ink_blob_files.json";
exports.VARS_FUNCTIONS_STUB = "// Managed by Inky Objects. Do not edit manually.\n";
exports.VARS_FUNCTIONS_FILENAME = "ObjectVariablesFunctions";
exports.FILES_MANAGER_FILENAME = "FilesManager";
exports.VARIABLE_TYPES = ["boolean", "number", "string", "color", "divert", "image", "audio"];
exports.ENUM_VALUE_TYPES = ["number", "string"];
exports.SCHEMA_VERSION = 1;

exports.isManagedObjectsInkFile = function(file) {
    if( !file || !file.relativePath )
        return false;

    var baseName = path.basename(file.relativePath(), ".ink");
    return baseName === exports.VARS_FUNCTIONS_FILENAME
        || baseName === exports.FILES_MANAGER_FILENAME;
};
 