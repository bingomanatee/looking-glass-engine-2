import propper from '@wonderlandlabs/propper'
import _ from 'lodash';
import {BehaviorSubject} from 'rxjs'
import uuid from 'uuid/v4';

/**
 * "FSM" is a Finite State Machine; the mathematical definition of state.
 * with mode you can define different states that you go between,
 * which paths are legitimate or not,
 *
 * "FSMState" represents a single state; a Modes instance is of several FSMState, collected in a map
 * that you can move between
 */

export const INDETERMINATE = Symbol('INDETERMINATE');
export const ALL_STATES = '*';

export const STABLE = Symbol('STABLE');

export class FSMState {
  constructor(name, exits = ALL_STATES, fsm) {
    this.id = uuid();
    this.name = name;
    if (!(exits instanceof Set)) {
      exits = _([exits])
        .flattenDeep()
        .map(e => e instanceof FSM ? e.name : e)
        .value();
      exits = new Set(exits);
    }
    this._exits = exits;
    this.fsm = fsm;
    this._actions = new Map();
  }

  addAction(name, dest) {
    this._actions.set(name, dest);
  }

  allowAll() {
    this._exits = new Set(ALL_STATES);
  }

  allowNone() {
    this._exits = new Set();
  }

  get isAllowAll() {
    return this._exits.has(ALL_STATES);
  }

  allow(state, only = false) {
    if (only) {
      this._exits = new Set(FSMState.toName(state));
      return;
    }
    if (state === ALL_STATES) {
      return this.allowAll();
    } else if (Array.isArray(state)) {
      state.forEach(s => this.allow(s, only));
    } else {
      if (this.isAllowAll) {
        return;
      }
      this._exits.add(FSMState.toName(state));
    }
  }

  block(state = ALL_STATES) {
    if (state === ALL_STATES) {
      return this.allowNone();
    } else if (Array.isArray(state)) {
      state.forEach(s => this.block(s));
    } else {
      if (this.isAllowAll) {
        let states = this.fsm.stateNames;
        this._exits = new Set(states);
      }
      this._exits.delete(FSMState.toName(state));
    }
  }

  get exits() {
    return this._exits;
  }

  addExit(exit) {
    if (exit instanceof FSMState) {
      return this.addExit(exit.name);
    }

    if (exit === ALL_STATES) {
      this._exits = new Set(exit);
    } else {
      this._exits.remove(ALL_STATES);
      this._exits.add(exit);
    }
  }

  toString() {
    try {
      return `${this.name}`;
    } catch (err) {
      return `mode id=${this.id}<unrenderable>`;
    }
  }

  canGo(state) {
    if (this.exits.has(ALL_STATES)) {
      return true;
    }

    return this.exits.has(FSMState.toName(state));
  }
}

propper(FSMState)
  .addProp('name')
  .addProp('fsm', {
    required: false,
    defaultValue: null,
    tests: [[n => n instanceof FSM, false, '#name# must be a FSMState instance']]
  });

FSMState.toName = (item) => {
  if (item instanceof FSMState) {
    return item.name;
  }
  return item;
};

FSMState.stringifyName = (item) => {
  if (item instanceof FSMState) {
    return item.toString();
  }
  try {
    return `${item}`;
  } catch (err) {
    return '(unrenderable item)'
  }
};

class FSM {
  constructor(name, props, startStateParam) {
    this.name = name;
    let states;
    let start = INDETERMINATE;
    let actions = [];

    this._actions = new Map();

    if (Array.isArray(props)) {
      states = props;
      if (startStateParam) {
        start = startStateParam;
      }
    } else {
      states = _.get(props, 'states', []);
      start = _.get(props, 'start', INDETERMINATE);
      actions = _.get(props, 'actions', []);
    }

    if (!(states && states instanceof Map)) {
      if (Array.isArray(states)) {
        states = _(states)
          .map((item) => {
            if (Array.isArray(item)) {
              if (!item[1] instanceof FSMState) {
                item[1] = new FSMState(item[0], this, item[1]);
              } else {
                item[1].mode = this;
              }
              return item;
            } else if (_.isString(item)) {
              return [item, new FSMState(item, ALL_STATES, this)]
            } else if (_.isObject(item)) {
              const {name, exits} = item;
              if (!(name && exits)) {
                return null;
              }
            } else {
              return [item, new FSMState(item, ALL_STATES, this)]
            }
          })
          .compact()
          .value();
      }
      states = new Map(Array.isArray(states) ? states : [[INDETERMINATE, new FSM(INDETERMINATE, this, ALL_STATES)]]);
    }
    if (!states.has(start)) {
      console.log(' ======= bad FSMState:', name, props, startStateParam);
      throw new Error("cannot create a FSMState that does not contain the start state");
    }

    this.states = states;
    this.states.forEach(mode => mode.mode = this);
    this._state = start;

    this.stateStream = new BehaviorSubject(this.state);
    this.transState = new BehaviorSubject(this.toJSON());
    actions.forEach((params) => {
      const [name, ...args] = params;
      this.addAction(name, ...args);
    });
  }

  async doWhenStable(name, ...args){
    if(!this.isStable){
      await this.whenStable();
    }
    this.do(name, args);
  }

  do(name, ...args) {
    if (!this.isStable) {
      throw new Error('cannot do actions while unstable');
    }
    let dest;
    if (this._actions.has(name)) {
      dest = this._actions.get(name);
    } else {
      const state = this._getState();
      if (state._actions.has(name)) {
        dest = state._actions.get(name);
      }
    }

    if (_.isFunction(dest)) {
      dest(this, ...args);
    } else if (this.has(dest)) {
      return this.go(dest, ...args);
    }
    // note - non-handled actions are not errors();
  }

