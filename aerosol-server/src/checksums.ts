import SparkMD5 from "spark-md5";
import fs from "node:fs/promises";
import db from "./db";

async function calculateChecksums(vault_path: string) {
  const filesFromVault = await fs.readdir(vault_path);
  const fileChecksums: Record<string, string> = {};
  for (const file of filesFromVault) {
    const readFile = await fs.readFile(`${vault_path}/${file}`);
    fileChecksums[file] = SparkMD5.ArrayBuffer.hash(readFile);
    await db.newChecksum(file, fileChecksums[file]);
  }
  const vaultChecksum = SparkMD5.hash(
    JSON.stringify(Object.entries(fileChecksums).sort())
  );
  await db.newChecksum(".", vaultChecksum);
}

async function recalculateChecksums(
  vault_path: string,
  file: string,
  deleted: boolean = false
) {
  const fileChecksums = await db.getAllChecksums();
  if (!fileChecksums) return;
  if (deleted) {
    await db.deleteChecksum(file);
    return;
  } else {
    const readFile = await fs.readFile(`${vault_path}/${file}`);
    fileChecksums[file] = SparkMD5.ArrayBuffer.hash(readFile);
    // New file
    if (!fileChecksums[file]) {
      await db.newChecksum(file, fileChecksums[file]);
    } /* Updated file */ else {
      await db.updateChecksum(file, fileChecksums[file]);
    }
  }
  // Recalculate vault checksum
  const vaultChecksum = SparkMD5.hash(
    JSON.stringify(Object.entries(fileChecksums).sort())
  );
  await db.updateChecksum(".", vaultChecksum);
}

export default {
  calculateChecksums,
  recalculateChecksums,
};
