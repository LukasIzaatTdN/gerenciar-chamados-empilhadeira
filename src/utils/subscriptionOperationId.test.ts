import assert from "node:assert/strict";
import test from "node:test";
import { clearSubscriptionOperationId, getOrCreateSubscriptionOperationId } from "./subscriptionOperationId.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("reuses a pending operation id for retries and clears it only after success", () => {
  const storage = new MemoryStorage();
  let counter = 0;
  const options = { storage, createId: () => `operation-${++counter}` };
  const payload = { action: "renew", empresaId: "empresa-a", planId: "pro" };
  const first = getOrCreateSubscriptionOperationId("admin-a", payload, options);
  assert.equal(getOrCreateSubscriptionOperationId("admin-a", payload, options), first);
  assert.notEqual(getOrCreateSubscriptionOperationId("admin-b", payload, options), first);
  assert.notEqual(getOrCreateSubscriptionOperationId("admin-a", { ...payload, planId: "basic" }, options), first);
  clearSubscriptionOperationId("admin-a", payload, { storage });
  assert.notEqual(getOrCreateSubscriptionOperationId("admin-a", payload, options), first);
});
