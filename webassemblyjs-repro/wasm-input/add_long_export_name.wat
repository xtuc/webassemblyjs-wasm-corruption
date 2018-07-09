(module
  (func $add (param $lhs i32) (param $rhs i32) (result i32)
    get_local $lhs
    get_local $rhs
    i32.add)
  (export "LongExportName012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" (func $add))
  (export "add" (func $add))
)