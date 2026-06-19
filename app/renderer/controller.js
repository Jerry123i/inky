const electron = require("electron");
const ipc = electron.ipcRenderer;

const path = require("path");
const $ = window.jQuery = require('./jquery-2.2.3.min.js');

// Debug
const loadTestInk = false;
//remote.getCurrentWindow().webContents.openDevTools();

// Helpers in global objects and namespace

require("./util.js");
require("./split.js");

// Set up context menu
require("./contextmenu.js");

const EditorView = require("./editorView.js").EditorView;
const PlayerView = require("./playerView.js").PlayerView;
const ToolbarView = require("./toolbarView.js").ToolbarView;
const NavView = require("./navView.js").NavView;
const ExpressionWatchView = require("./expressionWatchView").ExpressionWatchView;
const LiveCompiler = require("./liveCompiler.js").LiveCompiler;
const InkProject = require("./inkProject.js").InkProject;
const NavHistory = require("./navHistory.js").NavHistory;
const GotoAnything = require("./goto.js").GotoAnything;
const { ObjectsView } = require("./objectsView.js");
const i18n = require("./i18n.js");

InkProject.setEvents({
    "newProject": (project) => {
        ObjectsView.hide();
        EditorView.focus();
        LiveCompiler.setProject(project);
        var filename = project.activeInkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.setMainInkFilename(filename);
        NavHistory.reset();
        NavHistory.addStep();
        ObjectsView.refresh();
    },
    "didSave": () => {
        if( ObjectsView.isVisible() ) {
            ObjectsView.refresh();
            ToolbarView.setTitle(i18n._("Manage Objects"));
            return;
        }
        var activeInk = InkProject.currentProject.activeInkFile;
        ToolbarView.setTitle(activeInk.filename());
        NavView.setMainInkFilename(InkProject.currentProject.mainInk.filename());
        NavView.highlightRelativePath(activeInk.relativePath());
    },
    "didSwitchToInkFile": (inkFile) => {
        ObjectsView.hide();
        var filename = inkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.highlightRelativePath(inkFile.relativePath());
        NavView.setKnots(inkFile);
        var fileIssues = LiveCompiler.getIssuesForFilename(inkFile.relativePath());
        setImmediate(() => EditorView.setErrors(fileIssues));
        NavView.updateCurrentKnot(inkFile, EditorView.getCurrentCursorPos());
        NavHistory.addStep();
    }
});

// Wait for DOM to be ready before kicking most stuff off
// (some of the views get confused otherwise)
$(document).ready(() => {
    if( InkProject.currentProject == null ) {
        InkProject.startNew();
        // Debug
        if( loadTestInk ) {
            var testInk = require("fs").readFileSync(path.join(__dirname, "test.ink"), "utf8");
            InkProject.currentProject.mainInk.setValue(testInk);
        }
        NavView.setKnots(InkProject.currentProject.mainInk);
    }
});

function gotoIssue(issue) {
    InkProject.currentProject.showInkFile(issue.filename);
    EditorView.gotoLine(issue.lineNumber);
    NavHistory.addStep();
}

NavHistory.setEvents({
    goto: (location) => {
        InkProject.currentProject.showInkFile(location.filePath);
        EditorView.gotoLine(location.position.row+1);
    }
})


