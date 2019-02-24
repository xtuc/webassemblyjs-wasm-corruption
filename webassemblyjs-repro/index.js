const
    path = require('path'),
    fs = require('fs'),
    { decode } = require('@webassemblyjs/wasm-parser'),
    t = require('@webassemblyjs/ast'),
    { editWithAST, addWithAST } = require('@webassemblyjs/wasm-edit');

const WASM = /\.wasm$/;

const
    wasmInputDir = path.resolve(__dirname, 'wasm-input'),
    wasmOutputDir = path.resolve(__dirname, 'wasm-output'),
    transformFns = [
        // addFunc,
        removeStartFunc,
        // addAssignExports,
        // oneCharExports,
        // removeExports,
        // renameImports,
    ];

// Set up output directory
if (!fs.existsSync(wasmOutputDir)) fs.mkdirSync(wasmOutputDir);

const
    inputFilesFromCLI = process.argv.slice(2),
    inputFiles = inputFilesFromCLI.length ? inputFilesFromCLI :
        fs.readdirSync(wasmInputDir)
        // Only care about .wasm files
        .filter(name => WASM.test(name))
        .map(name => path.resolve(wasmInputDir, name));

const testResults = inputFiles
    // Read each file
    .map(name => {
        const
            buf = fs.readFileSync(name),
            bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        return {
            name: path.basename(name),
            bin
        };
    })
    // Cross files with transformFns
    .reduce((testCases, file) => {
        const ast = getAST(file.bin);
        transformFns.forEach(fn => testCases.push({ file, transformFn: fn, ast }));
        return testCases;
    }, [])
    .map(runTestCase);

Promise.all(testResults).then(results => results.forEach(logTestResult));

function runTestCase({ file, transformFn, ast }) {
    const resultName = `${file.name} -- ${transformFn.name}`;

    console.log(`running case ${resultName}`);

    const
        testResult = {
            name: resultName,
            wasmParserError: null,
            nativeWasmError: null
        },
        outputName = `${file.name.replace(WASM, '')}-${transformFn.name}.wasm`,
        newBin = transformFn(file.bin, ast);

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

function getNextTypeIndex(ast) {
    const typeSectionMetadata = t.getSectionMetadata(ast, "type");

    if (typeSectionMetadata === undefined) {
        return t.indexLiteral(0);
    }

    return t.indexLiteral(typeSectionMetadata.vectorOfSize.value);
}

function getNextFuncIndex(ast) {
    let countImportedFunc = 0;

    t.traverse(ast, {
        ModuleImport({ node }) {
            if (t.isFuncImportDescr(node.descr) === true) {
                countImportedFunc++;
            }
        }
    });

    const funcSectionMetadata = t.getSectionMetadata(ast, "func");

    if (funcSectionMetadata === undefined) {
        return t.indexLiteral(0 + countImportedFunc);
    }

    const vectorOfSize = funcSectionMetadata.vectorOfSize.value;

    return t.indexLiteral(vectorOfSize + countImportedFunc);
}

function removeStartFunc(bin, ast) {
    return editWithAST(ast, bin, {
        Start(path) {
            path.remove();
        }
    });
}

function addFunc(bin, ast) {
    const funcId = t.identifier("__webpack_init__");

    const funcBody = [
        t.instruction("end")
    ];

    const funcSignature = t.signature([], []);
    const func = t.func(funcId, funcSignature, funcBody);

    // Type section
    const functype = t.typeInstruction(undefined, funcSignature);

    // Func section
    const funcindex = t.indexInFuncSection(getNextTypeIndex(ast));

    // Export section
    const moduleExport = t.moduleExport(
        funcId.value,
        t.moduleExportDescr("Func", getNextFuncIndex(ast))
    );

    return addWithAST(ast, bin, [func, moduleExport, funcindex, functype]);
}

function addAssignExports(bin, ast) {
    return editWithAST(ast, bin, {
        ModuleExport(path) {
            path.node.name += '!!';
        }
    });
}

function oneCharExports(bin, ast) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let i = 0;
    return editWithAST(ast, bin, {
        ModuleExport(path) {
            path.node.name = chars[i++ % chars.length];
        }
    });
}

function removeExports(bin, ast) {
    return editWithAST(ast, bin, {
        ModuleExport(path) {
            path.remove();
        }
    });
}

function renameImports(bin, ast) {
    return editWithAST(ast, bin, {
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
