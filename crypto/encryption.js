const crypto = require("crypto");
const fs = require("fs");
const { pipeline } = require("stream/promises");

// ----------------------------------
// File format
// ----------------------------------

const MAGIC = Buffer.from("EFILE");
const VERSION = 1;

const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;


// ----------------------------------
// scrypt parameters
// ----------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;


// ----------------------------------
// Derive encryption key
// ----------------------------------

function deriveKey(password, salt) {
    return crypto.scryptSync(
        password,
        salt,
        KEY_LENGTH,
        {
            N: SCRYPT_N,
            r: SCRYPT_R,
            p: SCRYPT_P
        }
    );
}


// ----------------------------------
// Encrypt file
// ----------------------------------

async function encryptFile(inputPath, outputPath, password, options = {}) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt);
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const total = fs.statSync(inputPath).size;
    let processed = 0;
    input.on("data", (chunk) => {
        processed += chunk.length;
        options.onProgress?.(processed, total);
    });
    output.write(Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, nonce]));
    try {
        await pipeline(input, cipher, output, { signal: options.signal });
        await fs.promises.appendFile(outputPath, cipher.getAuthTag());
    } catch (error) {
        await fs.promises.rm(outputPath, { force: true }).catch(() => {});
        throw error;
    }
}


// ----------------------------------
// Read encrypted file header
// ----------------------------------

function readHeader(filePath) {

    const fd = fs.openSync(filePath, "r");

    try {

        const headerLength =
            MAGIC.length +
            1 +
            SALT_LENGTH +
            NONCE_LENGTH;

        const header = Buffer.alloc(headerLength);

        fs.readSync(
            fd,
            header,
            0,
            headerLength,
            0
        );

        let offset = 0;


        // Magic

        const magic = header.subarray(
            offset,
            offset + MAGIC.length
        );

        offset += MAGIC.length;


        if (!magic.equals(MAGIC)) {
            throw new Error("Invalid encrypted file.");
        }


        // Version

        const version = header[offset];

        offset += 1;


        if (version !== VERSION) {
            throw new Error(
                "Unsupported encrypted file version."
            );
        }


        // Salt

        const salt = header.subarray(
            offset,
            offset + SALT_LENGTH
        );

        offset += SALT_LENGTH;


        // Nonce

        const nonce = header.subarray(
            offset,
            offset + NONCE_LENGTH
        );


        return {
            salt,
            nonce,
            headerLength
        };

    } finally {

        fs.closeSync(fd);

    }
}


// ----------------------------------
// Decrypt file
// ----------------------------------

async function decryptFile(inputPath, outputPath, password, options = {}) {
    let header;

    try {
        header = readHeader(inputPath);
    } catch (error) {
        throw error;
    }

    const fileSize =
        fs.statSync(inputPath).size;

    const ciphertextLength =
        fileSize -
        header.headerLength -
        TAG_LENGTH;

    if (ciphertextLength < 0) {
        throw new Error(
            "Invalid encrypted file."
        );
    }

    // Read authentication tag from the end
    const tagBuffer =
        Buffer.alloc(TAG_LENGTH);

    const fd =
        fs.openSync(inputPath, "r");

    try {
        fs.readSync(
            fd,
            tagBuffer,
            0,
            TAG_LENGTH,
            fileSize - TAG_LENGTH
        );
    } finally {
        fs.closeSync(fd);
    }

    let key;

    try {
        key = deriveKey(
            password,
            header.salt
        );
    } catch (error) {
        throw new Error(
            "Failed to derive encryption key."
        );
    }

    const decipher =
        crypto.createDecipheriv(
            "aes-256-gcm",
            key,
            header.nonce
        );

    decipher.setAuthTag(tagBuffer);

    const input =
        fs.createReadStream(
            inputPath,
            {
                start: header.headerLength,
                end:
                    header.headerLength +
                    ciphertextLength -
                    1
            }
        );

    let processed = 0;
    input.on("data", (chunk) => {
        processed += chunk.length;
        options.onProgress?.(processed, ciphertextLength);
    });

    const output =
        fs.createWriteStream(outputPath);

    try {
        await pipeline(
            input,
            decipher,
            output,
            { signal: options.signal }
        );
    } catch (error) {
        // Authentication failure, incorrect password, corrupted data, or another stream error.
        try {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (cleanupError) {
            console.error(
                "Failed to remove incomplete decrypted file:",
                cleanupError
            );
        }

        if (options.signal?.aborted) throw new Error("Operation cancelled.");
        throw new Error("Incorrect password or corrupted file.");
    }
}


// ----------------------------------
// Exports
// ----------------------------------

module.exports = {
    encryptFile,
    decryptFile
};
