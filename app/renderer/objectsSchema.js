const _ = require("lodash");
const { VARIABLE_TYPES, SCHEMA_VERSION } = require("./objectsConstants.js");
const { defaultValueForType } = require("./objectsInkGenerator.js");

function emptyDocument() {
    return {
        version: SCHEMA_VERSION,
        objectTypes: []
    };
}

function normalizeDocument(data) {
    if( !data || typeof data !== "object" )
        return emptyDocument();

    var objectTypes = _.isArray(data.objectTypes) ? data.objectTypes : [];
    objectTypes = objectTypes.map(type => ({
        name: typeof type.name === "string" ? type.name.trim() : "",
        variables: _.isArray(type.variables) ? type.variables.map(v => ({
            name: typeof v.name === "string" ? v.name.trim() : "",
            type: VARIABLE_TYPES.indexOf(v.type) !== -1 ? v.type : "string"
        })) : []
    }));

    return {
        version: SCHEMA_VERSION,
        objectTypes: objectTypes
    };
}

function validateObjectTypes(objectTypes) {
    var errors = [];
    var typeNames = {};

    objectTypes.forEach((type, typeIndex) => {
        var typeLabel = type.name || `#${typeIndex + 1}`;

        if( !type.name || type.name.trim().length === 0 )
            errors.push({ message: "Object type name is required.", typeIndex: typeIndex });
        else if( typeNames[type.name] )
            errors.push({ message: `Duplicate object type name "${type.name}".`, typeIndex: typeIndex });
        else
            typeNames[type.name] = true;

        var variableNames = {};
        type.variables.forEach((variable, variableIndex) => {
            if( !variable.name || variable.name.trim().length === 0 )
                errors.push({ message: `Variable name is required in "${typeLabel}".`, typeIndex: typeIndex, variableIndex: variableIndex });
            else if( variableNames[variable.name] )
                errors.push({ message: `Duplicate variable "${variable.name}" in "${typeLabel}".`, typeIndex: typeIndex, variableIndex: variableIndex });
            else
                variableNames[variable.name] = true;

            if( VARIABLE_TYPES.indexOf(variable.type) === -1 )
                errors.push({ message: `Invalid type for variable "${variable.name}" in "${typeLabel}".`, typeIndex: typeIndex, variableIndex: variableIndex });
        });
    });

    return errors;
}

function parseJson(text) {
    try {
        return normalizeDocument(JSON.parse(text));
    } catch( err ) {
        return null;
    }
}

function emptyObjectsDocument() {
    return {
        version: SCHEMA_VERSION,
        objects: []
    };
}

function normalizeObjectsDocument(data) {
    if( !data || typeof data !== "object" )
        return emptyObjectsDocument();

    var objects = _.isArray(data.objects) ? data.objects : [];
    objects = objects.map(obj => ({
        name: typeof obj.name === "string" ? obj.name.trim() : "",
        typeName: typeof obj.typeName === "string" ? obj.typeName.trim() : "",
        values: obj.values && typeof obj.values === "object" ? obj.values : {}
    }));

    return {
        version: SCHEMA_VERSION,
        objects: objects
    };
}

function parseObjectsJson(text) {
    try {
        return normalizeObjectsDocument(JSON.parse(text));
    } catch( err ) {
        return null;
    }
}

function syncObjectsWithTypes(objectTypes, objects) {
    return objects.map(object => {
        var type = objectTypes.find(t => t.name === object.typeName);
        if( !type )
            return _.cloneDeep(object);

        var values = {};
        type.variables.forEach(variable => {
            if( object.values.hasOwnProperty(variable.name) )
                values[variable.name] = coerceValue(object.values[variable.name], variable.type);
            else
                values[variable.name] = defaultValueForType(variable.type);
        });

        return {
            name: object.name,
            typeName: object.typeName,
            values: values
        };
    });
}

function coerceValue(value, type) {
    if( type === "boolean" )
        return !!value;
    if( type === "number" )
        return Number(value) || 0;
    return value == null ? "" : String(value);
}

function createDefaultValuesForType(type) {
    var values = {};
    if( !type )
        return values;
    type.variables.forEach(variable => {
        values[variable.name] = defaultValueForType(variable.type);
    });
    return values;
}

function validateObjects(objectTypes, objects) {
    var errors = [];
    var objectNames = {};

    objects.forEach((object, objectIndex) => {
        var objectLabel = object.name || `#${objectIndex + 1}`;

        if( !object.name || object.name.trim().length === 0 )
            errors.push({ message: "Object name is required.", objectIndex: objectIndex });
        else if( objectNames[object.name] )
            errors.push({ message: `Duplicate object name "${object.name}".`, objectIndex: objectIndex });
        else
            objectNames[object.name] = true;

        if( !object.typeName || object.typeName.trim().length === 0 )
            errors.push({ message: `Object type is required for "${objectLabel}".`, objectIndex: objectIndex });
        else {
            var type = objectTypes.find(t => t.name === object.typeName);
            if( !type )
                errors.push({ message: `Unknown object type "${object.typeName}" for "${objectLabel}".`, objectIndex: objectIndex });
            else {
                type.variables.forEach(variable => {
                    var value = object.values[variable.name];
                    if( variable.type === "number" && value !== undefined && isNaN(Number(value)) )
                        errors.push({ message: `"${variable.name}" must be a number on object "${objectLabel}".`, objectIndex: objectIndex });
                });
            }
        }
    });

    return errors;
}

function validateAll(objectTypes, objects) {
    return validateObjectTypes(objectTypes).concat(validateObjects(objectTypes, objects));
}

exports.emptyObjectsDocument = emptyObjectsDocument;
exports.normalizeObjectsDocument = normalizeObjectsDocument;
exports.parseObjectsJson = parseObjectsJson;
exports.syncObjectsWithTypes = syncObjectsWithTypes;
exports.createDefaultValuesForType = createDefaultValuesForType;
exports.coerceValue = coerceValue;
exports.validateObjects = validateObjects;
exports.validateAll = validateAll;
exports.emptyDocument = emptyDocument;
exports.normalizeDocument = normalizeDocument;
exports.validateObjectTypes = validateObjectTypes;
exports.parseJson = parseJson;