LiveCompiler.setEvents({
    resetting: (sessionId) => {
        
    },
    compileComplete: (sessionId) => {
        PlayerView.prepareForNewPlaythrough(sessionId);
        EditorView.clearErrors();
        ToolbarView.clearIssueSummary();
    },
    selectIssue: gotoIssue,
    textAdded: (text) => {
        PlayerView.addTextSection(text);
    },
    tagsAdded: (tags) => {
        PlayerView.addTags(tags);
    },
    choiceAdded: (choice, isLatestTurn) => {
        if( isLatestTurn ) {
            PlayerView.addChoice(choice, () => {
                LiveCompiler.choose(choice)
            });
        }
    },
    errorsAdded: (errors) => {
        for(var i=0; i<errors.length; i++) {
            var error = errors[i];
            if( error.filename == InkProject.currentProject.activeInkFile.relativePath() )
                EditorView.addError(error);

            if( error.type == "RUNTIME ERROR" || error.type == "RUNTIME WARNING" )
                PlayerView.addLineError(error, () => gotoIssue(error));
        }

        ToolbarView.updateIssueSummary(errors);
    },
    playerPrompt: (replaying, doneCallback) => {

        var expressionIdx = 0;
        var tryEvaluateNextExpression = () => {

            // Finished evaluating expressions? End of this turn.
            if( expressionIdx >= ExpressionWatchView.numberOfExpressions() ) {
                if( replaying ) {
                    PlayerView.addHorizontalDivider();
                } else {
                    PlayerView.contentReady();
                }
                doneCallback();
                return;
            }

            // Try to evaluate this expression
            var exprText = ExpressionWatchView.getExpression(expressionIdx);
            LiveCompiler.evaluateExpression(exprText, (result, error) => {
                PlayerView.addEvaluationResult(result, error);
                expressionIdx++;
                tryEvaluateNextExpression();
            });
        };

        tryEvaluateNextExpression();
    },
    replayComplete: (sessionId) => {
        PlayerView.showSessionView(sessionId);
    },
    storyCompleted: () => {
        PlayerView.addTerminatingMessage(i18n._("End of story"), "end");
    },
    exitDueToError: () => {
        // No need to do anything - errors themselves being displayed are enough
    },
    unexpectedError: (error) => {
        if( error.indexOf("Unhandled Exception") != -1 ) {
            PlayerView.addTerminatingMessage(i18n._("Sorry, the ink compiler crashed ☹"), "error");
            PlayerView.addTerminatingMessage(i18n._("Here is some diagnostic information:"), "error");

            // Make it a bit less verbose and concentrate on the useful stuff
            // [0x000ea] in /Users/blah/blah/blah/blah/ink/ParsedHierarchy/FlowBase.cs:377
            // After replacement:
            // in FlowBase.cs line 377
            error = error.replace(/\[\w+\] in (?:[\w/]+?)(\w+\.cs):(\d+)/g, "in $1 line $2");

            PlayerView.addLongMessage(error, "diagnostic");
        } else {
            PlayerView.addTerminatingMessage(i18n._("Ink compiler had an unexpected error ☹"), "error");
            PlayerView.addLongMessage(error, "error");
        }
    },
    compilerBusyChanged: (busy) => {
        ToolbarView.setBusySpinnerVisible(busy);
    }
});

ipc.on("project-stats", (event, visible) => {
    LiveCompiler.getStats((statsObj) => {
        
        let messageLines = [];
        messageLines.push(i18n._("Project statistics:"));
        messageLines.push("");
        
        messageLines.push(`${i18n._("Words")}: ${statsObj["words"]}`);
        messageLines.push("");

        messageLines.push(`${i18n._("Knots")}: ${statsObj["knots"]}`);
        messageLines.push(`${i18n._("Stitches")}: ${statsObj["stitches"]}`);
        messageLines.push(`${i18n._("Functions")}: ${statsObj["functions"]}`);
        messageLines.push("");

        messageLines.push(`${i18n._("Choices")}: ${statsObj["choices"]}`);
        messageLines.push(`${i18n._("Gathers")}: ${statsObj["gathers"]}`);
        messageLines.push(`${i18n._("Diverts")}: ${statsObj["diverts"]}`);
        messageLines.push("");

        messageLines.push(i18n._("Notes: Words should be accurate. Knots include functions. Gathers and diverts may include some implicitly added ones by the compiler, for example in weave. Diverts include END and DONE."));

        alert(messageLines.join("\n"));
    });
});

ipc.on("keyboard-shortcuts", (event, visible) => {
    let messageLines = [];
    messageLines.push(i18n._("Useful Keyboard Shortcuts"));
    messageLines.push("");
    messageLines.push(`${i18n._("Find and Replace")}: Ctrl+H ${i18n._("or")} Cmd+H`);
    messageLines.push("");
    messageLines.push(`${i18n._("Find")}: Ctrl+F ${i18n._("or")} Cmd+F`);
    messageLines.push("");
    messageLines.push(`${i18n._("Go to Anything")}: Ctrl+P ${i18n._("or")} Cmd+P`);
    messageLines.push("");
    messageLines.push(`${i18n._("Toggle Comment")}: Ctrl+/ ${i18n._("or")} Cmd+/`);
    messageLines.push("");
    messageLines.push(`${i18n._("Add Multicursor Above")}: Ctrl+Alt+Up ${i18n._("or")} Ctrl+Option+Up`);
    messageLines.push("");
    messageLines.push(`${i18n._("Add Multicursor Below")}: Ctrl+Alt+Down ${i18n._("or")} Ctrl+Option+Down`);
    messageLines.push("");
    messageLines.push(`${i18n._("Temporarily Fold/Unfold Selection")}: Alt+L ${i18n._("or")} Ctrl+Option+Down`);
    messageLines.push("");
    alert(messageLines.join("\n"));
});