  _getState() {
    if (!this.has(this.state)) {
      return;
    }
    return this.states.get(this.state);
  }

  addAction(name, fromState, toState) {
    if (_.isFunction(fromState)){
      this.actions.set(name, fromState);
      return this;
    }

    if (fromState === ALL_STATES) {
      this.stateNames.forEach(fs => this.addAction(fs, toState));
    }

    if (!this.has(fromState)) {
      throw new Error(`no ${fromState} in ${this.name}`);
    }

    const state = this.states.get(fromState);
    state.addAction(name, toState);

    return this;
  }

  report() {
    const names = this.stateNames;

    const out = [['to', ...names]];
    names.forEach(name => {
      let row = [name];
      let state = this.states.get(name);
      names.forEach(toName => {
        row.push(state.canGo(toName));
      });
      out.push(row);
    });

    return out;
  }

  get stateNames() {
    return Array.from(this.states.values()).map(FSMState.toName);
  }

  subscribe(...args) {
    return this.stateStream.subscribe(...args);
  }

  complete() {
    this.transState.complete();
    this.stateStream.complete();
  }

  toJSON() {
    return {
      name: this.name,
      mode: this.mode,
      isStable: this.isStable,
      nextState: this.isStable ? null : this.nextState
    };
  }

  get mode() {
    return this._state;
  }

  get state() {
    if (this.mode === INDETERMINATE) {
      return INDETERMINATE;
    }
    return this.mode.toString();
  }

  async go(mode, when) {
    if (this.done) {
      throw new Error('cannot go() from a completed state');
    }
    if (!this.isStable) {
      throw new Error('Cannot go during transition to ' + this.nextModeString)
    }

    let name = mode;
    let modeString = name;

    if (mode instanceof FSMState) {
      name = mode.name;
      modeString = mode.toString();
    } else {
      try {
        modeString = `${name}`;
      } catch (err) {
        modeString = '(unrenderable name)';
      }
    }

    if (!this.has(name)) {
      throw new Error(this.name + ' go(): does not have name ' + modeString);
    }

    if (!this.isStable) {
      throw new Error(this.name + ' go(): cannot go while transitioning to ' + this.nextModeString);
    }

    const currentMode = this.states.get(this.mode);
    if (!currentMode.canGo(name)) {
      throw new Error(this.name + ' go(): ' + modeString + 'unreachable from ' + currentMode.toString());
    }

    this.nextState = name;
    if (when) {
      try {
        await when;
      } catch (err) {
        this.nextState = STABLE;
        return;
      }
    }
    this._arrive(name)
  }

  _arrive(mode) {
    if (this.done) {
      throw new Error('cannot _arrive() from a completed state');
    }
    let name = mode;
    let modeString = name;

    if (mode instanceof FSMState) {
      name = mode.name;
    }
    Object.assign(this, {nextState: STABLE, _state: name});
    this.stateStream.next(this.state);
  }

  has(mode) {
    return this.states.has(FSMState.toName(mode))
  }

  get nextModeString() {
    if (this.nextState === STABLE) {
      return '';
    }
    const mode = this.states.get(this.nextState);
    return mode.toString();
  }

  get isStable() {
    return this.nextState === STABLE;
  }

  whenStable() {
    if (this.nextState === STABLE) {
      return Promise.resolve();
    }

    return new Promise((done, fail) => {
      let s = this.transState.subscribe(() => {
          if (this.isStable()) {
            s.unsubscribe();
            done();
          }
        }, (err) => fail(err),
        () => {
          s.unsubscribe();
          return new Error(`${this.name} terminated`);
        })
    });
  }

  allow(fromState, toState = ALL_STATES, only = false) {
    if (Array.isArray(fromState)) {
      fromState.forEach(f => this.allow(f, toState, only));
    } else if (fromState === ALL_STATES) {
      this.states.forEach(mode => this.allow(mode, toState, only));
    } else {
      const fromStateName = FSMState.toName(fromState);
      if (!this.has(fromStateName)) {
        throw new Error('FSM State ' + this.name + ' does not have state ' + FSMState.nameString(fromState))
      }
      const myFromState = this.states.get(fromStateName);
      myFromState.allow(toState, only);
    }
    return this;
  }

  block(fromState = ALL_STATES, toState = ALL_STATES, only = false) {
    if (Array.isArray(fromState)) {
      fromState.forEach(f => this.block(f, toState, only));
    } else if (fromState === ALL_STATES) {
      this.states.forEach(mode => this.block(mode, toState, only));
    } else {
      const fromStateName = FSMState.toName(fromState);
      if (!this.has(fromStateName)) {
        throw new Error('FSM State ' + this.name + ' does not have state ' + FSMState.nameString(fromState))
      }
      const myFromState = this.states.get(fromStateName);
      myFromState.block(toState, only);
    }
    return this;
  }

}

propper(FSM)
  .addProp('name', {
    required: true,
    type: 'string'
  })
  .addProp('done', {
    type: 'boolean',
    defaultValue: false
  })
  .addProp('nextState', {
    defaultValue: STABLE,
    onChange(value) {
      if (this.transState) {
        this.transState.next(this.toJSON());
      }
    }
  })
  .addProp('states', {
    tests: [[n => n instanceof Map, false, '#name# must be a Map']]
  });

export default FSM;
