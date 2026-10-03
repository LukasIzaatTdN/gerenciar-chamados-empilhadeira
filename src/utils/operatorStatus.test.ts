import * as assert from "node:assert/strict";
import {
  getOperatorStatusStorageKey,
  parseOperatorAvailability,
} from "./operatorStatus.ts";

assert.notEqual(
  getOperatorStatusStorageKey("operator-1"),
  getOperatorStatusStorageKey("separator-1")
);
assert.equal(parseOperatorAvailability("Pausa"), "Pausa");
assert.equal(parseOperatorAvailability("Disponível"), "Disponível");
assert.equal(parseOperatorAvailability(null), "Disponível");

console.log("operatorStatus tests passed");
