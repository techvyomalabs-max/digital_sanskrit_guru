const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const readline = require("readline");

// The MySQL password comes only from the environment (never written in the code):
//   PowerShell:  $env:MYSQL_PASSWORD="..."; node backend/scripts/<this script>.js
function requireMysqlPassword() {
  const value = process.env.MYSQL_PASSWORD;
  if (!value) {
    console.error("Set MYSQL_PASSWORD before running this script.");
    process.exit(1);
  }
  return value;
}

const sqlFilePath = "C:/Users/Vyoma-Intern/Downloads/u827042911_fEppv.sql";
const mysqlBinPath = "C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe";
const password = requireMysqlPassword();

async function runImport() {
  console.log("Cleaning and recreating wp_old_export database...");
  try {
    execSync(
      `"${mysqlBinPath}" -u root "-p${password}" -e "DROP DATABASE IF EXISTS wp_old_export; CREATE DATABASE wp_old_export CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
      { stdio: "inherit" }
    );
  } catch (err) {
    console.error("Failed to reset DB:", err.message);
    process.exit(1);
  }

  console.log("Starting full collation-compatible stream import into MySQL...");

  const mysqlProc = spawn(
    mysqlBinPath,
    ["-u", "root", `-p${password}`, "--default-character-set=utf8mb4", "wp_old_export"],
    { stdio: ["pipe", "inherit", "inherit"] }
  );

  mysqlProc.stdin.on("error", (err) => {
    if (err.code !== "EPIPE") console.error("stdin error:", err);
  });

  const fileStream = fs.createReadStream(sqlFilePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  for await (let line of rl) {
    lineCount++;
    if (line.includes("_uca1400_ai_ci")) {
      line = line
        .replace(/utf8mb3_uca1400_ai_ci/g, "utf8_general_ci")
        .replace(/utf8mb4_uca1400_ai_ci/g, "utf8mb4_unicode_ci")
        .replace(/_uca1400_ai_ci/g, "_unicode_ci");
    }
    const canWrite = mysqlProc.stdin.write(line + "\n");
    if (!canWrite) {
      await new Promise((resolve) => mysqlProc.stdin.once("drain", resolve));
    }
    if (lineCount % 100000 === 0) {
      console.log(`Processed ${lineCount} lines...`);
    }
  }

  mysqlProc.stdin.end();

  mysqlProc.on("close", (code) => {
    if (code === 0) {
      console.log("✅ FULL IMPORT COMPLETED SUCCESSFULLY!");
    } else {
      console.error(`❌ Import completed with exit code ${code}`);
    }
  });
}

runImport().catch((err) => {
  console.error("Error during import:", err);
  process.exit(1);
});
