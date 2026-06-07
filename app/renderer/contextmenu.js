const {ipcRenderer} = require("electron");
const {ObjectsView} = require("./objectsView.js");
const ObjectsManager = require("./objectsManager.js");
const {InkProject} = require("./inkProject.js");

// renderer
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    var showNewObjectVar = false;
    var objectTypes = [];

    var project = InkProject.currentProject;
    if (project && !ObjectsView.isVisible()) {
        var status = ObjectsManager.getStatus(project);
        if (ObjectsManager.filesReady(status)) {
            objectTypes = ObjectsManager.loadObjectTypes(project.mainInk.projectDir);
            if (objectTypes.length > 0) {
                showNewObjectVar = true;
            }
        }
    }

    ipcRenderer.send('show-context-menu', {
        showNewObjectVar: showNewObjectVar,
        objectTypes: objectTypes.map(t => t.name)
    });
});
