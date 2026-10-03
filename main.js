const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { createZip, extractZip } = require("./archive/archive");
const {
    encryptFile,
    decryptFile
} = require("./crypto/encryption");

app.setName("Data Encrypter");

let mainWindow;
const activeOperations = new Map();

ipcMain.on("cancel-operation", (_event, operationId) => activeOperations.get(operationId)?.abort());
function reportProgress(event, operationId, progress) {
    event.sender.send("operation-progress", { operationId, ...progress });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: "Data Encrypter",
        icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "logo.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const channelUrl = "https://www.youtube.com/@SMDeveloper112";
        if (url === channelUrl) {
            shell.openExternal(url).catch((error) => {
                console.error("Could not open the YouTube channel:", error);
            });
        }
        return { action: "deny" };
    });

    mainWindow.loadFile("index.html");
}


// -----------------------------------
// Open File Dialog
// -----------------------------------

ipcMain.handle("select-file", async () => {

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"]
    });

    if (result.canceled) {
        return null;
    }

    return {
        type: "file",
        path: result.filePaths[0]
    };
});


ipcMain.handle("select-encrypted-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [
            {
                name: "Encrypted Files",
                extensions: ["enc"]
            }
        ]
    });

    if (result.canceled) {
        return null;
    }

    return result.filePaths[0];
});


// -----------------------------------
// Open Folder Dialog
// -----------------------------------

ipcMain.handle("select-folder", async () => {

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"]
    });

    if (result.canceled) {
        return null;
    }

    return {
        type: "folder",
        path: result.filePaths[0]
    };
});


// -----------------------------------
// Create Archive
// -----------------------------------

ipcMain.handle("create-archive", async (event, item) => {

    try {

        const tempDirectory = app.getPath("temp");

        const archiveName =
            `${path.basename(item.path)}.zip`;

        const outputPath =
            path.join(tempDirectory, archiveName);

        await createZip(
            item.path,
            outputPath,
            item.type
        );

        return {
            success: true,
            path: outputPath
        };

    } catch (error) {

        console.error("Archive error:", error);

        return {
            success: false,
            error: error.message
        };
    }
});


// -----------------------------------
// Encrypt Item
// -----------------------------------

ipcMain.handle("encrypt-item", async (event, item) => {

    let zipPath = null;
    let outputPath = null;
    const controller = new AbortController();
    activeOperations.set(item.operationId, controller);

    try {

        // ----------------------------------
        // Temporary ZIP
        // ----------------------------------

        const tempDirectory = app.getPath("temp");

        const zipName =
            `${path.basename(item.path)}-${Date.now()}.zip`;

        zipPath =
            path.join(tempDirectory, zipName);


        // ----------------------------------
        // Create ZIP
        // ----------------------------------

        await createZip(
            item.path,
            zipPath,
            item.type,
            { signal: controller.signal, onProgress: (p) => reportProgress(event, item.operationId, { stage: "Creating archive", percent: p.fs.totalBytes ? Math.round(p.fs.processedBytes / p.fs.totalBytes * 35) : (p.entries.total ? Math.round(p.entries.processed / p.entries.total * 35) : 0) }) }
        );
        if (controller.signal.aborted) throw new Error("Operation cancelled.");


        // ----------------------------------
        // Output .enc path
        // ----------------------------------

        const sourceName =
            path.basename(item.path);

        outputPath =
            path.join(
                path.dirname(item.path),
                `${sourceName}.enc`
            );


        // ----------------------------------
        // Encrypt ZIP
        // ----------------------------------

        await encryptFile(
            zipPath,
            outputPath,
            item.password,
            { signal: controller.signal, onProgress: (done, total) => reportProgress(event, item.operationId, { stage: "Encrypting archive", percent: 35 + (total ? Math.round(done / total * 65) : 65) }) }
        );


        // ----------------------------------
        // Delete temporary ZIP
        // ----------------------------------

        fs.unlinkSync(zipPath);

        zipPath = null;


        return {
            success: true,
            path: outputPath
        };

    } catch (error) {

        console.error("Encryption error:", error);


        // ----------------------------------
        // Cleanup temporary ZIP
        // ----------------------------------

        if (zipPath && fs.existsSync(zipPath)) {

            try {
                fs.unlinkSync(zipPath);
            } catch (cleanupError) {
                console.error(
                    "Failed to remove temporary ZIP:",
                    cleanupError
                );
            }

        }

        if (controller.signal.aborted && outputPath) fs.rmSync(outputPath, { force: true });


        return {
            success: false,
            cancelled: controller.signal.aborted,
            error: error.message
        };
    } finally {
        activeOperations.delete(item.operationId);
    }
});


