import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse, ParserError } from '../src/index.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const VALID_DATA_DIR = path.join(__dirname, 'valid-data');
const INVALID_DATA_DIR = path.join(__dirname, 'invalid-data');
const OUTPUT_HTML = path.join(__dirname, 'test-report.html');

// Results storage
const results = {
    valid: [],
    invalid: [],
    summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        startTime: new Date(),
        endTime: null
    }
};

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(80));
    log(title, 'bright');
    console.log('='.repeat(80));
}

function logSubSection(title) {
    console.log('\n' + '-'.repeat(80));
    log(title, 'cyan');
    console.log('-'.repeat(80));
}

// Parse a single file
function parseFile(filePath, shouldSucceed) {
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    log(`\nTesting: ${fileName}`, 'blue');
    log(`Expected: ${shouldSucceed ? 'SUCCESS' : 'FAILURE'}`, 'yellow');
    
    const result = {
        fileName,
        filePath,
        shouldSucceed,
        content,
        success: false,
        error: null,
        parsedData: null,
        executionTime: 0
    };

    const startTime = Date.now();
    
    try {
        const parsed = parse(content);
        result.parsedData = parsed;
        result.success = true;
        result.executionTime = Date.now() - startTime;
        
        if (shouldSucceed) {
            log(`✓ PASS - Successfully parsed (${result.executionTime}ms)`, 'green');
            log(`  Definitions found: ${parsed.length}`, 'cyan');
            
            // Log detailed structure
            parsed.forEach((def, index) => {
                console.log(`\n  Definition ${index + 1}: ${def.name}`);
                console.log(`    Type: ${def.type}`);
                if (def.primitive !== undefined) {
                    console.log(`    Primitive Tag: [APPLICATION ${def.primitive}]`);
                }
                if (def.series !== undefined) {
                    console.log(`    Series: ${def.series === true ? 'SEQUENCE OF' : `SEQUENCE SIZE (${def.series}) OF`}`);
                }
                if (def.range) {
                    console.log(`    Range: (${def.range.min}..${def.range.max})`);
                }
                if (def.size) {
                    console.log(`    Size: (${def.size.min}..${def.size.max})`);
                }
                if (def.items && def.items.length > 0) {
                    console.log(`    Items: ${def.items.length}`);
                    def.items.forEach(item => {
                        let itemStr = `      - ${item.name}`;
                        if (item.number !== undefined) itemStr += ` [${item.number}]`;
                        if (item.type) itemStr += `: ${item.type}`;
                        if (item.optional) itemStr += ' (OPTIONAL)';
                        console.log(itemStr);
                    });
                }
                if (def.customizable) {
                    console.log(`    Extensible: Yes (...)`);
                }
            });
            
            results.summary.passed++;
        } else {
            log(`✗ FAIL - Expected parsing to fail but it succeeded`, 'red');
            results.summary.failed++;
        }
        
    } catch (error) {
        result.success = false;
        result.error = {
            name: error.name,
            message: error.message,
            line: error.line || 'N/A'
        };
        result.executionTime = Date.now() - startTime;
        
        if (!shouldSucceed) {
            log(`✓ PASS - Failed as expected (${result.executionTime}ms)`, 'green');
            log(`  Error: ${error.name}`, 'cyan');
            log(`  Message: ${error.message}`, 'cyan');
            if (error.line) {
                log(`  Line: ${error.line}`, 'cyan');
            }
            results.summary.passed++;
        } else {
            log(`✗ FAIL - Unexpected parsing error`, 'red');
            log(`  Error: ${error.name}`, 'red');
            log(`  Message: ${error.message}`, 'red');
            if (error.line) {
                log(`  Line: ${error.line}`, 'red');
            }
            results.summary.failed++;
        }
    }
    
    return result;
}

// Process all files in a directory
function processDirectory(dirPath, shouldSucceed) {
    const files = fs.readdirSync(dirPath)
        .filter(file => file.endsWith('.asn1'))
        .sort();
    
    const testResults = [];
    
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const result = parseFile(filePath, shouldSucceed);
        testResults.push(result);
        results.summary.totalTests++;
    });
    
    return testResults;
}

