const fs = require("fs");
const path = require("path");
const { ZipArchive } = require("archiver");
const unzipper = require("unzipper");

function createZip(sourcePath, outputPath, type, options = {}) {
    return new Promise((resolve, reject) => {

        const output = fs.createWriteStream(outputPath);
        const archive = new ZipArchive({
            zlib: {
                level: 6
            }
        });
        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            options.signal?.removeEventListener("abort", abort);
            archive.abort();
            output.destroy();
            fs.rm(outputPath, { force: true }, () => {});
            reject(error);
        };
        const abort = () => fail(new Error("Operation cancelled."));
        options.signal?.addEventListener("abort", abort, { once: true });
        archive.on("progress", (progress) => options.onProgress?.(progress));

        output.on("close", () => {
            if (settled) return;
            settled = true;
            options.signal?.removeEventListener("abort", abort);
            resolve();
        });

        output.on("error", fail);
        archive.on("error", fail);

        archive.pipe(output);

        if (type === "file") {
            archive.file(sourcePath, {
                name: path.basename(sourcePath)
            });
        } else if (type === "folder") {
            archive.directory(
                sourcePath,
                path.basename(sourcePath)
            );
        } else {
            reject(new Error("Invalid source type."));
            return;
        }

        archive.finalize();
    });
}

function extractZip(zipPath, outputDirectory, options = {}) {
    return new Promise((resolve, reject) => {
        const input = fs.createReadStream(zipPath);
        const extractor = unzipper.Extract({ path: outputDirectory });
        const total = fs.statSync(zipPath).size;
        let processed = 0;
        input.on("data", (chunk) => {
            processed += chunk.length;
            options.onProgress?.(processed, total);
        });
        const abort = () => {
            input.destroy(new Error("Operation cancelled."));
            extractor.destroy(new Error("Operation cancelled."));
        };
        options.signal?.addEventListener("abort", abort, { once: true });
        extractor.on("close", () => resolve());
        extractor.on("error", reject);
        input.on("error", reject);
        input.pipe(extractor);
    });
}

module.exports = {
    createZip,
    extractZip
};
