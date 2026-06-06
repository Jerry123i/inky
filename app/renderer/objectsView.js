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

var visible = false;
var activeTab = "classes";
var objectTypes = [];
var objects = [];
var selectedTypeIndex = -1;
var selectedObjectIndex = -1;
var previousTypeName = "";
var saveTimeout = null;
var events = {};

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
    $classesSection = $objectsEditor.find(".objects-classes-section");
    $instancesSection = $objectsEditor.find(".objects-instances-section");

    $tabItems.on("click", function() {
        activeTab = $(this).attr("data-tab");
        renderTabs();
    });

    $createFilesButton.on("click", () => {
        var project = InkProject.currentProject;
        if( !project || !project.mainInk.projectDir )
            return;

        if( ObjectsManager.createObjectsFiles(project) )
            refresh();
    });

    $addTypeButton.on("click", () => {
        objectTypes.push({ name: "", variables: [] });
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
            renderInstanceList();
            renderInstanceEditor();
            scheduleSave();
        }
        previousTypeName = newName;
    });

    $variablesBody.on("input", ".objects-variable-name", function() {
        var variableIndex = parseInt($(this).closest("tr").attr("data-variable-index"), 10);
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
        var removedName = type.variables[variableIndex].name;
        type.variables.splice(variableIndex, 1);

        objects.forEach(obj => {
            if( obj.typeName === type.name && obj.values.hasOwnProperty(removedName) )
                delete obj.values[removedName];
        });

        render();
        scheduleSave();
    });

    $newObjectButton.on("click", () => {
        var defaultType = objectTypes.length > 0 ? objectTypes[0] : null;
        var newObject = {
            name: "",
            typeName: defaultType ? defaultType.name : "",
            values: createDefaultValuesForType(defaultType)
        };
        objects.push(newObject);
        selectedObjectIndex = objects.length - 1;
        render();
        scheduleSave();
    });

    $deleteObjectButton.on("click", () => {
        if( selectedObjectIndex < 0 || selectedObjectIndex >= objects.length )
            return;
        objects.splice(selectedObjectIndex, 1);
        if( selectedObjectIndex >= objects.length )
            selectedObjectIndex = objects.length - 1;
        render();
        scheduleSave();
    });

    $instanceList.on("click", ".objects-instance-item", function() {
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
        else
            object.values[variableName] = $(this).val();

        renderValidation();
        scheduleSave();
    });
});

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

    var result = ObjectsManager.saveAll(project, objectTypes, objects);
    if( result.objects )
        objects = result.objects;
    renderValidation(result.errors);
}

function renderValidation(errors) {
    if( typeof errors === "undefined" )
        errors = validateAll(objectTypes, objects);

    if( errors.length === 0 ) {
        $validationErrors.empty().hide();
        return;
    }

    var items = errors.map(error => `<li>${error.message}</li>`).join("");
    $validationErrors.html(`<ul>${items}</ul>`).show();
}

