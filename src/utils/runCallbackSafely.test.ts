import * as assert from "node:assert/strict";
import { runCallbackSafely } from "./runCallbackSafely.ts";

let called = false;
assert.doesNotThrow(() =>
  runCallbackSafely(() => {
    called = true;
    throw new Error("notification failed");
  }, "chamado creation")
);
assert.equal(called, true);
assert.doesNotThrow(() => runCallbackSafely(undefined, "chamado creation"));

console.log("runCallbackSafely tests passed");