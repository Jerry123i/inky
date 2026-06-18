const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const _ = require("lodash");
const i18n = require("./i18n.js");
const InkProject = require("./inkProject.js").InkProject;
const ObjectsManager = require("./objectsManager.js");
const {
    validateAll,
    createDefaultValuesForType,
    coerceValue
} = require("./objectsSchema.js");
const { VARIABLE_TYPES } = require("./objectsConstants.js");

var $objectsEditor = null;
var $editor = null;
var $missingState = null;
var $editorState = null;
var $createFilesButton = null;
var $saveProjectMessage = null;
var $validationErrors = null;
var $typeList = null;
var $typeNameInput = null;
var $variablesBody = null;
var $addTypeButton = null;
var $deleteTypeButton = null;
var $addVariableButton = null;
var $instanceList = null;
var $instanceNameInput = null;
var $instanceTypeSelect = null;
var $instanceValuesBody = null;
var $newObjectButton = null;
var $deleteObjectButton = null;
var $tabItems = null;
var $classesSection = null;
var $instancesSection = null;
var $filesSection = null;
var $filesBody = null;
var $objectVariablesSection = null;
var $objectVarList = null;
var $objectVarDetailPanel = null;

var selectedObjectVarIndex = -1;

var visible = false;
var activeTab = "enums";
var objectTypes = [];
var objects = [];
var objectVariables = [];
var files = [];
var selectedTypeIndex = -1;
var selectedObjectIndex = -1;
var previousTypeName = "";
var saveTimeout = null;
var events = {};
var isCreatingObject = false;

// ---------------------------------------------------------------------------
// Enum state  (categories with items)
// ---------------------------------------------------------------------------
var enums = [];                 // [{ name, items: [{ name, value }] }]
var selectedEnumCatIndex = -1;  // which category is selected in the left panel

var $enumsSection = null;
var $enumCategoryList = null;
var $addEnumCategoryButton = null;
var $enumDetailPanel = null;

function generateRandomId() {
    return Math.floor(Math.random() * 1000000000);
}

var SOUND_EXTENSIONS = [".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a", ".wma"];

function isRegisteredSoundFile(originalName) {
    if( !originalName )
        return false;
    var ext = originalName.substring(originalName.lastIndexOf(".")).toLowerCase();
    return SOUND_EXTENSIONS.indexOf(ext) !== -1;
}

function registeredFilesForMediaType(mediaType) {
    return files.filter(file => {
        if( !file.varName || !file.varName.trim() || !file.fileName )
            return false;
        var isSound = isRegisteredSoundFile(file.originalName);
        return mediaType === "audio" ? isSound : !isSound;
    });
}

function isRegisteredMediaReference(value, mediaType) {
    if( !value )
        return true;
    return registeredFilesForMediaType(mediaType).some(file => file.fileName === value);
}

function buildMediaFileOptions(mediaType, selectedValue, options) {
    options = options || {};
    var html = [];
    if( options.placeholder ) {
        html.push('<option value="" disabled selected>' + options.placeholder + '</option>');
    }
    html.push('<option value=""' + (!options.placeholder && !selectedValue ? " selected" : "") + '>' + i18n._("(none)") + '</option>');
    registeredFilesForMediaType(mediaType).forEach(file => {
        var refName = file.fileName || "";
        html.push(
            '<option value="' + refName + '"' + (selectedValue === refName ? " selected" : "") + '>'
            + file.varName + '</option>'
        );
    });
    return html.join("");
}