function renderTypeList() {
    $typeList.empty();
    objectTypes.forEach((type, index) => {
        var label = type.name && type.name.trim().length > 0 ? type.name : i18n._("(unnamed)");
        var activeClass = index === selectedTypeIndex ? "active" : "";
        $typeList.append(`<a class="objects-type-item nav-group-item ${activeClass}" data-type-index="${index}">${label}</a>`);
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

    $variablesBody.empty();
    type.variables.forEach((variable, variableIndex) => {
        var typeOptions = VARIABLE_TYPES.map(t =>
            `<option value="${t}" ${variable.type === t ? "selected" : ""}>${t}</option>`
        ).join("");

        var $row = $(`
            <tr data-variable-index="${variableIndex}">
                <td><input type="text" class="form-control objects-variable-name" data-previous-name=""></td>
                <td><select class="form-control objects-variable-type">${typeOptions}</select></td>
                <td><button type="button" class="btn btn-default objects-remove-variable-button">${i18n._("Remove")}</button></td>
            </tr>
        `);
        $row.find(".objects-variable-name").val(variable.name).attr("data-previous-name", variable.name);
        $variablesBody.append($row);
    });
}

function renderInstanceList() {
    $instanceList.empty();
    objects.forEach((object, index) => {
        var label = object.name && object.name.trim().length > 0 ? object.name : i18n._("(unnamed)");
        var typeSuffix = object.typeName ? ` (${object.typeName})` : "";
        var activeClass = index === selectedObjectIndex ? "active" : "";
        $instanceList.append(`<a class="objects-instance-item nav-group-item ${activeClass}" data-object-index="${index}">${label}${typeSuffix}</a>`);
    });
}

function renderInstanceEditor() {
    var hasSelection = selectedObjectIndex >= 0 && selectedObjectIndex < objects.length;
    $instanceNameInput.prop("disabled", !hasSelection);
    $instanceTypeSelect.prop("disabled", !hasSelection || objectTypes.length === 0);
    $deleteObjectButton.prop("disabled", !hasSelection);
    $newObjectButton.prop("disabled", objectTypes.length === 0);

    $instanceTypeSelect.empty();
    objectTypes.forEach(type => {
        var label = type.name && type.name.trim().length > 0 ? type.name : i18n._("(unnamed)");
        $instanceTypeSelect.append(`<option value="${type.name}">${label}</option>`);
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
        var value = object.values.hasOwnProperty(variable.name)
            ? object.values[variable.name]
            : coerceValue(null, variable.type);
        var $row = $(`<tr data-variable-name="${variable.name}"><td>${variable.name} <span class="objects-variable-type-label">(${variable.type})</span></td><td></td></tr>`);
        var $valueCell = $row.find("td").last();

        if( variable.type === "boolean" ) {
            $valueCell.html(`<input type="checkbox" class="objects-instance-value" ${value ? "checked" : ""}>`);
        } else if( variable.type === "number" ) {
            $valueCell.html(`<input type="number" class="form-control objects-instance-value">`);
            $valueCell.find("input").val(value);
        } else if( variable.type === "divert" ) {
            var targets = [];
            if( InkProject.currentProject ) {
                var targetsSet = new Set();
                InkProject.currentProject.files.forEach(file => {
                    if( file.symbols ) {
                        var fileTargets = file.symbols.getCachedDivertTargets();
                        if( fileTargets ) {
                            fileTargets.forEach(t => targetsSet.add(t));
                        }
                    }
                });
                if( value && !targetsSet.has(value) ) {
                    targetsSet.add(value);
                }
                targets = Array.from(targetsSet).sort();
            }
            var targetOptions = [`<option value="">${i18n._("(none)")}</option>`];
            targets.forEach(target => {
                targetOptions.push(`<option value="${target}" ${value === target ? "selected" : ""}>${target}</option>`);
            });
            $valueCell.html(`<select class="form-control objects-instance-value">${targetOptions.join("")}</select>`);
        } else {
            $valueCell.html(`<input type="text" class="form-control objects-instance-value">`);
            $valueCell.find("input").val(value);
        }

        $instanceValuesBody.append($row);
    });
}

function renderTabs() {
    if( !$tabItems ) return;
    $tabItems.removeClass("active");
    $tabItems.filter(`[data-tab="${activeTab}"]`).addClass("active");

    if( activeTab === "classes" ) {
        $classesSection.show();
        $instancesSection.hide();
    } else {
        $classesSection.hide();
        $instancesSection.show();
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
    renderTypeList();
    renderTypeEditor();
    renderInstanceList();
    renderInstanceEditor();
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
        selectedTypeIndex = -1;
        selectedObjectIndex = -1;
        previousTypeName = "";
        render();
        return;
    }

    var loaded = ObjectsManager.loadAll(project.mainInk.projectDir);
    objectTypes = _.cloneDeep(loaded.objectTypes);
    objects = _.cloneDeep(loaded.objects);

    if( selectedTypeIndex >= objectTypes.length )
        selectedTypeIndex = objectTypes.length - 1;
    if( selectedObjectIndex >= objects.length )
        selectedObjectIndex = objects.length - 1;
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
