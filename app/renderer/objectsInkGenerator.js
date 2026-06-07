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

function formatInkValue(value, type) {
    if( type === "boolean" )
        return value ? "true" : "false";
    if( type === "number" )
        return String(Number(value) || 0);
    if( type === "divert" ) {
        if( !value )
            return '""';
        return `-> ${value}`;
    }
    return `"${escapeInkString(value)}"`;
}

function inkVariableName(objectName, variableName) {
    return `${objectName}_${variableName}`;
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateInk(objectTypes, objects, objectVariables) {
    objectVariables = objectVariables || [];
    var lines = [
        "// Managed by Inky Objects. Do not edit manually.",
        ""
    ];

    // 1. Generate Object Declarations
    objects.forEach((object, index) => {
        var type = objectTypes.find(t => t.name === object.typeName);
        if( !type )
            return;

        type.variables.forEach(variable => {
            var value = object.values.hasOwnProperty(variable.name)
                ? object.values[variable.name]
                : defaultValueForType(variable.type);
            var varName = inkVariableName(object.name, variable.name);
            lines.push(`VAR ${varName} = ${formatInkValue(value, variable.type)}`);
        });

        lines.push("");
    });

    // 2. Generate Getters and Setters for Object Variables
    objectVariables.forEach(objVar => {
        var type = objectTypes.find(t => t.name === objVar.typeName);
        if( !type )
            return;

        lines.push("// ==========================================");
        lines.push(`// Object Variable: ${objVar.name} (${objVar.typeName})`);
        lines.push("// ==========================================");
        lines.push("");

        // Find all objects of this type
        var matchingObjects = objects.map((obj, idx) => ({ obj, idx })).filter(item => item.obj.typeName === type.name);

        type.variables.forEach(variable => {
            if (variable.name === "id")
                return;

            var capVarName = capitalize(variable.name);
            var getterName = `${objVar.name}Get${capVarName}`;
            var setterName = `${objVar.name}Set${capVarName}`;

            // Getter
            lines.push(`=== function ${getterName}()`);
            lines.push(`{ ${objVar.name}:`);
            matchingObjects.forEach(item => {
                var objVarName = inkVariableName(item.obj.name, variable.name);
                lines.push(`- ${item.obj.name}_id: ~ return ${objVarName}`);
            });
            var defaultVal = formatInkValue(defaultValueForType(variable.type), variable.type);
            lines.push(`- else: ~ return ${defaultVal}`);
            lines.push("}");
            lines.push("");

            // Setter
            lines.push(`=== function ${setterName}(val)`);
            lines.push(`{ ${objVar.name}:`);
            matchingObjects.forEach(item => {
                var objVarName = inkVariableName(item.obj.name, variable.name);
                lines.push(`- ${item.obj.name}_id: ~ ${objVarName} = val`);
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
