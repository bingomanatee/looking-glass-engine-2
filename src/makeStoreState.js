import FSM, {ALL_STATES} from "./FSM";

export const STORE_STATE_ERROR = 'error';
export const STORE_STATE_RUNNING = 'running';
export const STORE_STATE_COMPLETE = 'complete';

function makeStoreState() {
  const fs = new FSM(
    'storeState',
    [STORE_STATE_RUNNING, STORE_STATE_COMPLETE, STORE_STATE_ERROR], STORE_STATE_RUNNING
  );
  return fs.block()
    .allow(STORE_STATE_RUNNING, STORE_STATE_ERROR)
    .allow(ALL_STATES, STORE_STATE_COMPLETE)
    .allow(STORE_STATE_ERROR, STORE_STATE_RUNNING)
    .addAction('error', STORE_STATE_RUNNING, STORE_STATE_ERROR)
    .addAction('complete', ALL_STATES, STORE_STATE_COMPLETE)
    .addAction('reset', STORE_STATE_ERROR, STORE_STATE_RUNNING)
}

export default makeStoreState;
