import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { initialWorkspaceState, workspaceReducer, type WorkspaceAction, type WorkspaceState } from "./workspace-state";

interface WorkspaceStore {
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
}

const WorkspaceContext = createContext<WorkspaceStore | undefined>(undefined);

export function WorkspaceProvider({ children, selectedId }: { children: ReactNode; selectedId?: string }) {
  const [state, dispatch] = useReducer(workspaceReducer, selectedId, initialWorkspaceState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceStore {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return store;
}
