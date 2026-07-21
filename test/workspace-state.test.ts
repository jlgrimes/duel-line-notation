import assert from "node:assert/strict";
import test from "node:test";
import { initialWorkspaceState, workspaceReducer } from "../ui/workspace-state.js";

test("workspace drafts are reducer-owned and reset without persistent storage", () => {
  const initial = initialWorkspaceState("mitsurugi/prayers-habakiri");
  const edited = workspaceReducer(initial, { type: "draftChanged", id: "mitsurugi/prayers-habakiri", source: "edited" });
  assert.equal(edited.drafts["mitsurugi/prayers-habakiri"], "edited");
  assert.deepEqual(initial.drafts, {});

  const reset = workspaceReducer(edited, { type: "draftReset", id: "mitsurugi/prayers-habakiri" });
  assert.deepEqual(reset.drafts, {});
});

test("route changes return to visual mode and clear stale detail state", () => {
  const initial = workspaceReducer(initialWorkspaceState(), { type: "viewChanged", view: "notation" });
  const routed = workspaceReducer(initial, { type: "routeChanged", id: "branded/aluber-fusion" });
  assert.equal(routed.selectedId, "branded/aluber-fusion");
  assert.equal(routed.detailView, "visual");
  assert.equal(routed.detail.loading, true);
  assert.equal(routed.detail.combo, undefined);
});

test("duplicate hash routes preserve an already loaded combo", () => {
  const combo = { id: "branded/aluber-fusion" } as never;
  const loaded = workspaceReducer(
    { ...initialWorkspaceState("branded/aluber-fusion"), detail: { combo, loading: false }, detailView: "notation" },
    { type: "routeChanged", id: "branded/aluber-fusion" },
  );
  assert.equal(loaded.detail.combo, combo);
  assert.equal(loaded.detail.loading, false);
  assert.equal(loaded.detailView, "visual");
});