$(document).ready(() => {
    $objectsEditor = $("#objects-editor");
    $editor = $("#editor");
    $missingState = $objectsEditor.find(".objects-missing-state");
    $editorState = $objectsEditor.find(".objects-editor-state");
    $createFilesButton = $objectsEditor.find(".create-objects-files-button");
    $saveProjectMessage = $objectsEditor.find(".objects-save-project-message");
    $validationErrors = $objectsEditor.find(".objects-validation-errors");
    $typeList = $objectsEditor.find(".objects-type-list");
    $typeNameInput = $objectsEditor.find(".objects-type-name-input");
    $variablesBody = $objectsEditor.find(".objects-variables-body");
    $addTypeButton = $objectsEditor.find(".objects-add-type-button");
    $deleteTypeButton = $objectsEditor.find(".objects-delete-type-button");
    $addVariableButton = $objectsEditor.find(".objects-add-variable-button");
    $instanceList = $objectsEditor.find(".objects-instance-list");
    $instanceNameInput = $objectsEditor.find(".objects-instance-name-input");
    $instanceTypeSelect = $objectsEditor.find(".objects-instance-type-select");
    $instanceValuesBody = $objectsEditor.find(".objects-instance-values-body");
    $newObjectButton = $objectsEditor.find(".objects-new-object-button");
    $deleteObjectButton = $objectsEditor.find(".objects-delete-object-button");
    $tabItems = $objectsEditor.find(".objects-tab-item");
    $enumsSection = $objectsEditor.find(".objects-enums-section");
    $classesSection = $objectsEditor.find(".objects-classes-section");
    $instancesSection = $objectsEditor.find(".objects-instances-section");
    $filesSection = $objectsEditor.find(".objects-files-section");
    $filesBody = $objectsEditor.find(".objects-files-body");

    $objectVariablesSection = $objectsEditor.find(".objects-objectvariables-section");
    $objectVarList = $objectsEditor.find(".objects-objectvar-list");
    $objectVarDetailPanel = $objectsEditor.find(".objects-objectvar-detail-panel");

    $enumCategoryList = $objectsEditor.find(".objects-enum-category-list");
    $addEnumCategoryButton = $objectsEditor.find(".objects-add-enum-category-button");
    $enumDetailPanel = $objectsEditor.find(".objects-enum-detail-panel");

    // -----------------------------------------------------------------------
    // Enum category events
    // -----------------------------------------------------------------------

    // Add a new category
    $addEnumCategoryButton.on("click", () => {
        enums.push({ name: "NewCategory", items: [] });
        selectedEnumCatIndex = enums.length - 1;
        renderEnums();
        scheduleSave();
    });

    // Select a category
    $enumCategoryList.on("click", ".objects-enum-cat-item", function() {
        selectedEnumCatIndex = parseInt($(this).attr("data-cat-index"), 10);
        renderEnums();
    });

    // Rename a category
    $enumDetailPanel.on("input", ".objects-enum-cat-name-input", function() {
        var catIndex = selectedEnumCatIndex;
        if (catIndex < 0 || catIndex >= enums.length) return;
        var oldName = enums[catIndex].name;
        var newName = $(this).val();
        enums[catIndex].name = newName;

        // Update any object type variables using this enum
        if (oldName && oldName !== newName) {
            objectTypes.forEach(type => {
                type.variables.forEach(variable => {
                    if (variable.type === oldName) {
                        variable.type = newName;
                    }
                });
            });
        }

        // Update the header title and the sidebar item text in real-time
        $enumDetailPanel.find(".objects-panel-header h4").text(enums[catIndex].name || i18n._("(unnamed)"));

        var $sidebarItem = $enumCategoryList.find('.objects-enum-cat-item[data-cat-index="' + catIndex + '"]');
        var itemCountText = ' (' + enums[catIndex].items.length + ' item' + (enums[catIndex].items.length === 1 ? '' : 's') + ')';
        $sidebarItem.html((enums[catIndex].name || i18n._("(unnamed)")) + '<span style="font-size:11px; opacity:0.6; margin-left:4px;">' + itemCountText + '</span>');

        renderValidation();
        scheduleSave();
    });

    // Delete a category
    $objectsEditor.on("click", ".objects-delete-enum-cat-button", function() {
        var catIndex = parseInt($(this).attr("data-cat-index"), 10);
        if (catIndex < 0 || catIndex >= enums.length) return;

        var deletedEnumName = enums[catIndex].name;
        enums.splice(catIndex, 1);
        if (selectedEnumCatIndex >= enums.length) selectedEnumCatIndex = enums.length - 1;

        // If an enum type is deleted and it's being used in an object variable,
        // that object variable should be changed into a normal "number" variable.
        objectTypes.forEach(type => {
            type.variables.forEach(variable => {
                if (variable.type === deletedEnumName) {
                    variable.type = "number";
                }
            });
        });

        renderEnums();
        render();
        scheduleSave();
    });

    // Add an item to the selected category
    $objectsEditor.on("click", ".objects-add-enum-item-button", function() {
        var catIndex = parseInt($(this).attr("data-cat-index"), 10);
        if (catIndex < 0 || catIndex >= enums.length) return;
        var nextValue = enums[catIndex].items.length; // default = index
        enums[catIndex].items.push({ name: "", value: nextValue });
        renderEnumDetailPanel(catIndex);
        renderValidation();
        scheduleSave();
    });

    // Edit item name
    $enumDetailPanel.on("input", ".objects-enum-item-name", function() {
        var catIndex = parseInt($(this).attr("data-cat-index"), 10);
        var itemIndex = parseInt($(this).attr("data-item-index"), 10);
        if (catIndex < 0 || catIndex >= enums.length) return;
        if (itemIndex < 0 || itemIndex >= enums[catIndex].items.length) return;
        enums[catIndex].items[itemIndex].name = $(this).val();
        renderValidation();
        scheduleSave();
    });

    // Edit item value
    $enumDetailPanel.on("input", ".objects-enum-item-value", function() {
        var catIndex = parseInt($(this).attr("data-cat-index"), 10);
        var itemIndex = parseInt($(this).attr("data-item-index"), 10);
        if (catIndex < 0 || catIndex >= enums.length) return;
        if (itemIndex < 0 || itemIndex >= enums[catIndex].items.length) return;
        var raw = $(this).val();
        var asNum = parseFloat(raw);
        enums[catIndex].items[itemIndex].value = isNaN(asNum) ? raw : asNum;
        renderValidation();
        scheduleSave();
    });

    // Delete an item
    $enumDetailPanel.on("click", ".objects-remove-enum-item-button", function() {
        var catIndex = parseInt($(this).attr("data-cat-index"), 10);
        var itemIndex = parseInt($(this).attr("data-item-index"), 10);
        if (catIndex < 0 || catIndex >= enums.length) return;
        enums[catIndex].items.splice(itemIndex, 1);
        renderEnumDetailPanel(catIndex);
        renderValidation();
        scheduleSave();
    });

    // -----------------------------------------------------------------------
    // Tab events
    // -----------------------------------------------------------------------
    $tabItems.on("click", function() {
        activeTab = $(this).attr("data-tab");
        isCreatingObject = false;
        render();
    });

    // -----------------------------------------------------------------------
    // Create files
    // -----------------------------------------------------------------------
    $createFilesButton.on("click", () => {
        var project = InkProject.currentProject;
        if( !project || !project.mainInk.projectDir )
            return;

        if( ObjectsManager.createObjectsFiles(project) )
            refresh();
    });

    // -----------------------------------------------------------------------
    // Object type events
    // -----------------------------------------------------------------------
    $addTypeButton.on("click", () => {
        objectTypes.push({ name: "newType", variables: [{name: "id", type: "number"}] });
        selectedTypeIndex = objectTypes.length - 1;
        previousTypeName = "";
        render();
        scheduleSave();
    });

    $deleteTypeButton.on("click", () => {
        if( selectedTypeIndex < 0 || selectedTypeIndex >= objectTypes.length )
            return;

        var deletedTypeName = objectTypes[selectedTypeIndex].name;
        objectTypes.splice(selectedTypeIndex, 1);
        objects = objects.filter(obj => obj.typeName !== deletedTypeName);
        objectVariables = objectVariables.filter(ov => ov.typeName !== deletedTypeName);

        if( selectedTypeIndex >= objectTypes.length )
            selectedTypeIndex = objectTypes.length - 1;
        if( selectedObjectIndex >= objects.length )
            selectedObjectIndex = objects.length - 1;
        previousTypeName = selectedTypeIndex >= 0 ? objectTypes[selectedTypeIndex].name : "";
        render();
        scheduleSave();
    });

    $addVariableButton.on("click", () => {
        if( selectedTypeIndex < 0 )
            return;

        var type = objectTypes[selectedTypeIndex];
        var newVariable = { name: "", type: "string" };
        type.variables.push(newVariable);
        render();
        scheduleSave();
    });

    $typeList.on("click", ".objects-type-item", function() {
        selectedTypeIndex = parseInt($(this).attr("data-type-index"), 10);
        previousTypeName = objectTypes[selectedTypeIndex] ? objectTypes[selectedTypeIndex].name : "";
        render();
    });

    $typeNameInput.on("input", () => {
        if( selectedTypeIndex < 0 )
            return;
        objectTypes[selectedTypeIndex].name = $typeNameInput.val();
        renderTypeList();
        renderValidation();
        scheduleSave();
    });

    $typeNameInput.on("blur", () => {
        if( selectedTypeIndex < 0 )
            return;

        var newName = objectTypes[selectedTypeIndex].name;
        if( previousTypeName && previousTypeName !== newName ) {
            objects.forEach(obj => {
                if( obj.typeName === previousTypeName )
                    obj.typeName = newName;
            });
            objectVariables.forEach(ov => {
                if( ov.typeName === previousTypeName )
                    ov.typeName = newName;
            });
            renderInstanceList();
            renderInstanceEditor();
            scheduleSave();
        }
        previousTypeName = newName;
    });

    $variablesBody.on("input", ".objects-variable-name", function() {
        var variableIndex = parseInt($(this).closest("tr").attr("data-variable-index"), 10);
        if (
            selectedTypeIndex >= 0 &&
            objectTypes[selectedTypeIndex].variables[variableIndex].name === "id"
        )
            return;
        if( selectedTypeIndex < 0 )
            return;
        objectTypes[selectedTypeIndex].variables[variableIndex].name = $(this).val();
        renderValidation();
        scheduleSave();
    });

    $variablesBody.on("blur", ".objects-variable-name", function() {
        var variableIndex = parseInt($(this).closest("tr").attr("data-variable-index"), 10);
        var oldName = $(this).attr("data-previous-name");
        var newName = $(this).val();
        if( selectedTypeIndex < 0 || !oldName || oldName === newName )
            return;

        var typeName = objectTypes[selectedTypeIndex].name;
        objects.forEach(obj => {
            if( obj.typeName !== typeName )
                return;
            if( obj.values.hasOwnProperty(oldName) ) {
                obj.values[newName] = obj.values[oldName];
                delete obj.values[oldName];
            }
        });
        $(this).attr("data-previous-name", newName);
        renderInstanceEditor();
        scheduleSave();
    });

    $variablesBody.on("change", ".objects-variable-type", function() {
        var variableIndex = parseInt($(this).closest("tr").attr("data-variable-index"), 10);
        if( selectedTypeIndex < 0 )
            return;

        var type = objectTypes[selectedTypeIndex];
        var variable = type.variables[variableIndex];
        var oldType = variable.type;
        variable.type = $(this).val();

        objects.forEach(obj => {
            if( obj.typeName !== type.name )
                return;
            if( obj.values.hasOwnProperty(variable.name) )
                obj.values[variable.name] = coerceValue(obj.values[variable.name], variable.type);
            else
                obj.values[variable.name] = coerceValue(null, variable.type);

            if( oldType !== variable.type && obj.values.hasOwnProperty(variable.name) )
                obj.values[variable.name] = coerceValue(obj.values[variable.name], variable.type);
        });

        renderInstanceEditor();
        scheduleSave();
    });

    $variablesBody.on("click", ".objects-remove-variable-button", function() {
        var variableIndex = parseInt($(this).closest("tr").attr("data-variable-index"), 10);
        if( selectedTypeIndex < 0 )
            return;

        var type = objectTypes[selectedTypeIndex];
        if (
            type.variables[variableIndex] &&
            type.variables[variableIndex].name === "id"
        )
            return;

        var removedName = type.variables[variableIndex].name;
        type.variables.splice(variableIndex, 1);

        objects.forEach(obj => {
            if( obj.typeName === type.name && obj.values.hasOwnProperty(removedName) )
                delete obj.values[removedName];
        });

        render();
        scheduleSave();
    });

    // -----------------------------------------------------------------------
    // Object instance events
    // -----------------------------------------------------------------------
    $newObjectButton.on("click", () => {
        isCreatingObject = true;
        selectedObjectIndex = -1;
        render();
    });

    $deleteObjectButton.on("click", () => {
        if( selectedObjectIndex < 0 || selectedObjectIndex >= objects.length )
            return;
        objects.splice(selectedObjectIndex, 1);
        if( selectedObjectIndex >= objects.length )
            selectedObjectIndex = objects.length - 1;
        isCreatingObject = false;
        render();
        scheduleSave();
    });

    $instanceList.on("click", ".objects-instance-item", function() {
        isCreatingObject = false;
        selectedObjectIndex = parseInt($(this).attr("data-object-index"), 10);
        renderInstanceEditor();
        renderInstanceList();
    });

    $instanceNameInput.on("input", () => {
        if( selectedObjectIndex < 0 )
            return;
        objects[selectedObjectIndex].name = $instanceNameInput.val();
        renderInstanceList();
        renderValidation();
        scheduleSave();
    });

    $instanceTypeSelect.on("change", () => {
        if (isCreatingObject) {
            var newTypeName = $instanceTypeSelect.val();
            var type = objectTypes.find(t => t.name === newTypeName);
            if (!type) return;

            var values = createDefaultValuesForType(type);
            values.id = generateRandomId();

            var newObject = {
                id: values.id,
                name: "new_" + type.name,
                typeName: type.name,
                values: values
            };
            objects.push(newObject);
            selectedObjectIndex = objects.length - 1;
            isCreatingObject = false;
            render();
            scheduleSave();
            return;
        }

        if( selectedObjectIndex < 0 )
            return;

        var object = objects[selectedObjectIndex];
        var newTypeName = $instanceTypeSelect.val();
        var type = objectTypes.find(t => t.name === newTypeName);
        object.typeName = newTypeName;
        object.values = createDefaultValuesForType(type);
        renderInstanceEditor();
        scheduleSave();
    });

    $instanceValuesBody.on("click", ".objects-media-value-change-button", function() {
        var $wrap = $(this).closest(".objects-media-value-wrap");
        $wrap.addClass("objects-media-value-wrap--picker-open");
        $wrap.find(".objects-media-value-select").focus();
    });

    $instanceValuesBody.on("blur", ".objects-media-value-select", function() {
        $(this).closest(".objects-media-value-wrap").removeClass("objects-media-value-wrap--picker-open");
    });

    $instanceValuesBody.on("blur", ".objects-color-hex-input", function() {
        var variableName = $(this).closest("tr").attr("data-variable-name");
        if( selectedObjectIndex < 0 )
            return;

        var object = objects[selectedObjectIndex];
        var type = objectTypes.find(t => t.name === object.typeName);
        if( !type )
            return;

        var variable = type.variables.find(v => v.name === variableName);
        if( !variable || variable.type !== "color" )
            return;

        var hex = coerceValue($(this).val(), "color");
        object.values[variableName] = hex;
        var $wrap = $(this).closest(".objects-color-value-wrap");
        $wrap.find(".objects-color-hex-input").val(hex);
        $wrap.find(".objects-color-picker").val("#" + hex);
        renderValidation();
        scheduleSave();
    });

    $instanceValuesBody.on("input change", ".objects-instance-value", function() {
        var variableName = $(this).closest("tr").attr("data-variable-name");
        if( selectedObjectIndex < 0 )
            return;

        var object = objects[selectedObjectIndex];
        var type = objectTypes.find(t => t.name === object.typeName);
        if( !type )
            return;

        var variable = type.variables.find(v => v.name === variableName);
        if( !variable )
            return;

        if( variable.type === "boolean" )
            object.values[variableName] = $(this).is(":checked");
        else if( variable.type === "number" )
            object.values[variableName] = $(this).val();
        else if( variable.type === "color" ) {
            if( $(this).hasClass("objects-color-picker") ) {
                var pickerHex = String($(this).val() || "").replace(/^#/, "").toLowerCase();
                object.values[variableName] = pickerHex;
                $(this).closest(".objects-color-value-wrap").find(".objects-color-hex-input").val(pickerHex);
            } else if( $(this).hasClass("objects-color-hex-input") ) {
                var rawHex = String($(this).val() || "").replace(/^#/, "").toLowerCase();
                if( /^[0-9a-f]{6}$/.test(rawHex) ) {
                    object.values[variableName] = rawHex;
                    $(this).closest(".objects-color-value-wrap").find(".objects-color-picker").val("#" + rawHex);
                }
            }
        } else
            object.values[variableName] = $(this).val();

        renderValidation();
        if( (variable.type === "image" || variable.type === "audio") && $(this).hasClass("objects-media-value-select") )
            renderInstanceEditor();
        scheduleSave();
    });

    // -----------------------------------------------------------------------
    // File Manager events
    // -----------------------------------------------------------------------
    var $dropzone = $objectsEditor.find(".objects-files-dropzone");

    $dropzone.on("dragover dragenter", (e) => {
        e.preventDefault();
        e.stopPropagation();
        $dropzone.addClass("dragover");
    });

    $dropzone.on("dragleave dragend drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        $dropzone.removeClass("dragover");
    });

    $dropzone.on("drop", (e) => {
        var dt = e.originalEvent.dataTransfer;
        var droppedFiles = dt.files;
        if (droppedFiles && droppedFiles.length > 0) {
            var addedAny = false;
            for (var i = 0; i < droppedFiles.length; i++) {
                var file = droppedFiles[i];
                if (isImageOrSound(file)) {
                    var baseName = file.name;
                    var lastDot = baseName.lastIndexOf('.');
                    var nameWithoutExtension = lastDot !== -1 ? baseName.substring(0, lastDot) : baseName;

                    if (files.some(f => f.originalName === baseName)) {
                        continue; // Already exists
                    }

                    var defaultVarName = sanitizeVarName(nameWithoutExtension);
                    var varName = defaultVarName;
                    var counter = 1;
                    while (files.some(f => f.varName === varName)) {
                        varName = defaultVarName + "_" + counter;
                        counter++;
                    }

                    files.push({
                        id: generateRandomId(),
                        varName: varName,
                        fileName: nameWithoutExtension,
                        originalName: baseName
                    });
                    addedAny = true;
                }
            }
            if (addedAny) {
                renderFiles();
                renderInstanceEditor();
                renderValidation();
                scheduleSave();
            }
        }
    });

    function isImageOrSound(file) {
        var type = file.type;
        if (type && (type.startsWith("image/") || type.startsWith("audio/"))) {
            return true;
        }
        var ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        var allowedExts = [
            ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".tiff",
            ".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a", ".wma"
        ];
        return allowedExts.indexOf(ext) !== -1;
    }

    function sanitizeVarName(name) {
        var sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
        if (!/^[a-zA-Z_]/.test(sanitized)) {
            sanitized = "_" + sanitized;
        }
        return sanitized;
    }

    // -----------------------------------------------------------------------
    // Object Variables tab events
    // -----------------------------------------------------------------------

    // Select an object variable from the sidebar list
    $objectVarList.on("click", ".objects-objectvar-item", function() {
        selectedObjectVarIndex = parseInt($(this).attr("data-objvar-index"), 10);
        renderObjectVariablesList();
        renderObjectVariableDetail();
    });

    // Delete the currently selected object variable
    $objectsEditor.on("click", ".objects-delete-objectvar-button", function() {
        var idx = parseInt($(this).attr("data-objvar-index"), 10);
        if (idx < 0 || idx >= objectVariables.length) return;
        objectVariables.splice(idx, 1);
        if (selectedObjectVarIndex >= objectVariables.length)
            selectedObjectVarIndex = objectVariables.length - 1;
        renderObjectVariables();
        scheduleSave();
    });
});

// ---------------------------------------------------------------------------
// Save / validation
// ---------------------------------------------------------------------------
function scheduleSave() {
    if( saveTimeout )
        clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        saveIfValid();
    }, 300);
}