EditorView.setEvents({
    "change": () => {
        LiveCompiler.setEdited();
        NavView.setKnots(InkProject.currentProject.activeInkFile);
    },
    "jumpToSymbol": (symbolName, contextPos) => {
        var foundSymbol = InkProject.currentProject.findSymbol(symbolName, contextPos);
        if( foundSymbol ) {
            InkProject.currentProject.showInkFile(foundSymbol.inkFile);
            EditorView.gotoLine(foundSymbol.row+1, foundSymbol.column);
            NavHistory.addStep();
        }
    },
    "jumpToInclude": (includePath) => {
        ObjectsView.hide();
        InkProject.currentProject.showInkFile(includePath);
        NavHistory.addStep();
    },
    "navigate": () => NavHistory.addStep(),
    "changedLine": (pos) =>{
        if (InkProject.currentProject && InkProject.currentProject.activeInkFile){
            NavView.updateCurrentKnot(InkProject.currentProject.activeInkFile, pos);
    }
}
});

PlayerView.setEvents({
    "jumpToSource": (outputTextOffset) => {
        LiveCompiler.getLocationInSource(outputTextOffset, (result) => {
            if( result && result.filename && result.lineNumber ) {
                InkProject.currentProject.showInkFile(result.filename);
                EditorView.gotoLine(result.lineNumber);
            }
        });
    }
});

ExpressionWatchView.setEvents({
    "change": () => {
        LiveCompiler.setEdited();
        $("#player .scrollContainer").css("top", ExpressionWatchView.totalHeight()+"px");
    }
});

ToolbarView.setEvents({
    toggleSidebar: (id, buttonId) => { NavView.toggle(id, buttonId); },
    navigateBack: () => NavHistory.back(),
    navigateForward: () => NavHistory.forward(),
    selectIssue: gotoIssue,
    stepBack: () => {
        PlayerView.previewStepBack();
        LiveCompiler.stepBack();
    },
    rewind:   () => { LiveCompiler.rewind(); },
    didSetTitle: (title) => {
        if( process.platform == "win32" ) {
            ipc.send("set-native-window-title", title);
        }
    }
});

ObjectsView.setEvents({
    didShow: () => {
        ToolbarView.setTitle(i18n._("Manage Objects"));
    },
    didHide: () => {
        var project = InkProject.currentProject;
        if( project && project.activeInkFile )
            ToolbarView.setTitle(project.activeInkFile.filename());
    }
});

NavView.setEvents({
    openObjectsManager: () => {
        ObjectsView.show();
    },
    clickFileId: (fileId) => {
        ObjectsView.hide();
        var inkFile = InkProject.currentProject.inkFileWithId(fileId);
        InkProject.currentProject.showInkFile(inkFile);
        NavHistory.addStep();
    },
    addInclude: (filename, addToMainInk) => {

        // Force filename to have .ink on the end if it hasn't been done manually by user
        // (Is there ever a scenario where this isn't wanted?)
        // Note that if they write my_file.txt then it will turn into my_file.txt.ink
        if( path.extname(filename) != ".ink" ) filename += ".ink";

        var newInkFile = InkProject.currentProject.addNewInclude(filename, addToMainInk);
        if( newInkFile ) {
            InkProject.currentProject.showInkFile(newInkFile);
            NavHistory.addStep();
            return true;
        }
        return false;
    },
    jumpToRow: (row) => {
        EditorView.gotoLine(row+1);
    }
});

GotoAnything.setEvents({
    gotoFile: (file, row) => {
        ObjectsView.hide();
        InkProject.currentProject.showInkFile(file);
        if( typeof row !== 'undefined' )
            EditorView.gotoLine(row+1);
        NavHistory.addStep();
    },
    lookupRuntimePath: (path, resultHandler) => {
        LiveCompiler.getRuntimePathInSource(path, resultHandler);
    }
});

ipc.on("set-tags-visible", (event, visible) => {
    if( visible )
        $("#main").removeClass("hideTags");
    else
        $("#main").addClass("hideTags");
});

ipc.on("set-animation-enabled", (event, animationEnabled) => {
    PlayerView.setAnimationEnabled(animationEnabled)
});
ipc.on("set-autocomplete-disabled", (event, autoCompleteDisabled) => {
    EditorView.setAutoCompleteDisabled(autoCompleteDisabled)
});