// Generate HTML report
function generateHtmlReport() {
    const endTime = new Date();
    results.summary.endTime = endTime;
    const duration = endTime - results.summary.startTime;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BACnet ASN.1 Parser Test Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            padding: 10px;
            color: #333;
            font-size: 14px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border: 1px solid #ddd;
        }
        header {
            background: #555;
            color: white;
            padding: 15px;
            border-bottom: 1px solid #444;
        }
        h1 {
            font-size: 1.5em;
            margin-bottom: 5px;
        }
        .timestamp {
            font-size: 0.85em;
            opacity: 0.9;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            padding: 15px;
            background: #fafafa;
            border-bottom: 1px solid #ddd;
        }
        .summary-card {
            background: white;
            padding: 10px;
            border: 1px solid #ddd;
            text-align: center;
        }
        .summary-card h3 {
            color: #666;
            font-size: 0.75em;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .summary-card .value {
            font-size: 1.8em;
            font-weight: bold;
            color: #333;
        }
        .summary-card.passed .value {
            color: #2d7a2d;
        }
        .summary-card.failed .value {
            color: #a00;
        }
        .section {
            padding: 15px;
        }
        .section h2 {
            font-size: 1.2em;
            margin-bottom: 10px;
            color: #333;
            border-bottom: 2px solid #555;
            padding-bottom: 5px;
        }
        .test-result {
            background: #fafafa;
            border: 1px solid #ddd;
            padding: 10px;
            margin-bottom: 10px;
            border-left: 3px solid #ccc;
        }
        .test-result.pass {
            border-left-color: #2d7a2d;
        }
        .test-result.fail {
            border-left-color: #a00;
        }
        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .test-title {
            font-size: 1em;
            font-weight: bold;
        }
        .badge {
            padding: 2px 8px;
            border: 1px solid;
            font-size: 0.75em;
            font-weight: bold;
        }
        .badge.pass {
            background: #e8f5e9;
            color: #2d7a2d;
            border-color: #2d7a2d;
        }
        .badge.fail {
            background: #ffebee;
            color: #a00;
            border-color: #a00;
        }
        .test-info {
            display: grid;
            gap: 5px;
            margin-bottom: 8px;
            font-size: 0.9em;
        }
        .info-row {
            display: flex;
            gap: 8px;
        }
        .info-label {
            font-weight: bold;
            color: #666;
            min-width: 100px;
        }
        .info-value {
            color: #333;
        }
        .code-block {
            background: #f5f5f5;
            color: #333;
            padding: 8px;
            border: 1px solid #ddd;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            line-height: 1.4;
        }
        .parsed-data {
            margin-top: 8px;
        }
        .parsed-data h4 {
            margin-bottom: 5px;
            color: #333;
            font-size: 0.95em;
        }
        .definition {
            background: white;
            padding: 8px;
            margin-bottom: 8px;
            border: 1px solid #ddd;
        }
        .definition-header {
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
            font-size: 1em;
        }
        .definition-prop {
            margin-left: 15px;
            margin-bottom: 3px;
            font-size: 0.9em;
        }
        .definition-prop .key {
            font-weight: bold;
            color: #555;
        }
        .items-list {
            margin-left: 30px;
            margin-top: 3px;
        }
        .item {
            padding: 3px;
            margin-bottom: 2px;
            background: #fafafa;
            border-left: 2px solid #ddd;
            padding-left: 5px;
            font-size: 0.9em;
        }
        .error-details {
            background: #fff9e6;
            border: 1px solid #ffc107;
            padding: 10px;
            margin-top: 8px;
        }
        .error-details h4 {
            color: #856404;
            margin-bottom: 5px;
            font-size: 0.95em;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #e9ecef;
            border: 1px solid #ddd;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: #2d7a2d;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.85em;
        }
        footer {
            background: #fafafa;
            padding: 10px;
            text-align: center;
            color: #666;
            border-top: 1px solid #ddd;
            font-size: 0.85em;
        }
        details {
            margin: 8px 0;
        }
        summary {
            cursor: pointer;
            font-weight: bold;
            font-size: 0.9em;
            padding: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>BACnet ASN.1 Parser Test Report</h1>
            <div class="timestamp">
                Generated: ${results.summary.startTime.toLocaleString()} | Duration: ${duration}ms
            </div>
        </header>

        <div class="summary">
            <div class="summary-card total">
                <h3>Total Tests</h3>
                <div class="value">${results.summary.totalTests}</div>
            </div>
            <div class="summary-card passed">
                <h3>Passed</h3>
                <div class="value">${results.summary.passed}</div>
            </div>
            <div class="summary-card failed">
                <h3>Failed</h3>
                <div class="value">${results.summary.failed}</div>
            </div>
            <div class="summary-card">
                <h3>Success Rate</h3>
                <div class="value">${results.summary.totalTests > 0 ? ((results.summary.passed / results.summary.totalTests) * 100).toFixed(1) : 0}%</div>
            </div>
        </div>

        <div class="summary">
            <div style="grid-column: 1 / -1;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${results.summary.totalTests > 0 ? (results.summary.passed / results.summary.totalTests) * 100 : 0}%">
                        ${results.summary.passed} / ${results.summary.totalTests}
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>Valid Data Tests (Should Succeed)</h2>
            ${results.valid.map(result => `
                <div class="test-result ${(result.success && result.shouldSucceed) ? 'pass' : 'fail'}">
                    <div class="test-header">
                        <div class="test-title">${result.fileName}</div>
                        <span class="badge ${(result.success && result.shouldSucceed) ? 'pass' : 'fail'}">
                            ${(result.success && result.shouldSucceed) ? 'PASS' : 'FAIL'}
                        </span>
                    </div>
                    <div class="test-info">
                        <div class="info-row">
                            <span class="info-label">Expected:</span>
                            <span class="info-value">Success</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Result:</span>
                            <span class="info-value">${result.success ? 'Success' : 'Failed'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Execution Time:</span>
                            <span class="info-value">${result.executionTime}ms</span>
                        </div>
                    </div>
                    
                    <details>
                        <summary>View Source Code</summary>
                        <pre class="code-block">${escapeHtml(result.content)}</pre>
                    </details>

                    ${result.success && result.parsedData ? `
                        <div class="parsed-data">
                            <h4>Parsed Definitions (${result.parsedData.length}):</h4>
                            ${result.parsedData.map((def, idx) => `
                                <div class="definition">
                                    <div class="definition-header">${idx + 1}. ${def.name}</div>
                                    <div class="definition-prop"><span class="key">Type:</span> ${def.type}</div>
                                    ${def.primitive !== undefined ? `<div class="definition-prop"><span class="key">Primitive Tag:</span> [APPLICATION ${def.primitive}]</div>` : ''}
                                    ${def.series !== undefined ? `<div class="definition-prop"><span class="key">Series:</span> ${def.series === true ? 'SEQUENCE OF' : `SEQUENCE SIZE (${def.series}) OF`}</div>` : ''}
                                    ${def.range ? `<div class="definition-prop"><span class="key">Range:</span> (${def.range.min}..${def.range.max})</div>` : ''}
                                    ${def.size ? `<div class="definition-prop"><span class="key">Size:</span> (${def.size.min}..${def.size.max})</div>` : ''}
                                    ${def.customizable ? `<div class="definition-prop"><span class="key">Extensible:</span> Yes (...)</div>` : ''}
                                    ${def.items && def.items.length > 0 ? `
                                        <div class="definition-prop">
                                            <span class="key">Items (${def.items.length}):</span>
                                            <div class="items-list">
                                                ${def.items.map(item => `
                                                    <div class="item">
                                                        <strong>${item.name}</strong>
                                                        ${item.number !== undefined ? `[${item.number}]` : ''}
                                                        ${item.type ? `: ${item.type}` : ''}
                                                        ${item.optional ? ' <em>(OPTIONAL)</em>' : ''}
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${!result.success && result.error ? `
                        <div class="error-details">
                            <h4>Unexpected Error</h4>
                            <div class="definition-prop"><span class="key">Error Type:</span> ${result.error.name}</div>
                            <div class="definition-prop"><span class="key">Message:</span> ${result.error.message}</div>
                            ${result.error.line !== 'N/A' ? `<div class="definition-prop"><span class="key">Line:</span> ${result.error.line}</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <div class="section">
            <h2>Invalid Data Tests (Should Fail)</h2>
            ${results.invalid.map(result => `
                <div class="test-result ${(!result.success && !result.shouldSucceed) ? 'pass' : 'fail'}">
                    <div class="test-header">
                        <div class="test-title">${result.fileName}</div>
                        <span class="badge ${(!result.success && !result.shouldSucceed) ? 'pass' : 'fail'}">
                            ${(!result.success && !result.shouldSucceed) ? 'PASS' : 'FAIL'}
                        </span>
                    </div>
                    <div class="test-info">
                        <div class="info-row">
                            <span class="info-label">Expected:</span>
                            <span class="info-value">Failure</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Result:</span>
                            <span class="info-value">${!result.success ? 'Failed as expected' : 'Unexpectedly succeeded'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Execution Time:</span>
                            <span class="info-value">${result.executionTime}ms</span>
                        </div>
                    </div>
                    
                    <details>
                        <summary>View Source Code</summary>
                        <pre class="code-block">${escapeHtml(result.content)}</pre>
                    </details>

                    ${!result.success && result.error ? `
                        <div class="error-details" style="background: #e8f5e9; border-color: #2d7a2d;">
                            <h4 style="color: #1b5e20;">Error Caught as Expected</h4>
                            <div class="definition-prop"><span class="key">Error Type:</span> ${result.error.name}</div>
                            <div class="definition-prop"><span class="key">Message:</span> ${result.error.message}</div>
                            ${result.error.line !== 'N/A' ? `<div class="definition-prop"><span class="key">Line:</span> ${result.error.line}</div>` : ''}
                        </div>
                    ` : ''}

                    ${result.success && result.parsedData ? `
                        <div class="error-details">
                            <h4>Unexpected Success</h4>
                            <p>This file was expected to fail parsing but succeeded.</p>
                            <div class="parsed-data">
                                <h4>Parsed Definitions (${result.parsedData.length}):</h4>
                                ${result.parsedData.map((def, idx) => `
                                    <div class="definition">
                                        <div class="definition-header">${idx + 1}. ${def.name}</div>
                                        <div class="definition-prop"><span class="key">Type:</span> ${def.type}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <footer>
            <p>BACnet ASN.1 Parser Test Suite</p>
            <p>Report generated on ${new Date().toLocaleString()}</p>
        </footer>
    </div>
</body>
</html>`;

    fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
    return OUTPUT_HTML;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Main test execution
function runTests() {
    logSection('BACnet ASN.1 Parser Test Suite');
    log(`Start Time: ${results.summary.startTime.toLocaleString()}`, 'cyan');

    // Test valid data
    logSubSection('Testing Valid Data (Should Succeed)');
    results.valid = results.valid.concat(processDirectory(VALID_DATA_DIR, true));
    
    // Test invalid data
    logSubSection('Testing Invalid Data (Should Fail)');
    results.invalid = processDirectory(INVALID_DATA_DIR, false);
    
    // Generate report
    logSection('Test Summary');
    log(`Total Tests: ${results.summary.totalTests}`, 'blue');
    log(`Passed: ${results.summary.passed}`, 'green');
    log(`Failed: ${results.summary.failed}`, results.summary.failed > 0 ? 'red' : 'green');
    log(`Success Rate: ${results.summary.totalTests > 0 ? ((results.summary.passed / results.summary.totalTests) * 100).toFixed(1) : 0}%`, 'yellow');
    
    const htmlPath = generateHtmlReport();
    
    logSection('Report Generated');
    log(`HTML Report: ${htmlPath}`, 'green');
    log(`Open in browser: file:///${htmlPath.replace(/\\/g, '/')}`, 'cyan');
    
    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
}

// Run the tests
runTests();