function saveIfValid() {
    var project = InkProject.currentProject;
    if( !project || !project.mainInk.projectDir )
        return;

    var result = ObjectsManager.saveAll(project, objectTypes, objects, objectVariables, enums, files);
    if( result.objects )
        objects = result.objects;
    renderValidation(result.errors);
}

function renderValidation(errors) {
    if( typeof errors === "undefined" ) {
        errors = validateAll(objectTypes, objects, enums);
        var filesSeen = new Set();
        files.forEach((file, index) => {
            var label = "File #" + (index + 1) + " (" + (file.originalName || "unnamed") + ")";
            if (!file.varName || !file.varName.trim()) {
                errors.push({ message: label + ": Ink VAR Name cannot be empty." });
            } else {
                var trimmed = file.varName.trim();
                if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
                    errors.push({ message: label + ": Ink VAR Name \"" + trimmed + "\" must be a valid identifier (only letters, numbers, and underscores, cannot start with a number)." });
                } else if (filesSeen.has(trimmed)) {
                    errors.push({ message: label + ": Duplicate Ink VAR Name \"" + trimmed + "\"." });
                } else {
                    filesSeen.add(trimmed);
                }
            }
        });
    }

    if( errors.length === 0 ) {
        $validationErrors.empty().hide();
        return;
    }

    var items = errors.map(error => "<li>" + error.message + "</li>").join("");
    $validationErrors.html("<ul>" + items + "</ul>").show();
}

