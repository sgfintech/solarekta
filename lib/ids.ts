import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
