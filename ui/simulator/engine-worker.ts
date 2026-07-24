import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from "../../src/simulator/engine-protocol.js";
import { SmokeEngineRuntime } from "../../src/simulator/smoke-engine-runtime.js";

type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineWorkerRequest>) => void) | null;
  postMessage(message: EngineWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;
const runtime = new SmokeEngineRuntime();

workerScope.onmessage = (event) => {
  void runtime.handle(event.data).then((response) => workerScope.postMessage(response));
};
