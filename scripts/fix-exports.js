#!/usr/bin/env node

/**
 * This script fixes the order of exports in the CommonJS output file.
 * It ensures exports are defined after their function implementations.
 */

const fs = require("fs");
const path = require("path");

// The file we need to fix
const targetFile = path.resolve(
  __dirname,
  "../lib/commonjs/pageInterpolators.js"
);

// Make sure the target directory exists
if (!fs.existsSync(path.dirname(targetFile))) {
  console.log("Target directory does not exist. Build may not have completed.");
  process.exit(0);
}

// Check if file exists
if (!fs.existsSync(targetFile)) {
  console.log("Target file does not exist. Build may not have completed.");
  process.exit(0);
}

// Read the file
let content = fs.readFileSync(targetFile, "utf8");

// Find all exports at the top of the file (before any function definitions)
const functionPos = content.indexOf("function ");
if (functionPos === -1) {
  console.log("No function definitions found in file.");
  process.exit(0);
}

const topSection = content.substring(0, functionPos);
const exportLines = [];
let modified = false;

// Look for export statements like: exports.name = name; or exports.name = void 0;
const exportRegex = /^exports\.([\w]+)\s*=\s*([\w]+|void 0);/gm;
let match;

while ((match = exportRegex.exec(topSection)) !== null) {
  exportLines.push({
    full: match[0],
    name: match[1],
    value: match[2],
  });
  modified = true;
}

if (!modified) {
  console.log("No exports found at the top of the file that need fixing.");
  process.exit(0);
}

console.log(`Found ${exportLines.length} exports to move.`);

// Remove the exports from the top of the file
exportLines.forEach((exp) => {
  content = content.replace(exp.full, "");
});

// Add the exports at the end of the file (before the sourcemap)
const sourcemapPos = content.lastIndexOf("//# sourceMappingURL");
if (sourcemapPos === -1) {
  console.log("No sourcemap found in the file.");
  process.exit(1);
}

// Generate the export statements to add at the end
const exportStatements = exportLines
  .filter((exp) => exp.value !== "void 0") // Skip void 0 assignments, we'll handle them specially
  .map((exp) => `exports.${exp.name} = ${exp.value};`)
  .join("\n");

// Find the void 0 exports (usually for defaultPageInterpolator)
const voidExports = exportLines
  .filter((exp) => exp.value === "void 0")
  .map((exp) => exp.name);

// Build the new content
let newContent = content.substring(0, sourcemapPos).trim();

// Add comment explaining what we did
newContent +=
  '\n\n// Exports moved to end to prevent "exports before definition" errors';

// Add all non-void exports
newContent += "\n" + exportStatements;

// For each void 0 export, find if it's defined later in the file and add export
voidExports.forEach((name) => {
  if (newContent.includes(`const ${name} = `)) {
    newContent += `\nexports.${name} = ${name};`;
  }
});

// Add the sourcemap back
newContent += "\n" + content.substring(sourcemapPos);

// Write the modified content back to the file
fs.writeFileSync(targetFile, newContent, "utf8");
console.log(`Successfully fixed export order in ${targetFile}`);