// ---------------------------------------------------------------------------
// Enum rendering
// ---------------------------------------------------------------------------

/**
 * Render the left-hand category list.
 */
function renderEnumCategoryList() {
    $enumCategoryList.empty();
    enums.forEach(function(cat, catIndex) {
        var isActive = catIndex === selectedEnumCatIndex;
        var activeClass = isActive ? "active" : "";
        var label = cat.name && cat.name.trim() ? cat.name : i18n._("(unnamed)");
        var itemCountText = ' (' + cat.items.length + ' item' + (cat.items.length === 1 ? '' : 's') + ')';

        $enumCategoryList.append(
            '<a class="objects-enum-cat-item nav-group-item ' + activeClass + '" data-cat-index="' + catIndex + '">' +
            label +
            '<span style="font-size:11px; opacity:0.6; margin-left:4px;">' + itemCountText + '</span>' +
            '</a>'
        );
    });
}

/**
 * Render the right-hand items panel for the currently selected category.
 */
function renderEnumDetailPanel(catIndex) {
    $enumDetailPanel.empty();

    if (catIndex < 0 || catIndex >= enums.length) {
        $enumDetailPanel.append('<p class="objects-enum-empty-hint i18n">Select or create an enum category.</p>');
        return;
    }

    var cat = enums[catIndex];

    // Header row with category name and delete button
    var $header = $('<div class="objects-panel-header"></div>');
    $header.append('<h4 class="i18n">' + (cat.name || i18n._("(unnamed)")) + '</h4>');
    var $deleteCatBtn = $('<button type="button" class="btn btn-default objects-delete-enum-cat-button" data-cat-index="' + catIndex + '" title="Delete category"><span class="icon icon-trash"></span></button>');
    $header.append($deleteCatBtn);
    $enumDetailPanel.append($header);

    // Name label and input for editing the name
    $enumDetailPanel.append('<label class="i18n">Category Name</label>');
    var $nameInput = $('<input type="text" class="form-control objects-enum-cat-name-input" spellcheck="false">').val(cat.name);
    $enumDetailPanel.append($nameInput);

    // Items Section Header
    var $itemsHeader = $('<div class="objects-variables-header" style="margin-top:15px;"></div>');
    $itemsHeader.append('<h5 class="i18n">Items</h5>');
    var $addItemBtn = $('<button type="button" class="btn btn-default objects-add-enum-item-button i18n" data-cat-index="' + catIndex + '">Add item</button>');
    $itemsHeader.append($addItemBtn);
    $enumDetailPanel.append($itemsHeader);

    if (cat.items.length === 0) {
        $enumDetailPanel.append('<p class="objects-enum-empty-hint i18n" style="margin-top:8px;opacity:0.6">No items yet. Click "Add item" to start.</p>');
        return;
    }

    // Items table
    var $table = $('<table class="objects-enum-items-table"><thead><tr><th class="i18n">Name</th><th class="i18n">Value</th><th></th></tr></thead></table>');
    var $tbody = $('<tbody></tbody>');

    cat.items.forEach(function(item, itemIndex) {
        var $row = $('<tr></tr>');

        var $nameTd = $('<td></td>');
        var $nameInput = $('<input type="text" class="form-control objects-enum-item-name" spellcheck="false">')
            .attr('data-cat-index', catIndex)
            .attr('data-item-index', itemIndex)
            .val(item.name)
            .attr('placeholder', 'item_name');
        $nameTd.append($nameInput);

        var $valueTd = $('<td></td>');
        var $valueInput = $('<input type="text" class="form-control objects-enum-item-value">')
            .attr('data-cat-index', catIndex)
            .attr('data-item-index', itemIndex)
            .val(item.value);
        $valueTd.append($valueInput);

        var $actionTd = $('<td></td>');
        var $removeBtn = $('<button type="button" class="btn btn-default objects-remove-enum-item-button" title="Remove item">')
            .attr('data-cat-index', catIndex)
            .attr('data-item-index', itemIndex)
            .html('<span class="icon icon-trash"></span>');
        $actionTd.append($removeBtn);

        $row.append($nameTd).append($valueTd).append($actionTd);
        $tbody.append($row);
    });

    $table.append($tbody);
    $enumDetailPanel.append($table);

    // Ink preview hint
    var $hint = $('<p style="margin-top:8px;font-size:11px;opacity:0.6">Each item generates <code>CONST name = value</code> in ObjectVariablesFunctions.ink</p>');
    $enumDetailPanel.append($hint);
}

