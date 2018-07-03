const
    path = require('path'),
    fs = require('fs'),
    { decode } = require('@webassemblyjs/wasm-parser'),
    { editWithAST } = require('@webassemblyjs/wasm-edit');

const WASM = /\.wasm$/;

const
    wasmInputDir = path.resolve(__dirname, 'wasm-input'),
    wasmOutputDir = path.resolve(__dirname, 'wasm-output'),
    regexFilter = process.argv[2] ? new RegExp(process.argv[2]) : WASM,
    transformFns = [
        addAssignExports,
        oneCharExports,
        removeExports,
        renameImports,
    ];

// Set up output directory
if (!fs.existsSync(wasmOutputDir)) fs.mkdirSync(wasmOutputDir);

const testResults = fs.readdirSync(wasmInputDir)
    // Only care about .wasm files
    .filter(name => regexFilter.test(name))
    // Read each file
    .map(name => {
        const buf = fs.readFileSync(path.resolve(wasmInputDir, name));
        return { name, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    })
    // Cross files with transformFns
    .reduce((testCases, file) => {
        transformFns.forEach(fn => testCases.push({ file, transformFn: fn }));
        return testCases;
    }, [])
    .map(runTestCase);

Promise.all(testResults).then(results => results.forEach(logTestResult));

function runTestCase({ file, transformFn }) {
    const
        testResult = {
            name: `${file.name} -- ${transformFn.name}`,
            wasmParserError: null,
            nativeWasmError: null
        },
        outputName = `${file.name.replace(WASM, '')}-${transformFn.name}.wasm`,
        newBin = transformFn(file.bin);

    // Write output binary to file system for easy analysis
    fs.writeFileSync(path.resolve(wasmOutputDir, outputName), Buffer.from(newBin));

    // Perform 2 tests (wrapped in a Promise b/c WebAssembly.compile returns a Promise)
    return Promise.resolve()
        // 1) decode with wasm-parser
        .then(() => decode(newBin))
        .catch(ex => testResult.wasmParserError = ex)
        // 2) compile with V8's native WebAssembly object
        .then(() => WebAssembly.compile(newBin))
        .catch(ex => testResult.nativeWasmError = ex)
        .then(() => testResult);
}

function logTestResult({ name, wasmParserError, nativeWasmError }) {
    if (!wasmParserError && !nativeWasmError) {
        console.log(`${pad(name, 30)} -- PASS`);
    } else {
        console.log(`${pad(name, 30)} -- FAIL`);
        console.log(`    wasm-parser error:        ${wasmParserError}`);
        console.log(`    native WebAssembly error: ${nativeWasmError}`);
    }
}

function pad(input, length) {
    while (input.length < length) {
        input += ' ';
    }
    return input;
}

function addAssignExports(bin) {
    return editWithAST(getAST(bin), bin, {
        ModuleExport(path) {
            path.node.name += '!!';
        }
    });
}

function oneCharExports(bin) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let i = 0;
    return editWithAST(getAST(bin), bin, {
        ModuleExport(path) {
            path.node.name = chars[i++];
        }
    });
}

function removeExports(bin) {
    return editWithAST(getAST(bin), bin, {
        ModuleExport(path) {
            path.remove();
        }
    });
}

function renameImports(bin) {
    return editWithAST(getAST(bin), bin, {
        ModuleImport(path) {
            path.node.name += '!!';
        }
    });
}

function getAST(bin) {
    return decode(bin, {
        // Needed to work around https://github.com/xtuc/webassemblyjs/issues/405
        ignoreCustomNameSection: true,
        // ignoreDataSection and ignoreCodeSection seem to significantly speed up the decode
        ignoreDataSection: true,
        ignoreCodeSection: true,
    });
}