// -----------------------------------
// Decrypt Item
// -----------------------------------

ipcMain.handle("decrypt-item", async (event, data) => {
    let zipPath = null;
    let outputDirectory = null;
    const controller = new AbortController();
    activeOperations.set(data.operationId, controller);

    try {
        const encryptedPath = data.path;
        const password = data.password;

        const tempDirectory = app.getPath("temp");

        const zipName =
            `${path.basename(encryptedPath)}-${Date.now()}.zip`;

        zipPath = path.join(
            tempDirectory,
            zipName
        );

        // Decrypt .enc → temporary ZIP
        await decryptFile(
            encryptedPath,
            zipPath,
            password,
            { signal: controller.signal, onProgress: (done, total) => reportProgress(event, data.operationId, { stage: "Decrypting archive", percent: total ? Math.round(done / total * 65) : 65 }) }
        );

        // Create extraction directory
        const sourceName =
            path.basename(
                encryptedPath,
                ".enc"
            );

        outputDirectory =
            path.join(
                path.dirname(encryptedPath),
                `${sourceName}_decrypted`
            );

        if (fs.existsSync(outputDirectory)) {
            throw new Error(`Output folder already exists: ${outputDirectory}`);
        }

        // Extract ZIP
        await extractZip(
            zipPath,
            outputDirectory,
            { signal: controller.signal, onProgress: (done, total) => reportProgress(event, data.operationId, { stage: "Extracting files", percent: 65 + (total ? Math.round(done / total * 35) : 35) }) }
        );

        // Remove temporary ZIP
        fs.unlinkSync(zipPath);
        zipPath = null;

        return {
            success: true,
            path: outputDirectory
        };

    } catch (error) {
        console.error(
            "Decryption error:",
            error
        );

        // Cleanup temporary ZIP
        if (
            zipPath &&
            fs.existsSync(zipPath)
        ) {
            try {
                fs.unlinkSync(zipPath);
            } catch (cleanupError) {
                console.error(
                    "Failed to remove temporary ZIP:",
                    cleanupError
                );
            }
        }

        if (controller.signal.aborted && outputDirectory) fs.rmSync(outputDirectory, { recursive: true, force: true });

        return {
            success: false,
            cancelled: controller.signal.aborted,
            error: error.message
        };
    } finally {
        activeOperations.delete(data.operationId);
    }
});


// -----------------------------------
// Selection Window
// -----------------------------------

ipcMain.handle("select-file-or-folder", async () => {

    const choiceWindow = new BrowserWindow({
        width: 520,
        height: 430,
        parent: mainWindow,
        modal: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    await choiceWindow.loadFile("select.html");

    return new Promise((resolve) => {

        const handleSelection = async (event, selection) => {

            if (selection === "file") {

                const result = await dialog.showOpenDialog(mainWindow, {
                    properties: ["openFile"]
                });

                choiceWindow.close();

                if (result.canceled) {
                    resolve(null);
                } else {
                    resolve({
                        type: "file",
                        path: result.filePaths[0]
                    });
                }

            } else if (selection === "folder") {

                const result = await dialog.showOpenDialog(mainWindow, {
                    properties: ["openDirectory"]
                });

                choiceWindow.close();

                if (result.canceled) {
                    resolve(null);
                } else {
                    resolve({
                        type: "folder",
                        path: result.filePaths[0]
                    });
                }

            } else {

                choiceWindow.close();
                resolve(null);
            }
        };

        ipcMain.once("selection-made", handleSelection);

        choiceWindow.on("closed", () => {
            resolve(null);
        });

    });
});


app.whenReady().then(() => {

    createWindow();

    app.on("activate", () => {

        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});


app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {
        app.quit();
    }

});