function renderEnums() {
    renderEnumCategoryList();
    renderEnumDetailPanel(selectedEnumCatIndex);
}

// ---------------------------------------------------------------------------
// Type / object rendering (unchanged)
// ---------------------------------------------------------------------------
function renderTypeList() {
    $typeList.empty();
    objectTypes.forEach((type, index) => {
        var label = type.name && type.name.trim().length > 0 ? type.name : i18n._("(unnamed)");
        var activeClass = index === selectedTypeIndex ? "active" : "";
        $typeList.append('<a class="objects-type-item nav-group-item ' + activeClass + '" data-type-index="' + index + '">' + label + '</a>');
    });
}

function renderTypeEditor() {
    var hasSelection = selectedTypeIndex >= 0 && selectedTypeIndex < objectTypes.length;
    $typeNameInput.prop("disabled", !hasSelection);
    $deleteTypeButton.prop("disabled", !hasSelection);
    $addVariableButton.prop("disabled", !hasSelection);

    if( !hasSelection ) {
        $typeNameInput.val("");
        $variablesBody.empty();
        return;
    }

    var type = objectTypes[selectedTypeIndex];
    $typeNameInput.val(type.name);

    var allTypes = [].concat(VARIABLE_TYPES);
    enums.forEach(e => {
        if (e.name && e.name.trim() && allTypes.indexOf(e.name) === -1) {
            allTypes.push(e.name);
        }
    });

    $variablesBody.empty();
    type.variables.forEach((variable, variableIndex) => {
        if (variable.name === "id")
            return;
        var typeOptions = allTypes.map(t =>
            '<option value="' + t + '"' + (variable.type === t ? " selected" : "") + '>' + t + '</option>'
        ).join("");

        var $row = $('<tr data-variable-index="' + variableIndex + '"><td><input type="text" class="form-control objects-variable-name" data-previous-name=""></td><td><select class="form-control objects-variable-type">' + typeOptions + '</select></td><td><button type="button" class="btn btn-default objects-remove-variable-button">' + i18n._("Remove") + '</button></td></tr>');
        $row.find(".objects-variable-name").val(variable.name).attr("data-previous-name", variable.name);
        $variablesBody.append($row);
    });
}

