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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const glob_1 = __importDefault(require("glob"));
const fs = __importStar(require("fs-extra"));
class McrpUtil {
    static encrypt(inputDir, outputDir, key, exclude) {
        const alwaysExclude = ["manifest.json", "pack_icon.png", "bug_pack_icon.png"];
        const resolvedExclude = [...alwaysExclude, ...exclude];
        const keyBuffer = key ? Buffer.from(key, "utf-8") : crypto.randomBytes(32);
        if (keyBuffer.length !== 32)
            throw new Error("Key must be 32 bytes long.");
        fs.ensureDirSync(outputDir);
        const manifestPath = path.join(inputDir, "manifest.json");
        if (!fs.existsSync(manifestPath))
            throw new Error("manifest.json not found in the input directory.");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const contentEntries = [];
        glob_1.default.sync(`${inputDir}/**/*`).forEach((file) => {
            const relativePath = path.relative(inputDir, file).replace(/\\/g, "/");
            const outputPath = path.join(outputDir, relativePath);
            if (fs.statSync(file).isDirectory())
                return;
            fs.ensureDirSync(path.dirname(outputPath));
            if (resolvedExclude.some((pattern) => relativePath.match(pattern))) {
                if (relativePath.endsWith(".json")) {
                    const content = JSON.parse(fs.readFileSync(file, "utf-8"));
                    fs.writeFileSync(outputPath, JSON.stringify(content));
                }
                else
                    fs.copyFileSync(file, outputPath);
                console.log(`Copied ${relativePath}`);
                contentEntries.push({ path: relativePath });
            }
            else {
                const fileBuffer = fs.readFileSync(file);
                const encryptedBuffer = this.aesEncrypt(keyBuffer, fileBuffer);
                fs.writeFileSync(outputPath, encryptedBuffer);
                console.log(`Encrypted ${relativePath}`);
                const entryKey = crypto.randomBytes(32).toString("utf-8");
                contentEntries.push({ path: relativePath, key: entryKey });
            }
        });
        const content = { content: contentEntries };
        const encryptedContent = this.aesEncrypt(keyBuffer, Buffer.from(JSON.stringify(content)));
        const contentsJsonPath = path.join(outputDir, "contents.json");
        fs.writeFileSync(contentsJsonPath, encryptedContent);
        console.log(`Encryption finished. Key: ${keyBuffer.toString("utf-8")}`);
    }
    static decrypt(inputDir, outputDir, key) {
        const keyBuffer = Buffer.from(key, "utf-8");
        if (keyBuffer.length !== 32) {
            throw new Error("Key must be 32 bytes long.");
        }
        const contentsJsonPath = path.join(inputDir, "contents.json");
        if (!fs.existsSync(contentsJsonPath)) {
            throw new Error("contents.json not found in the input directory.");
        }
        const encryptedContent = fs.readFileSync(contentsJsonPath);
        const content = JSON.parse(this.aesDecrypt(keyBuffer, encryptedContent).toString());
        content.content.forEach((entry) => {
            const inputPath = path.join(inputDir, entry.path);
            const outputPath = path.join(outputDir, entry.path);
            fs.ensureDirSync(path.dirname(outputPath));
            if (!entry.key) {
                if (entry.path.endsWith(".json")) {
                    const content = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
                    fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
                }
                else {
                    fs.copyFileSync(inputPath, outputPath);
                }
                console.log(`Copied ${entry.path}`);
            }
            else {
                const fileBuffer = fs.readFileSync(inputPath);
                const decryptedBuffer = this.aesDecrypt(Buffer.from(entry.key, "utf-8"), fileBuffer);
                fs.writeFileSync(outputPath, decryptedBuffer);
                console.log(`Decrypted ${entry.path}`);
            }
        });
        console.log("Decryption finished.");
    }
    static aesEncrypt(key, data) {
        const iv = key.slice(0, 16); // Use the first 16 bytes of the key as the IV
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        return encrypted;
    }
    static aesDecrypt(key, encryptedData) {
        const iv = key.slice(0, 16); // Use the first 16 bytes of the key as the IV
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
        return decrypted;
    }
}
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
