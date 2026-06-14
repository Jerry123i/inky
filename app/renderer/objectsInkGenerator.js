function escapeInkString(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
}

function defaultValueForType(type) {
    if( type === "boolean" )
        return false;
    if( type === "number" )
        return 0;
    return "";
}

function formatInkValue(value, type, enums) {
    if( type === "boolean" )
        return value ? "true" : "false";
    if( type === "number" )
        return String(Number(value) || 0);
    if( type === "divert" ) {
        if( !value )
            return '""';
        return "-> " + value;
    }
    
    // Check if the type is a custom enum category name
    if (enums && enums.some(e => e.name === type)) {
        if (!value)
            return "0";
        return String(value);
    }

    return '"' + escapeInkString(value) + '"';
}

function inkVariableName(objectName, variableName) {
    return objectName + "_" + variableName;
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateInk(objectTypes, objects, objectVariables, enums) {
    objectVariables = objectVariables || [];
    enums = enums || [];
    var lines = [
        "// Managed by Inky Objects. Do not edit manually.",
        ""
    ];

    // 1. Generate Enum Declarations
    // enums is now an array of categories: { name, items: [{ name, value }] }
    // Each item becomes: CONST itemName = value
    var hasEnums = enums.length > 0 && enums.some(function(cat) {
        return cat.items && cat.items.length > 0;
    });
    if( hasEnums ) {
        lines.push("// === Enums ===");
        enums.forEach(function(cat) {
            if (!cat.items || cat.items.length === 0) return;
            lines.push("// -- " + cat.name + " --");
            cat.items.forEach(function(item) {
                var val = typeof item.value === "string"
                    ? '"' + escapeInkString(item.value) + '"'
                    : String(Number(item.value) || 0);
                lines.push("CONST " + item.name + " = " + val);
            });
        });
        lines.push("");
    }

    // 2. Generate Object Declarations
    objects.forEach(function(object) {
        var type = objectTypes.find(function(t) { return t.name === object.typeName; });
        if( !type )
            return;

        type.variables.forEach(function(variable) {
            var value = object.values.hasOwnProperty(variable.name)
                ? object.values[variable.name]
                : defaultValueForType(variable.type);
            var varName = inkVariableName(object.name, variable.name);
            lines.push("VAR " + varName + " = " + formatInkValue(value, variable.type, enums));
        });

        lines.push("");
    });

    // 3. Generate Getters and Setters for Object Variables
    objectVariables.forEach(function(objVar) {
        var type = objectTypes.find(function(t) { return t.name === objVar.typeName; });
        if( !type )
            return;

        lines.push("// ==========================================");
        lines.push("// Object Variable: " + objVar.name + " (" + objVar.typeName + ")");
        lines.push("// ==========================================");
        lines.push("");

        // Find all objects of this type
        var matchingObjects = objects.map(function(obj, idx) { return { obj: obj, idx: idx }; })
            .filter(function(item) { return item.obj.typeName === type.name; });

        type.variables.forEach(function(variable) {
            if (variable.name === "id")
                return;

            var capVarName = capitalize(variable.name);
            var getterName = objVar.name + "Get" + capVarName;
            var setterName = objVar.name + "Set" + capVarName;

            // Getter
            lines.push("=== function " + getterName + "()");
            lines.push("{ " + objVar.name + ":");
            matchingObjects.forEach(function(item) {
                var objVarName = inkVariableName(item.obj.name, variable.name);
                lines.push("- " + item.obj.name + "_id: ~ return " + objVarName);
            });
            var defaultVal = formatInkValue(defaultValueForType(variable.type), variable.type, enums);
            lines.push("- else: ~ return " + defaultVal);
            lines.push("}");
            lines.push("");

            // Setter
            lines.push("=== function " + setterName + "(val)");
            lines.push("{ " + objVar.name + ":");
            matchingObjects.forEach(function(item) {
                var objVarName = inkVariableName(item.obj.name, variable.name);
                lines.push("- " + item.obj.name + "_id: ~ " + objVarName + " = val");
            });
            lines.push("}");
            lines.push("");
        });
    });

    return lines.join("\n").replace(/\n+$/, "") + "\n";
}

exports.defaultValueForType = defaultValueForType;
exports.formatInkValue = formatInkValue;
exports.inkVariableName = inkVariableName;
exports.generateInk = generateInk;