function renderInstanceList() {
    $instanceList.empty();

    // Group objects by their typeName
    var grouped = {};
    objects.forEach((object, index) => {
        var typeName = object.typeName && object.typeName.trim().length > 0 ? object.typeName : i18n._("(untyped)");
        if (!grouped[typeName]) {
            grouped[typeName] = [];
        }
        grouped[typeName].push({ object: object, originalIndex: index });
    });

    // Sort group names alphabetically, but put untyped at the end
    var typeNames = Object.keys(grouped).sort((a, b) => {
        var untypedLabel = i18n._("(untyped)");
        if (a === untypedLabel) return 1;
        if (b === untypedLabel) return -1;
        return a.localeCompare(b);
    });

    typeNames.forEach(typeName => {
        // Render left-aligned section header for this object type group
        $instanceList.append('<h5 class="nav-group-title">' + typeName + '</h5>');

        // Sort items inside the group alphabetically
        var groupObjects = grouped[typeName];
        groupObjects.sort((a, b) => {
            var nameA = a.object.name || "";
            var nameB = b.object.name || "";
            return nameA.localeCompare(nameB);
        });

        // Render each object inside the group
        groupObjects.forEach(item => {
            var object = item.object;
            var index = item.originalIndex;
            var label = object.name && object.name.trim().length > 0 ? object.name : i18n._("(unnamed)");
            var objectId = object.values && object.values.id !== undefined ? object.values.id : "";
            var activeClass = index === selectedObjectIndex ? "active" : "";

            $instanceList.append(
                '<a class="objects-instance-item nav-group-item ' + activeClass + '" data-object-index="' + index + '">' +
                label +
                '<span style="font-size:11px; opacity:0.6; margin-left:4px;">#' + objectId + '</span>' +
                '</a>'
            );
        });
    });
}

function renderInstanceEditor() {
    if (isCreatingObject) {
        $instanceNameInput.hide();
        $instanceNameInput.prev('label').hide();
        $deleteObjectButton.hide();
        $objectsEditor.find(".objects-instance-values-header").hide();
        $objectsEditor.find(".objects-instance-values-table").hide();

        $instanceTypeSelect.empty();
        $instanceTypeSelect.append('<option value="" disabled selected>' + i18n._("Select a type...") + '</option>');
        objectTypes.forEach(type => {
            var label = type.name && type.name.trim().length > 0 ? type.name : i18n._("(unnamed)");
            $instanceTypeSelect.append('<option value="' + type.name + '">' + label + '</option>');
        });

        $instanceTypeSelect.prop("disabled", false);
        return;
    }

    $instanceNameInput.show();
    $instanceNameInput.prev('label').show();
    $deleteObjectButton.show();
    $objectsEditor.find(".objects-instance-values-header").show();
    $objectsEditor.find(".objects-instance-values-table").show();

    var hasSelection = selectedObjectIndex >= 0 && selectedObjectIndex < objects.length;
    $instanceNameInput.prop("disabled", !hasSelection);
    $instanceTypeSelect.prop("disabled", true);
    $deleteObjectButton.prop("disabled", !hasSelection);
    $newObjectButton.prop("disabled", objectTypes.length === 0);

    $instanceTypeSelect.empty();
    objectTypes.forEach(type => {
        var label = type.name && type.name.trim().length > 0 ? type.name : i18n._("(unnamed)");
        $instanceTypeSelect.append('<option value="' + type.name + '">' + label + '</option>');
    });

    if( !hasSelection ) {
        $instanceNameInput.val("");
        $instanceValuesBody.empty();
        return;
    }

    var object = objects[selectedObjectIndex];
    $instanceNameInput.val(object.name);
    $instanceTypeSelect.val(object.typeName);

    var type = objectTypes.find(t => t.name === object.typeName);
    $instanceValuesBody.empty();

    if( !type )
        return;

    type.variables.forEach(variable => {
        if (variable.name === "id")
            return;
        var value = object.values.hasOwnProperty(variable.name)
            ? object.values[variable.name]
            : coerceValue(null, variable.type);
        var $row = $('<tr data-variable-name="' + variable.name + '"><td>' + variable.name + ' <span class="objects-variable-type-label">(' + variable.type + ')</span></td><td></td></tr>');
        var $valueCell = $row.find("td").last();

        var foundEnum = enums.find(e => e.name === variable.type);
        if (foundEnum) {
            var enumOptions = ['<option value="">' + i18n._("(none)") + '</option>'];
            foundEnum.items.forEach(item => {
                enumOptions.push('<option value="' + item.name + '"' + (value === item.name ? " selected" : "") + '>' + item.name + ' (' + item.value + ')</option>');
            });
            $valueCell.html('<select class="form-control objects-instance-value">' + enumOptions.join("") + '</select>');
        } else if( variable.type === "boolean" ) {
            $valueCell.html('<input type="checkbox" class="objects-instance-value"' + (value ? " checked" : "") + '>');
        } else if( variable.type === "number" ) {
            $valueCell.html('<input type="number" class="form-control objects-instance-value">');
            $valueCell.find("input").val(value);
        } else if( variable.type === "divert" ) {
            var targets = [];
            if( InkProject.currentProject ) {
                var targetsSet = new Set();
                InkProject.currentProject.files.forEach(file => {
                    if( file.symbols ) {
                        var fileTargets = file.symbols.getCachedDivertTargets();
                        var fileFunctions = file.symbols.getCachedFunctionTargets
                            ? file.symbols.getCachedFunctionTargets()
                            : new Set();

                        if( fileTargets ) {
                            fileTargets.forEach(t => {
                                if( !fileFunctions.has(t) )
                                    targetsSet.add(t);
                            });
                        }
                    }
                });
                if( value && !targetsSet.has(value) ) {
                    targetsSet.add(value);
                }
                targets = Array.from(targetsSet).sort();
            }
            var targetOptions = ['<option value="">' + i18n._("(none)") + '</option>'];
            targets.forEach(target => {
                targetOptions.push('<option value="' + target + '"' + (value === target ? " selected" : "") + '>' + target + '</option>');
            });
            $valueCell.html('<select class="form-control objects-instance-value">' + targetOptions.join("") + '</select>');
        } else if( variable.type === "color" ) {
            var hexValue = coerceValue(value, "color");
            var $wrap = $('<div class="objects-color-value-wrap"></div>');
            var $colorInput = $('<input type="color" class="objects-color-picker objects-instance-value">').val("#" + hexValue);
            var $hexInput = $('<input type="text" class="form-control objects-color-hex-input objects-instance-value" maxlength="6" spellcheck="false" placeholder="000000">').val(hexValue);
            $wrap.append($colorInput).append($hexInput);
            $valueCell.append($wrap);
        } else if( variable.type === "image" || variable.type === "audio" ) {
            var hasUnmatchedReference = value && !isRegisteredMediaReference(value, variable.type);

            if( hasUnmatchedReference ) {
                var $wrap = $('<div class="objects-media-value-wrap objects-media-value-wrap--invalid"></div>');
                var $current = $('<div class="objects-media-value-current"></div>');
                $current.append($('<span class="objects-media-value-label"></span>').text(value));
                $current.append(
                    $('<button type="button" class="btn btn-default objects-media-value-change-button"></button>')
                        .text(i18n._("Change"))
                );
                $wrap.append($current);
                $wrap.append(
                    $('<select class="form-control objects-instance-value objects-media-value-select"></select>')
                        .html(buildMediaFileOptions(variable.type, "", { placeholder: i18n._("Select a file...") }))
                );
                $valueCell.append($wrap);

                var $warning = $('<span class="objects-instance-value-warning"><img class="issue-icon warning" src="img/warning-icon.png" alt=""/></span>');
                $warning.attr("title", i18n._('Reference "%s" was not found in registered files.').replace("%s", value));
                $row.find("td").first().append(" ").append($warning);
            } else {
                $valueCell.html(
                    '<select class="form-control objects-instance-value">'
                    + buildMediaFileOptions(variable.type, value)
                    + '</select>'
                );
            }
        } else {
            $valueCell.html('<input type="text" class="form-control objects-instance-value">');
            $valueCell.find("input").val(value);
        }

        $instanceValuesBody.append($row);
    });
}

