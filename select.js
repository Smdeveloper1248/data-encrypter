const fileButton = document.getElementById("fileButton");
const folderButton = document.getElementById("folderButton");
const cancelButton = document.getElementById("cancelButton");

fileButton.addEventListener("click", () => {

    window.electronAPI.chooseSelection("file");

});

folderButton.addEventListener("click", () => {

    window.electronAPI.chooseSelection("folder");

});

cancelButton.addEventListener("click", () => {

    window.electronAPI.chooseSelection("cancel");

});