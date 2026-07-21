import type { ComboDetail, ComboSummary } from "../src/catalog-model.js";

export type DetailView = "visual" | "notation" | "trace" | "guide";

export interface WorkspaceState {
  selectedId?: string;
  detailView: DetailView;
  drafts: Record<string, string>;
  catalog: {
    combos: ComboSummary[];
    loading: boolean;
    error?: string;
  };
  detail: {
    combo?: ComboDetail;
    loading: boolean;
    error?: string;
  };
}

export type WorkspaceAction =
  | { type: "routeChanged"; id?: string }
  | { type: "viewChanged"; view: DetailView }
  | { type: "catalogLoading" }
  | { type: "catalogLoaded"; combos: ComboSummary[] }
  | { type: "catalogFailed"; message: string }
  | { type: "detailLoading" }
  | { type: "detailLoaded"; combo: ComboDetail }
  | { type: "detailFailed"; message: string }
  | { type: "detailCleared" }
  | { type: "draftChanged"; id: string; source: string }
  | { type: "draftReset"; id: string };

export function initialWorkspaceState(selectedId?: string): WorkspaceState {
  return {
    ...(selectedId ? { selectedId } : {}),
    detailView: "visual",
    drafts: {},
    catalog: { combos: [], loading: true },
    detail: { loading: Boolean(selectedId) },
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "routeChanged": {
      const { selectedId: _selectedId, ...rest } = state;
      return action.id
        ? { ...rest, selectedId: action.id, detailView: "visual", detail: { loading: true } }
        : { ...rest, detailView: "visual", detail: { loading: false } };
    }
    case "viewChanged":
      return { ...state, detailView: action.view };
    case "catalogLoading": {
      const { error: _error, ...catalog } = state.catalog;
      return { ...state, catalog: { ...catalog, loading: true } };
    }
    case "catalogLoaded":
      return { ...state, catalog: { combos: action.combos, loading: false } };
    case "catalogFailed":
      return { ...state, catalog: { ...state.catalog, loading: false, error: action.message } };
    case "detailLoading":
      return { ...state, detail: { loading: true } };
    case "detailLoaded":
      return { ...state, detail: { combo: action.combo, loading: false } };
    case "detailFailed":
      return { ...state, detail: { loading: false, error: action.message } };
    case "detailCleared":
      return { ...state, detail: { loading: false } };
    case "draftChanged":
      return { ...state, drafts: { ...state.drafts, [action.id]: action.source } };
    case "draftReset": { 
      const drafts = { ...state.drafts };
      delete drafts[action.id];
      return { ...state, drafts };
    }
  }
}
