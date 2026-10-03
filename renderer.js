const selectButton =
    document.getElementById("selectButton");

const selectedItem =
    document.getElementById("selectedItem");

const password =
    document.getElementById("password");

const togglePassword =
    document.getElementById("togglePassword");

const encryptButton =
    document.getElementById("encryptButton");

const encryptionStatus =
    document.getElementById("encryptionStatus");

let selectedData = null;
let activeEncryptId = null;
let activeDecryptId = null;

window.electronAPI.onOperationProgress((progress) => {
    const encrypting = progress.operationId === activeEncryptId;
    const decrypting = progress.operationId === activeDecryptId;
    if (!encrypting && !decrypting) return;
    const prefix = encrypting ? "encrypt" : "decrypt";
    document.getElementById(`${prefix}ProgressLabel`).textContent = progress.stage;
    document.getElementById(`${prefix}ProgressValue`).textContent = `${progress.percent}%`;
    document.getElementById(`${prefix}ProgressBar`).value = progress.percent;
});

document.getElementById("cancelEncryptButton").addEventListener("click", () => {
    if (activeEncryptId) window.electronAPI.cancelOperation(activeEncryptId);
});
document.getElementById("cancelDecryptButton").addEventListener("click", () => {
    if (activeDecryptId) window.electronAPI.cancelOperation(activeDecryptId);
});


togglePassword.addEventListener("click", () => {
    if (password.type === "password") {
        password.type = "text";
        togglePassword.textContent = "🙈";
        togglePassword.setAttribute(
            "aria-label",
            "Hide password"
        );
    } else {
        password.type = "password";
        togglePassword.textContent = "👁";
        togglePassword.setAttribute(
            "aria-label",
            "Show password"
        );
    }
});


// ----------------------------------
// Select File / Folder
// ----------------------------------

selectButton.addEventListener("click", async () => {

    selectedData =
        await window.electronAPI.selectFileOrFolder();

    if (!selectedData) {

        selectedItem.textContent =
            "Nothing selected";

        encryptButton.disabled = true;

        return;
    }


    selectedItem.textContent =
        `${selectedData.type}: ${selectedData.path}`;


    encryptButton.disabled =
        password.value.length === 0;
});


// ----------------------------------
// Password
// ----------------------------------

password.addEventListener("input", () => {

    encryptButton.disabled =
        !selectedData ||
        password.value.length === 0;

});


// ----------------------------------
// Encrypt
// ----------------------------------

encryptButton.addEventListener("click", async () => {

    if (!selectedData) {
        return;
    }

    if (!password.value) {
        return;
    }


    encryptButton.disabled = true;

    encryptionStatus.textContent =
        "Encrypting...";


    const operationId = crypto.randomUUID();
    activeEncryptId = operationId;
    const progressPanel = document.getElementById("encryptProgress");
    document.getElementById("encryptProgressBar").value = 0;
    document.getElementById("encryptProgressValue").textContent = "0%";
    progressPanel.hidden = false;
    document.getElementById("selectButton").disabled = true;

    let result;
    try {
        result = await window.electronAPI.encryptItem({
            operationId,

            type: selectedData.type,

            path: selectedData.path,

            password: password.value

        });
    } finally {
        activeEncryptId = null;
        progressPanel.hidden = true;
        document.getElementById("selectButton").disabled = false;
    }


    if (!result.success) {

        encryptionStatus.textContent =
            result.cancelled ? "Encryption stopped." : `Encryption failed: ${result.error}`;

        encryptButton.disabled = false;

        return;
    }


    encryptionStatus.textContent =
        `Encryption successful: ${result.path}`;


    password.value = "";

    selectedData = null;

    selectedItem.textContent =
        "Nothing selected";

});


const selectEncryptedButton =
    document.getElementById(
        "selectEncryptedButton"
    );

const selectedEncryptedFile =
    document.getElementById(
        "selectedEncryptedFile"
    );

const decryptPassword =
    document.getElementById(
        "decryptPassword"
    );

const toggleDecryptPassword =
    document.getElementById(
        "toggleDecryptPassword"
    );

const decryptButton =
    document.getElementById(
        "decryptButton"
    );

const decryptionStatus =
    document.getElementById(
        "decryptionStatus"
    );

let encryptedFile = null;


toggleDecryptPassword.addEventListener(
    "click",
    () => {
        if (
            decryptPassword.type === "password"
        ) {
            decryptPassword.type = "text";

            toggleDecryptPassword.textContent =
                "🙈";

            toggleDecryptPassword.setAttribute(
                "aria-label",
                "Hide password"
            );
        } else {
            decryptPassword.type =
                "password";

            toggleDecryptPassword.textContent =
                "👁";

            toggleDecryptPassword.setAttribute(
                "aria-label",
                "Show password"
            );
        }
    }
);


// Select .enc file
selectEncryptedButton.addEventListener(
    "click",
    async () => {

        const result =
            await window.electronAPI.selectEncryptedFile();

        if (!result) {
            return;
        }

        encryptedFile = result;

        selectedEncryptedFile.textContent =
            encryptedFile;

        decryptButton.disabled =
            decryptPassword.value.length === 0;
    }
);


// Enable/disable decrypt button
decryptPassword.addEventListener(
    "input",
    () => {

        decryptButton.disabled =
            !encryptedFile ||
            decryptPassword.value.length === 0;
    }
);


// Decrypt
decryptButton.addEventListener(
    "click",
    async () => {

        if (!encryptedFile) {
            return;
        }

        if (!decryptPassword.value) {
            return;
        }

        decryptButton.disabled = true;

        decryptionStatus.textContent =
            "Decrypting...";

        const operationId = crypto.randomUUID();
        activeDecryptId = operationId;
        const progressPanel = document.getElementById("decryptProgress");
        document.getElementById("decryptProgressBar").value = 0;
        document.getElementById("decryptProgressValue").textContent = "0%";
        progressPanel.hidden = false;
        document.getElementById("selectEncryptedButton").disabled = true;

        let result;
        try {
            result = await window.electronAPI.decryptItem({
                operationId,
                path: encryptedFile,
                password: decryptPassword.value
            });
        } finally {
            activeDecryptId = null;
            progressPanel.hidden = true;
            document.getElementById("selectEncryptedButton").disabled = false;
        }

        if (!result.success) {

            decryptionStatus.textContent =
                result.cancelled ? "Decryption stopped." : `Decryption failed: ${result.error}`;

            decryptButton.disabled = false;

            return;
        }

        decryptionStatus.textContent =
            `Decryption successful: ${result.path}`;

        decryptPassword.value = "";

        encryptedFile = null;

        selectedEncryptedFile.textContent =
            "Nothing selected";

        decryptButton.disabled = true;
    }
);
