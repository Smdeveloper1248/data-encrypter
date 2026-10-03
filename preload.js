const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {

    selectFileOrFolder: () => {
        return ipcRenderer.invoke("select-file-or-folder");
    },

    chooseSelection: (selection) => {
        return ipcRenderer.send("selection-made", selection);
    },

    createArchive: (item) => {
        return ipcRenderer.invoke("create-archive", item);
    },

    encryptItem: (item) => {
        return ipcRenderer.invoke("encrypt-item", item);
    },

    decryptItem: (data) => {
        return ipcRenderer.invoke(
            "decrypt-item",
            data
        );
    },

    cancelOperation: (operationId) => ipcRenderer.send("cancel-operation", operationId),
    onOperationProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on("operation-progress", listener);
        return () => ipcRenderer.removeListener("operation-progress", listener);
    },

    selectEncryptedFile: () => {
        return ipcRenderer.invoke("select-encrypted-file");
    }

});