function updateTheme(event, newTheme) {
    let themes = ["dark", "contrast", "focus"];
    themes = themes.filter(e => e !== newTheme);
    if (newTheme && newTheme.toLowerCase() !== 'main')
    {
        $(".window").addClass(newTheme);
    }
    for (const theme of themes) {
        $(".window").removeClass(theme);
    }
	LiveCompiler.setEdited();
}

updateTheme(null, window.localStorage.getItem("theme"));
ipc.on("change-theme", (event, newTheme) => {
		updateTheme(event, newTheme);
    window.localStorage.setItem("theme", newTheme);
});



ipc.on("zoom", (event, amount) => {

    // Search manually for element by ID
    // (jQuery wrapping mutates attributes!)
    let editorEl = document.getElementById("editor");
    let playerEl = document.getElementById("player");

    let currentSize = editorEl.style.fontSize;
    
    if(amount > 2) {
        editorEl.style.fontSize = 12 * amount / 100 + "px";
        playerEl.style.fontSize = 14 * amount / 100 + "px";
    } else {

        if(currentSize == "") {

            if(amount > 0) {
                currentSize = "14";
            } else {
                currentSize = "10";
            }

        } else {

            currentSize = currentSize.substring(0, currentSize.length - 2);
            currentSize = parseInt(currentSize);
            currentSize += amount;
        }
        
        editorEl.style.fontSize = currentSize + "px";
        playerEl.style.fontSize = currentSize + "px";
    }

});

ipc.on("insertSnippet", (event, snippetContent) => {
    EditorView.insert(snippetContent);
});

const ObjectsManager = require("./objectsManager.js");

ipc.on("context-new-object-variable", (event, objectTypes) => {
    var $modal = $("#new-object-variable-modal");
    var $nameInput = $("#new-object-var-name");
    var $typeSelect = $("#new-object-var-type");

    $nameInput.val("");
    $typeSelect.empty();
    objectTypes.forEach(type => {
        $typeSelect.append(`<option value="${type}">${type}</option>`);
    });

    $modal.removeClass("hidden");
    $nameInput.focus();
});

$(document).ready(() => {
    var $modal = $("#new-object-variable-modal");
    var $nameInput = $("#new-object-var-name");
    var $typeSelect = $("#new-object-var-type");
    var $confirmButton = $("#new-object-var-confirm");
    var $cancelButton = $("#new-object-var-cancel");

    $cancelButton.on("click", () => {
        $modal.addClass("hidden");
        EditorView.focus();
    });

    // Close on Esc key
    $(document).on("keydown", (e) => {
        if (e.key === "Escape" && !$modal.hasClass("hidden")) {
            $modal.addClass("hidden");
            EditorView.focus();
        }
    });

    $confirmButton.on("click", () => {
        var name = $nameInput.val().trim();
        var selectedType = $typeSelect.val();

        if (!name) {
            alert(i18n._("Variable name is required."));
            return;
        }

        // Validate variable name is a valid Ink identifier
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            alert(i18n._("Invalid variable name. Must start with a letter or underscore and contain only alphanumeric characters and underscores."));
            return;
        }

        var project = InkProject.currentProject;
        if (!project || !project.mainInk.projectDir) return;

        // Check for clashes
        var activeInk = project.activeInkFile;
        if (activeInk && activeInk.symbols && activeInk.symbols.getCachedVariables().has(name)) {
            alert(i18n._(`Variable name "${name}" already exists in the project.`));
            return;
        }

        var projectDir = project.mainInk.projectDir;
        var objectTypes = ObjectsManager.loadObjectTypes(projectDir);
        var objectVariables = ObjectsManager.loadObjectVariables(projectDir);

        if (objectVariables.some(ov => ov.name === name)) {
            alert(i18n._(`Object variable name "${name}" already exists.`));
            return;
        }

        // 1. Insert variable declaration in active file
        EditorView.insert(`VAR ${name} = 0\n`);

        // 2. Add to objectVariables
        objectVariables.push({
            name: name,
            typeName: selectedType
        });

        // 3. Save classes and objects and regenerate
        var objects = ObjectsManager.loadObjects(projectDir);
        ObjectsManager.saveObjectTypes(projectDir, objectTypes, objectVariables);
        ObjectsManager.regenerateInk(project, objectTypes, objects, objectVariables);

        // 4. Refresh view
        ObjectsView.refresh();

        // 5. Close modal
        $modal.addClass("hidden");
        EditorView.focus();
    });
});
