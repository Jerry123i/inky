const _ = require("lodash");
const { VARIABLE_TYPES, SCHEMA_VERSION, ENUM_VALUE_TYPES } = require("./objectsConstants.js");
const { defaultValueForType } = require("./objectsInkGenerator.js");

function emptyDocument() {
    return {
        version: SCHEMA_VERSION,
        objectTypes: [],
        objectVariables: [],
        enums: []
    };
}

function normalizeDocument(data) {
    if( !data || typeof data !== "object" )
        return emptyDocument();

    var enums = normalizeEnumCategories(_.isArray(data.enums) ? data.enums : []);
    var enumNames = enums.map(e => e.name);

    var objectTypes = _.isArray(data.objectTypes) ? data.objectTypes : [];
    objectTypes = objectTypes.map(type => ({
        name: typeof type.name === "string" ? type.name.trim() : "",
        variables: _.isArray(type.variables) ? type.variables.map(v => ({
            name: typeof v.name === "string" ? v.name.trim() : "",
            type: (VARIABLE_TYPES.indexOf(v.type) !== -1 || enumNames.indexOf(v.type) !== -1) ? v.type : "number"
        })) : []
    }));

    var objectVariables = _.isArray(data.objectVariables) ? data.objectVariables : [];
    objectVariables = objectVariables.map(ov => ({
        name: typeof ov.name === "string" ? ov.name.trim() : "",
        typeName: typeof ov.typeName === "string" ? ov.typeName.trim() : ""
    }));

    return {
        version: SCHEMA_VERSION,
        objectTypes: objectTypes,
        objectVariables: objectVariables,
        enums: enums
    };
}

function normalizeEnumItem(item, idx) {
    return {
        name: typeof item.name === "string" ? item.name.trim() : "",
        value: typeof item.value === "number" ? item.value
            : typeof item.value === "string" ? item.value
                : idx   
    };
}

function normalizeEnumCategories(raw) {
    if (!_.isArray(raw)) return [];

    return raw.map(function(cat) {
        return {
            name: typeof cat.name === "string" ? cat.name.trim() : "",
            items: _.isArray(cat.items)
                ? cat.items.map(function(item, idx) { return normalizeEnumItem(item, idx); })
                : []
        };
    });
}

