import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from "../../src/simulator/engine-protocol.js";
import { OcgcoreEngineRuntime } from "../../src/simulator/ocgcore-engine-runtime.js";

type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
  postMessage(message: EngineWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;
const runtime = new OcgcoreEngineRuntime();

workerScope.onmessage = (event) => {
  void runtime.handle(event.data).then((response) => workerScope.postMessage(response));
};
