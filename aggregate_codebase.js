const fs = require('fs');
const path = require('path');

const FILES_TO_AGGREGATE = [
  'package.json',
  'main.js',
  'preload.js',
  'index.html',
  'index.css',
  'renderer.js',
  '.gitignore',
  'sachin-person.config',
  'scanner.py',
  'create_cert.ps1',
  'build_dist.ps1',
  'aggregate_codebase.js'
];

function getFileExtension(filename) {
  if (filename.startsWith('.')) return 'text';
  return filename.split('.').pop();
}

function getLanguage(ext) {
  switch (ext) {
    case 'js': return 'javascript';
    case 'json':
    case 'config': return 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'py': return 'python';
    case 'ps1': return 'powershell';
    default: return 'text';
  }
}

let output = `# OmniShell All-in-One Codebase\n\n`;
output += `This file contains the complete source code for **OmniShell** (a cross-platform network discovery scanner and instant remote SSH terminal control application built with Electron, xterm.js, and ssh2).\n\n`;
output += `Generated on: ${new Date().toISOString()}\n\n`;

FILES_TO_AGGREGATE.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const ext = getFileExtension(file);
    const lang = getLanguage(ext);
    const content = fs.readFileSync(filePath, 'utf8');
    output += `## File: ${file}\n\n`;
    output += `\`\`\`${lang}\n`;
    output += content;
    if (!content.endsWith('\n')) output += '\n';
    output += `\`\`\`\n\n`;
  }
});

const outputPath = path.join(__dirname, 'omnishell_codebase.md');
fs.writeFileSync(outputPath, output, 'utf8');
console.log('Successfully generated omnishell_codebase.md!');
