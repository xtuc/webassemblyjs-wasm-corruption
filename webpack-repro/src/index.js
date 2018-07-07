import(/* webpackChunkName: "juliaWasm" */ './julia_wasm').then(({ Buffer }) => {
    document.body.appendChild(document.createTextNode(`buffer addr is 0x${Buffer.new(8).as_ptr().toString(16)}`));
});
