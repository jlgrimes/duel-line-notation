import assert from "node:assert/strict";
import test from "node:test";
import {
  SIMULATOR_WASM_SMOKE_BYTES,
  type SimulatorWasmSmokeExports,
} from "../src/simulator-wasm-smoke.js";

test("simulator WASM smoke module exposes the expected bridge ABI", async () => {
  const result = await WebAssembly.instantiate(SIMULATOR_WASM_SMOKE_BYTES);
  const exports = result.instance.exports as unknown as Partial<SimulatorWasmSmokeExports>;

  assert.equal(typeof exports.engine_version, "function");
  assert.equal(typeof exports.process_step, "function");
  assert.equal(exports.engine_version?.(), 1);
  assert.equal(exports.process_step?.(41), 42);
});
