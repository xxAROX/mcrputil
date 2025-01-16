#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const node_fs_1 = require("node:fs");
class McrpUtil {
    static encrypt(inputDir, outputDir, key, exclude) {
        const alwaysExclude = ["manifest.json", "pack_icon.png", "bug_pack_icon.png"];
        const resolvedExclude = [...alwaysExclude, ...exclude];
        const keyBuffer = key ? Buffer.from(key, "utf-8") : crypto.randomBytes(32);
        if (keyBuffer.length !== 32)
            throw new Error("Key must be 32 bytes long.");
        ensureDirSync(outputDir);
        const manifestPath = path.join(inputDir, "manifest.json");
        if (!(0, node_fs_1.existsSync)(manifestPath))
            throw new Error("manifest.json not found in the input directory.");
        const manifest = JSON.parse((0, node_fs_1.readFileSync)(manifestPath, "utf-8"));
        const contentEntries = [];
        globSync(`${inputDir}/**/*`).forEach((file) => {
            const relativePath = path.relative(inputDir, file).replace(/\\/g, "/");
            const outputPath = path.join(outputDir, relativePath);
            if ((0, node_fs_1.statSync)(file).isDirectory())
                return;
            ensureDirSync(path.dirname(outputPath));
            if (resolvedExclude.some((pattern) => relativePath.match(pattern))) {
                if (relativePath.endsWith(".json")) {
                    const content = JSON.parse((0, node_fs_1.readFileSync)(file, "utf-8"));
                    (0, node_fs_1.writeFileSync)(outputPath, JSON.stringify(content));
                }
                else
                    (0, node_fs_1.copyFileSync)(file, outputPath);
                console.log(`Copied ${relativePath}`);
                contentEntries.push({ path: relativePath });
            }
            else {
                const fileBuffer = (0, node_fs_1.readFileSync)(file);
                const encryptedBuffer = this.aesEncrypt(keyBuffer, fileBuffer);
                (0, node_fs_1.writeFileSync)(outputPath, encryptedBuffer);
                console.log(`Encrypted ${relativePath}`);
                const entryKey = crypto.randomBytes(32).toString("utf-8");
                contentEntries.push({ path: relativePath, key: entryKey });
            }
        });
        const content = { content: contentEntries };
        const encryptedContent = this.aesEncrypt(keyBuffer, Buffer.from(JSON.stringify(content)));
        const contentsJsonPath = path.join(outputDir, "contents.json");
        (0, node_fs_1.writeFileSync)(contentsJsonPath, encryptedContent);
        console.log(`Encryption finished. Key: ${keyBuffer.toString("utf-8")}`);
    }
    static decrypt(inputDir, outputDir, key) {
        const keyBuffer = Buffer.from(key, "utf-8");
        if (keyBuffer.length !== 32)
            throw new Error("Key must be 32 bytes long.");
        const contentsJsonPath = path.join(inputDir, "contents.json");
        if (!(0, node_fs_1.existsSync)(contentsJsonPath))
            throw new Error("contents.json not found in the input directory.");
        const encryptedContent = (0, node_fs_1.readFileSync)(contentsJsonPath);
        const content = JSON.parse(this.aesDecrypt(keyBuffer, encryptedContent).toString());
        content.content.forEach((entry) => {
            const inputPath = path.join(inputDir, entry.path);
            const outputPath = path.join(outputDir, entry.path);
            ensureDirSync(path.dirname(outputPath));
            if (!entry.key) {
                if (entry.path.endsWith(".json")) {
                    const content = JSON.parse((0, node_fs_1.readFileSync)(inputPath, "utf-8"));
                    (0, node_fs_1.writeFileSync)(outputPath, JSON.stringify(content, null, 2));
                }
                else
                    (0, node_fs_1.copyFileSync)(inputPath, outputPath);
                console.log(`Copied ${entry.path}`);
            }
            else {
                const fileBuffer = (0, node_fs_1.readFileSync)(inputPath);
                const decryptedBuffer = this.aesDecrypt(Buffer.from(entry.key, "utf-8"), fileBuffer);
                (0, node_fs_1.writeFileSync)(outputPath, decryptedBuffer);
                console.log(`Decrypted ${entry.path}`);
            }
        });
        console.log("Decryption finished.");
    }
    static aesEncrypt(key, data) {
        const iv = key.subarray(0, 16); // Use the first 16 bytes of the key as the IV
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        return encrypted;
    }
    static aesDecrypt(key, encryptedData) {
        const iv = key.subarray(0, 16); // Use the first 16 bytes of the key as the IV
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
        return decrypted;
    }
}
//#region API Stuff:
function globSync(pattern, directory = process.cwd()) {
    const regexPattern = convertGlobToRegex(pattern);
    const results = [];
    function traverse(dir) {
        const entries = (0, node_fs_1.readdirSync)(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(directory, fullPath);
            if (entry.isDirectory())
                traverse(fullPath); // Recurse into subdirectory
            else if (regexPattern.test(relativePath))
                results.push(relativePath);
        }
    }
    traverse(directory);
    return results;
}
function convertGlobToRegex(glob) {
    const escaped = glob
        .replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&") // Escape special regex characters
        .replace(/\*\*/g, "(?:.*)") // Match zero or more directories
        .replace(/\*/g, "[^/]*"); // Match zero or more characters in a directory
    return new RegExp(`^${escaped}$`);
}
function ensureDirSync(dirPath) {
    if ((0, node_fs_1.existsSync)(dirPath)) {
        if (!(0, node_fs_1.statSync)(dirPath).isDirectory())
            throw new Error(`Path exists but is not a directory: ${dirPath}`);
        return;
    }
    ensureDirSync(path.dirname(dirPath));
    (0, node_fs_1.mkdirSync)(dirPath);
}
//#endregion
const args = process.argv.slice(2);
switch (args[0].toLowerCase()) {
    case "encrypt": {
        const inputDir = args[1];
        const outputDir = args[2];
        const key = args[3];
        const exclude = args.slice(4);
        break;
    }
    case "decrypt": {
        const inputDir = args[1];
        const outputDir = args[2];
        const key = args[3];
        McrpUtil.decrypt(inputDir, outputDir, key);
        break;
    }
    default: {
        console.log("Usage:");
        console.log("  encrypt <inputDir> <outputDir> <key?> <excludePatterns...>");
        console.log("  decrypt <inputDir> <outputDir> <key>");
    }
}