function renderFiles() {
    if (!$filesBody) return;
    $filesBody.empty();

    if (files.length === 0) {
        $filesBody.append('<tr><td colspan="4" style="text-align:center; opacity:0.6;" class="i18n">No files added yet. Drag and drop files here to track them.</td></tr>');
        return;
    }

    files.forEach((file, index) => {
        var $row = $('<tr></tr>');

        // Delete button
        var $deleteBtn = $('<button type="button" class="btn btn-default" title="Delete file"><span class="icon icon-trash"></span></button>');
        $deleteBtn.on("click", () => {
            files.splice(index, 1);
            renderFiles();
            renderInstanceEditor();
            renderValidation();
            scheduleSave();
        });

        // Icon
        var isSound = isRegisteredSoundFile(file.originalName);
        var iconClass = isSound ? "icon-note" : "icon-picture";
        var $iconSpan = $('<span class="icon ' + iconClass + '" style="font-size: 16px; opacity: 0.7;"></span>');

        // Ink VAR Name input
        var $varNameInput = $('<input type="text" class="form-control objects-file-var-name">').val(file.varName);
        $varNameInput.on("input change", function() {
            file.varName = $(this).val();
            renderInstanceEditor();
            renderValidation();
            scheduleSave();
        });

        // Original File Name (read-only label)
        var $originalNameCell = $('<span></span>').text(file.originalName);

        var $tdDel = $('<td style="text-align: center; vertical-align: middle;"></td>').append($deleteBtn);
        var $tdIcon = $('<td style="text-align: center; vertical-align: middle;"></td>').append($iconSpan);
        var $tdVar = $('<td></td>').append($varNameInput);
        var $tdOrig = $('<td></td>').append($originalNameCell);

        $row.append($tdDel).append($tdIcon).append($tdVar).append($tdOrig);
        $filesBody.append($row);
    });
}

// ---------------------------------------------------------------------------
// Object Variables rendering
// ---------------------------------------------------------------------------

function renderObjectVariables() {
    renderObjectVariablesList();
    renderObjectVariableDetail();
}

function renderObjectVariablesList() {
    if (!$objectVarList) return;
    $objectVarList.empty();

    if (objectVariables.length === 0) {
        $objectVarList.append(
            '<p style="opacity:0.6; padding: 8px 12px; font-size:12px;" class="i18n">' +
            'No object variables defined.<br>Object variables are declared in your ink files using the Objects system.' +
            '</p>'
        );
        return;
    }

    objectVariables.forEach(function(ov, idx) {
        var isActive = idx === selectedObjectVarIndex;
        var label = (ov.name && ov.name.trim()) ? ov.name : i18n._("(unnamed)");
        var typeLabel = (ov.typeName && ov.typeName.trim()) ? ov.typeName : i18n._("(no type)");
        var $item = $(
            '<a class="objects-objectvar-item nav-group-item' + (isActive ? " active" : "") + '" data-objvar-index="' + idx + '">' +
            '<span class="objects-objectvar-item-name">' + label + '</span>' +
            '<span style="font-size:11px; opacity:0.6; margin-left:4px;">(' + typeLabel + ')</span>' +
            '</a>'
        );
        $objectVarList.append($item);
    });
}

