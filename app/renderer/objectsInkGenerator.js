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

function generateInk(objectTypes, objects) {
    var lines = [
        "// Managed by Inky Objects. Do not edit manually.",
        ""
    ];

    objects.forEach(object => {
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

        if( type.variables.length > 0 )
            lines.push("");
    });

    return lines.join("\n").replace(/\n+$/, "") + "\n";
}

exports.defaultValueForType = defaultValueForType;
exports.formatInkValue = formatInkValue;
exports.inkVariableName = inkVariableName;
exports.generateInk = generateInk;