function validateObjectTypes(objectTypes, enums) {
    var errors = [];
    var typeNames = {};
    var enumNames = enums ? enums.map(e => e.name) : [];

    objectTypes.forEach((type, typeIndex) => {
        var typeLabel = type.name || ("#" + (typeIndex + 1));

        if( !type.name || type.name.trim().length === 0 )
            errors.push({ message: "Object type name is required.", typeIndex: typeIndex });
        else if( typeNames[type.name] )
            errors.push({ message: "Duplicate object type name \"" + type.name + "\".", typeIndex: typeIndex });
        else
            typeNames[type.name] = true;

        var variableNames = {};
        type.variables.forEach((variable, variableIndex) => {
            if( !variable.name || variable.name.trim().length === 0 )
                errors.push({ message: "Variable name is required in \"" + typeLabel + "\".", typeIndex: typeIndex, variableIndex: variableIndex });
            else if( variableNames[variable.name] )
                errors.push({ message: "Duplicate variable \"" + variable.name + "\" in \"" + typeLabel + "\".", typeIndex: typeIndex, variableIndex: variableIndex });
            else
                variableNames[variable.name] = true;

            if( VARIABLE_TYPES.indexOf(variable.type) === -1 && enumNames.indexOf(variable.type) === -1 )
                errors.push({ message: "Invalid type for variable \"" + variable.name + "\" in \"" + typeLabel + "\".", typeIndex: typeIndex, variableIndex: variableIndex });
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

function normalizeColorHex(value) {
    var cleaned = String(value == null ? "" : value).replace(/^#/, "").trim().toLowerCase();
    if( /^[0-9a-f]{6}$/.test(cleaned) )
        return cleaned;
    if( /^[0-9a-f]{3}$/.test(cleaned) )
        return cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
    return "000000";
}

function coerceValue(value, type) {
    if( type === "boolean" )
        return !!value;
    if( type === "number" )
        return Number(value) || 0;
    if( type === "color" )
        return normalizeColorHex(value);
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

function validateObjects(objectTypes, objects, enums) {
    var errors = [];
    var objectNames = {};

    objects.forEach((object, objectIndex) => {
        var objectLabel = object.name || ("#" + (objectIndex + 1));

        if( !object.name || object.name.trim().length === 0 )
            errors.push({ message: "Object name is required.", objectIndex: objectIndex });
        else if( objectNames[object.name] )
            errors.push({ message: "Duplicate object name \"" + object.name + "\".", objectIndex: objectIndex });
        else
            objectNames[object.name] = true;

        if( !object.typeName || object.typeName.trim().length === 0 )
            errors.push({ message: "Object type is required for \"" + objectLabel + "\".", objectIndex: objectIndex });
        else {
            var type = objectTypes.find(t => t.name === object.typeName);
            if( !type )
                errors.push({ message: "Unknown object type \"" + object.typeName + "\" for \"" + objectLabel + "\".", objectIndex: objectIndex });
            else {
                type.variables.forEach(variable => {
                    var value = object.values[variable.name];
                    if( variable.type === "number" && value !== undefined && isNaN(Number(value)) )
                        errors.push({ message: "\"" + variable.name + "\" must be a number on object \"" + objectLabel + "\".", objectIndex: objectIndex });

                    if( variable.type === "color" && value !== undefined && value !== "" ) {
                        var colorHex = String(value).replace(/^#/, "");
                        if( !/^[0-9a-fA-F]{6}$/.test(colorHex) )
                            errors.push({ message: "\"" + variable.name + "\" must be a 6-digit hex color on object \"" + objectLabel + "\".", objectIndex: objectIndex });
                    }

                    // Validate custom enum type value is defined in the enum
                    var foundEnum = enums && enums.find(e => e.name === variable.type);
                    if (foundEnum && value) {
                        var hasItem = foundEnum.items.some(item => item.name === value);
                        if (!hasItem) {
                            errors.push({ message: "\"" + variable.name + "\" has invalid enum value \"" + value + "\" for enum type \"" + variable.type + "\" on object \"" + objectLabel + "\".", objectIndex: objectIndex });
                        }
                    }
                });
            }
        }
    });

    return errors;
}

function validateEnums(enums) {
    var errors = [];
    var categoryNames = {};

    enums.forEach(function(cat, catIndex) {
        var catLabel = cat.name && cat.name.trim() ? cat.name : ("#" + (catIndex + 1));

        if (!cat.name || cat.name.trim().length === 0)
            errors.push({ message: "Enum category #" + (catIndex + 1) + ": name is required.", enumIndex: catIndex });
        else if (categoryNames[cat.name])
            errors.push({ message: "Duplicate enum category name \"" + cat.name + "\".", enumIndex: catIndex });
        else
            categoryNames[cat.name] = true;

        if (!_.isArray(cat.items)) return;

        cat.items.forEach(function(item, itemIndex) {
            if (!item.name || item.name.trim().length === 0)
                errors.push({ message: "Item #" + (itemIndex + 1) + " in \"" + catLabel + "\": name is required.", enumIndex: catIndex, enumItemIndex: itemIndex });

            if (typeof item.value !== "number" && typeof item.value !== "string")
                errors.push({ message: "Item \"" + (item.name || (itemIndex + 1)) + "\" in \"" + catLabel + "\": value must be a number or string.", enumIndex: catIndex, enumItemIndex: itemIndex });
        });
    });

    return errors;
}

function validateAll(objectTypes, objects, enums) {
    var errors = validateObjectTypes(objectTypes, enums).concat(validateObjects(objectTypes, objects, enums));
    if( enums )
        errors = errors.concat(validateEnums(enums));
    return errors;
}

exports.emptyObjectsDocument = emptyObjectsDocument;
exports.normalizeObjectsDocument = normalizeObjectsDocument;
exports.parseObjectsJson = parseObjectsJson;
exports.syncObjectsWithTypes = syncObjectsWithTypes;
exports.createDefaultValuesForType = createDefaultValuesForType;
exports.coerceValue = coerceValue;
exports.normalizeColorHex = normalizeColorHex;
exports.validateObjects = validateObjects;
exports.validateEnums = validateEnums;
exports.normalizeEnumCategories = normalizeEnumCategories;
exports.validateAll = validateAll;
exports.emptyDocument = emptyDocument;
exports.normalizeDocument = normalizeDocument;
exports.validateObjectTypes = validateObjectTypes;
exports.parseJson = parseJson;