function renderObjectVariableDetail() {
    if (!$objectVarDetailPanel) return;
    $objectVarDetailPanel.empty();

    if (selectedObjectVarIndex < 0 || selectedObjectVarIndex >= objectVariables.length) {
        $objectVarDetailPanel.append(
            '<p class="objects-enum-empty-hint i18n" style="opacity:0.6; padding:12px;">' +
            'Select an object variable to view its details, or delete it here.' +
            '</p>'
        );
        return;
    }

    var ov = objectVariables[selectedObjectVarIndex];
    var type = objectTypes.find(function(t) { return t.name === ov.typeName; });

    var $header = $('<div class="objects-panel-header"></div>');
    $header.append('<h4>' + ((ov.name && ov.name.trim()) ? ov.name : i18n._("(unnamed)")) + '</h4>');
    var $deleteBtn = $(
        '<button type="button" class="btn btn-default objects-delete-objectvar-button" ' +
        'data-objvar-index="' + selectedObjectVarIndex + '" title="' + i18n._("Delete object variable") + '">' +
        '<span class="icon icon-trash"></span>' +
        '</button>'
    );
    $header.append($deleteBtn);
    $objectVarDetailPanel.append($header);

    $objectVarDetailPanel.append('<label class="i18n">Variable Name</label>');
    $objectVarDetailPanel.append(
        '<input type="text" class="form-control" readonly value="' + (ov.name || "") + '">'
    );

    $objectVarDetailPanel.append('<label class="i18n" style="margin-top:10px;">Object Type</label>');
    $objectVarDetailPanel.append(
        '<input type="text" class="form-control" readonly value="' + (ov.typeName || "") + '">'
    );

    if (!type) {
        $objectVarDetailPanel.append(
            '<p style="color:#c0392b; margin-top:8px; font-size:12px;" class="i18n">' +
            'Warning: The object type "' + (ov.typeName || "") + '" no longer exists.' +
            '</p>'
        );
    } else {
        var varNames = type.variables.map(function(v) { return v.name; }).join(", ");
        $objectVarDetailPanel.append('<label class="i18n" style="margin-top:10px;">Generated getters / setters for</label>');
        $objectVarDetailPanel.append(
            '<p style="font-size:12px; opacity:0.75; margin-top:4px;">' + (varNames || i18n._("(no variables)")) + '</p>'
        );
    }

    $objectVarDetailPanel.append(
        '<p class="i18n" style="margin-top:16px; font-size:11px; opacity:0.6;">' +
        'Deleting an object variable removes it from the JSON and regenerates the ink file. ' +
        'Existing references in other ink files are not modified.' +
        '</p>'
    );
}

function renderTabs() {
    if( !$tabItems ) return;
    $tabItems.removeClass("active");
    $tabItems.filter('[data-tab="' + activeTab + '"]').addClass("active");

    $enumsSection.hide();
    $classesSection.hide();
    $instancesSection.hide();
    if ($filesSection) $filesSection.hide();
    if ($objectVariablesSection) $objectVariablesSection.hide();

    if( activeTab === "enums" ) {
        $enumsSection.show();
    } else if( activeTab === "classes" ) {
        $classesSection.show();
    } else if( activeTab === "objects" ) {
        $instancesSection.show();
    } else if( activeTab === "files" ) {
        if ($filesSection) $filesSection.show();
    } else if( activeTab === "objectvariables" ) {
        if ($objectVariablesSection) $objectVariablesSection.show();
    }
}

function render() {
    var project = InkProject.currentProject;
    if( !project ) {
        showMissingState(true, false);
        return;
    }

    var status = ObjectsManager.getStatus(project);
    if( !status.projectSaved ) {
        showMissingState(true, false);
        $saveProjectMessage.show();
        $createFilesButton.prop("disabled", true);
        return;
    }

    $saveProjectMessage.hide();

    if( !ObjectsManager.filesReady(status) ) {
        showMissingState(true, true);
        $createFilesButton.prop("disabled", false);
        return;
    }

    showMissingState(false, true);
    renderTabs();
    renderEnums();
    renderTypeList();
    renderTypeEditor();
    renderInstanceList();
    renderInstanceEditor();
    renderFiles();
    renderObjectVariables();
    renderValidation();
}

function showMissingState(showMissing, projectSaved) {
    if( showMissing ) {
        $missingState.show();
        $editorState.hide();
    } else {
        $missingState.hide();
        $editorState.show();
    }

    if( !projectSaved )
        $saveProjectMessage.show();
}

function refresh() {
    var project = InkProject.currentProject;
    if( !project ) {
        objectTypes = [];
        objects = [];
        objectVariables = [];
        enums = [];
        files = [];
        selectedTypeIndex = -1;
        selectedObjectIndex = -1;
        selectedObjectVarIndex = -1;
        selectedEnumCatIndex = -1;
        isCreatingObject = false;
        previousTypeName = "";
        render();
        return;
    }

    var loaded = ObjectsManager.loadAll(project.mainInk.projectDir);
    enums = _.cloneDeep(loaded.enums || []);
    if (selectedEnumCatIndex >= enums.length) selectedEnumCatIndex = enums.length - 1;
    objectTypes = _.cloneDeep(loaded.objectTypes);
    objects = _.cloneDeep(loaded.objects);
    objectVariables = _.cloneDeep(loaded.objectVariables || []);
    files = _.cloneDeep(loaded.files || []);

    isCreatingObject = false;

    if( selectedTypeIndex >= objectTypes.length )
        selectedTypeIndex = objectTypes.length - 1;
    if( selectedObjectIndex >= objects.length )
        selectedObjectIndex = objects.length - 1;
    if( selectedObjectVarIndex >= objectVariables.length )
        selectedObjectVarIndex = objectVariables.length - 1;
    previousTypeName = selectedTypeIndex >= 0 && objectTypes[selectedTypeIndex]
        ? objectTypes[selectedTypeIndex].name
        : "";
    render();
}

function show() {
    if( visible )
        return;

    visible = true;
    $editor.addClass("hidden");
    $objectsEditor.removeClass("hidden");

    if( events.didShow )
        events.didShow();

    refresh();
}

function hide() {
    if( !visible )
        return;

    if( saveTimeout ) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        saveIfValid();
    }

    visible = false;
    $objectsEditor.addClass("hidden");
    $editor.removeClass("hidden");

    if( events.didHide )
        events.didHide();
}

exports.ObjectsView = {
    show: show,
    hide: hide,
    refresh: refresh,
    isVisible: () => visible,
    setEvents: e => events = e
};