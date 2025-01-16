#!/usr/bin/env node

//#region Imports:
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Dirent, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

//#endregion

//#region Resource-Pack API Stuff:
interface Manifest { header: { uuid: string } }
interface Content { content: ContentEntry[] }
interface ContentEntry { path: string; key?: string; }

class McrpUtil {
    static encrypt(
        inputDir: string,
        outputDir: string,
        key: string | undefined,
        exclude: string[]
    ): void {
        const alwaysExclude = ["manifest.json", "pack_icon.png", "bug_pack_icon.png"];
        const resolvedExclude = [...alwaysExclude, ...exclude];

        const keyBuffer = key ? Buffer.from(key, "utf-8") : Buffer.from(crypto.randomBytes(16).toString("hex").slice(0, 32));
        if (keyBuffer.length !== 32) throw new Error("Key must be 32 bytes long.");
        ensureDirSync(outputDir);
        const manifestPath = path.join(inputDir, "manifest.json");
        if (!existsSync(manifestPath)) throw new Error("manifest.json not found in the input directory.");
        const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const contentEntries: ContentEntry[] = [];

        globSync(`${inputDir}/**/*`).forEach((file: string) => {
            const relativePath = path.relative(inputDir, file).replace(/\\/g, "/");
            const outputPath = path.join(outputDir, relativePath);
            if (statSync(file).isDirectory()) return;
            ensureDirSync(path.dirname(outputPath));
            if (resolvedExclude.some((pattern) => relativePath.match(pattern))) {
                if (relativePath.endsWith(".json")) {
                    const content = JSON.parse(readFileSync(file, "utf-8"));
                    writeFileSync(outputPath, JSON.stringify(content));
                } else copyFileSync(file, outputPath);
                console.log(`Copied ${relativePath}`);
                contentEntries.push({ path: relativePath });
            } else {
                const fileBuffer = readFileSync(file);
                const encryptedBuffer = this.aesEncrypt(keyBuffer, fileBuffer);
                writeFileSync(outputPath, encryptedBuffer);
                console.log(`Encrypted ${relativePath}`);

                const entryKey = crypto.randomBytes(32).toString("utf-8");
                contentEntries.push({ path: relativePath, key: entryKey });
            }
        });
        const content: Content = { content: contentEntries };
        const encryptedContent = this.aesEncrypt(keyBuffer, Buffer.from(JSON.stringify(content)));
        const contentsJsonPath = path.join(outputDir, "contents.json");
        writeFileSync(contentsJsonPath, encryptedContent);
        console.log(`Encryption finished. Key: ${keyBuffer.toString("utf-8")}`);
    }
    static decrypt(inputDir: string, outputDir: string, key: string): void {
        const keyBuffer = Buffer.from(key, "utf-8");
        if (keyBuffer.length !== 32) throw new Error("Key must be 32 bytes long.");
        const contentsJsonPath = path.join(inputDir, "contents.json");
        if (!existsSync(contentsJsonPath)) throw new Error("contents.json not found in the input directory.");
        const encryptedContent = readFileSync(contentsJsonPath);
        const content: Content = JSON.parse(this.aesDecrypt(keyBuffer, encryptedContent).toString());
        content.content.forEach((entry) => {
            const inputPath = path.join(inputDir, entry.path);
            const outputPath = path.join(outputDir, entry.path);
            ensureDirSync(path.dirname(outputPath));

            if (!entry.key) {
                if (entry.path.endsWith(".json")) {
                    const content = JSON.parse(readFileSync(inputPath, "utf-8"));
                    writeFileSync(outputPath, JSON.stringify(content, null, 2));
                } else copyFileSync(inputPath, outputPath);
                console.log(`Copied ${entry.path}`);
            } else {
                const fileBuffer = readFileSync(inputPath);
                const decryptedBuffer = this.aesDecrypt(Buffer.from(entry.key, "utf-8"), fileBuffer);
                writeFileSync(outputPath, decryptedBuffer);
                console.log(`Decrypted ${entry.path}`);
            }
        });
        console.log("Decryption finished.");
    }
    static aesEncrypt(key: Buffer, data: Buffer): Buffer {
        const iv = key.subarray(0, 16); // Use the first 16 bytes of the key as the IV
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        return encrypted;
    }
    static aesDecrypt(key: Buffer, encryptedData: Buffer): Buffer {
        const iv = key.subarray(0, 16); // Use the first 16 bytes of the key as the IV
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
        return decrypted;
    }
}
//#endregion

//#region Core API Stuff:
export function globSync(pattern: string): string[] {
    const normalizedPattern = path.resolve(pattern);
    const segments = normalizedPattern.split(path.sep);
    const starIndex = segments.indexOf("**");
    if (starIndex === -1) throw new Error("The pattern must contain '**' to indicate recursive search.");
    const baseDir = segments.slice(0, starIndex).join(path.sep);
    const restPattern = segments.slice(starIndex + 1);
    const matchedFiles: string[] = [];

    function isMatch(fileName: string, patternParts: string[]): boolean {
        if (patternParts.length === 0) return true;
        const [first, ...rest] = patternParts;
        if (first === "**") return true;
        else if (first === "*") return true;
        else return fileName === first;
    }
    const entries: Dirent[] = readdirSync(baseDir, { withFileTypes: true, recursive: true });
    for (const entry of entries.filter(e => isMatch(e.name, restPattern))) matchedFiles.push(path.join(baseDir, entry.path.replace(baseDir, ""), entry.name)); // Join to get the full path
    return matchedFiles;
}

function ensureDirSync(dirPath: string): void {
    if (existsSync(dirPath)) {
        if (!statSync(dirPath).isDirectory()) throw new Error(`Path exists but is not a directory: ${dirPath}`);
        return;
    }
    ensureDirSync(path.dirname(dirPath));
    mkdirSync(dirPath);
}
//#endregion

//#region Command Line Interface:
const args = process.argv.slice(2);
switch (args[0]?.toLowerCase()) {
    case "encrypt": {
        const inputDir = args[1];
        const outputDir = args[2];
        const key = args[3];
        const exclude = args.slice(4);
        McrpUtil.encrypt(inputDir, outputDir, key, exclude);
        break;
    }
    case "decrypt": {
        const inputDir = args[1];
        const outputDir = args[2];
        const key = args[3];
        McrpUtil.decrypt(inputDir, outputDir, key);
        break
    }
    default: {
        console.log("Usage:");
        console.log("  encrypt <inputDir> <outputDir> <key?> <excludePatterns...>");
        console.log("  decrypt <inputDir> <outputDir> <key>");
    }
}
//#endregion
