#![feature(proc_macro, wasm_custom_section, wasm_import_module)]

extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Get37;

#[wasm_bindgen]
impl Get37 {
    pub fn get_37() -> u32 {
        37
    }
}
