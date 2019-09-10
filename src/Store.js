import _ from 'lodash';
import propper from '@wonderlandlabs/propper'
import uuid from 'uuid';
import {BehaviorSubject} from "rxjs";
import {filter} from 'rxjs/operators';
import is from 'is';
import makeStoreState, {STORE_STATE_ERROR, STORE_STATE_RUNNING} from './makeStoreState';
import nameRegex from './nameRegex';
import validate from './validate';
import resolve from './resolve';
import capFirst from './capFirst';

const noopStream = {
  next: _.identity,
  error: _.identity,
  complete: _.identity
}; // a "dev/null" for messages

const isFnName = (str) => {
  if (!str) {
    return false;
  }
  if (!(typeof str === 'string')) {
    return false;
  }
  return nameRegex.test(str);
};

class Store {
  constructor({
                name,
                actions = {},
                state = {},
                props = {},
                debug = false
              }) {

    this.stream = new BehaviorSubject(this)
      .pipe(filter(() => {
        return this.transactions.length < 1
      }));
    this.name = name || uuid();
    this.state = state;
    this.addActions(actions);
    this.addStateProps(props);

    if (debug) {
      this.startDebugging();
    }
    this._waitForEnd();
  }

  _addSubscription(sub) {
    if (sub && sub.unsubscribe) {
      this.subscribers.add(sub);
    }
    return sub;
  }

  _waitForEnd() {
    const endWatch = this.storeState.subscribe(_.identity, _.identity, () => {
      this.clearSubs();
      endWatch.unsubscribe();
    });
  }

  subscribe(...args) {
    return this.stream.subscribe(...args);
  }

  addProp(...args) {
    return this.addStateProp(...args)
  }

  addStateProps(props) {
    if (props && !is.object(props)) {
      throw new Error('addStateProps expects object');
    }

    Object.keys(props).forEach(name => {
      if (name) {
        this.addStateProp(name, props[name]);
      }
    });

    return this;
  }

  /**
   * add both a value to state and a setter function to actions;
   *
   * it can be called both with a name, start, type parameters as in
   * s.addStateProp("count", 0, "integer")
   *
   * or
   *
   * a.addStateProp("count", {start: 0, type: "integer"}
   *
   * type can be empty, a string, a function, or an array of strings/functions.
   * strings are names of is.js test functions.
   * functions must throw errors if the value is invalid.
   *
   * @param name {string}
   * @param config {Object|var}
   * @param typeProp {var}
   * @returns {Store}
   */
  addStateProp(name, config = {}, typeProp = null) {

    if (Array.isArray(config)) {
      const [start, type] = config;
      return this.addStateProp(name, {start, type});
    }

    if (typeProp) {
      return this.addStateProp(name, {start: config, type: typeProp});
    }

    let {start = null, type, setter} = config;

    if (!(name in this.state)) {
      this.state = {...this.state, [name]: start};
    }

    if (!(setter && isFnName(setter))) {
      setter = `set${capFirst(name)}`;
    }

    if (!this.actions[setter]) {
      this.addAction(setter, (store, value) => {
        if (type) {
          validate(name, type, value);
        }
        this.setState(name, value);
      })
    }
    this.state = {...this.state, [name]: start};
    return this;
  }

  startDebugging() {
    if (!this.debug) {
      this.debugStream = new BehaviorSubject({
        source: 'constructor',
        config: {
          actions, state, debug
        }
      });
      this.debug = true;
      this._stateDebugStreamSub = this._addSubscription(this.storeState.stateStream.subscribe(
        (state) => {
          this.log({
            source: 'stateStream',
            state
          })
        }
      ));
    }
  }

  stopDebugging() {
    this.debug = false;
    this.debugStream.complete();
    this.complete(this._stateDebugStreamSub);
    this.debugStream = noopStream;
  }

  /**
   * if passed a single subscription, completes and removes that sub.
   * otherwise competes and removes ALL subscribers.
   *
   * @param sub
   */
  complete(sub = null) {
    if (sub) {
      sub.unsubscribe();
      this.subcribers.remove(sub);
    } else {
      if (this.storeState.state === STORE_STATE_RUNNING) {
        this.storeState.do('complete');
        this.stream.complete();
        if (this.debugStream) {
          this.debugStream.complete();
        }
      }
      this.clearSubs();
    }
  }

  clearSubs() {
    this.subscribers.forEach(sub => {
      if (sub && sub.unsubscribe) {
        sub.unsubscribe();
      }
    });
    this.subscribers.clear();
  }

  /**
   * Set a single key/value, or multiple key/values:
   * @param updates {object|string}
   * @param value {var} (optional)
   */
  setState(updates, value) {
    if (is.string(updates)) {
      this.state = {...this.state, [updates]: value};
    } else {
      if (!(updates && is.object(updates))) {
        throw new Error(`${this.name}.setState expects an oblect`);
      }
      this.state = {...this.state, ...updates};
    }
  }

  log(params) {
    if (this.debug) {
      this.debugStream.next(params);
    }
  }

  addActions(actionsMap = {}) {
    const actions = this._actions || {};

    if (actionsMap && typeof actionsMap === 'object') {
      Object.keys(actionsMap).forEach((name) => {
        const value = actionsMap[name];
        if (is.function(value)) {
          this.addAction(name, value);
        } else if (is.object(value)) {
          const {action, info} = value;
          if (action) {
            this.addAction(name, action, info);
          }
        }
      });
    } else {
      throw new Error('bad actionsMap');
    }
  }

  /** *
   * adds a mutator function to the actions collection
   * that updates the store's state..
   * @param name {string}
   * @param mutator {function}
   * @param info {Object}
   * @returns {function(...[*]): ChangePromise}
   */
  addAction(name, mutator = ({state}) => state, info = {}) {
    if (this.actions[name]) {
      throw new Error(`${this.name} addAction: overwriting ${name}`);
    }

    if (!(name && _.isString(name))) {
      throw new Error(`addAction: bad name (${name})`);
    }
    if (!is.function(mutator)) {
      throw new Error(`addAction: bad/non function mutator (${name})`);
    }
    this.actions[name] = async (...properties) => {
      const actionId = (this.debug || info.transaction) ? uuid() : '';
      this.log({
        source: 'action',
        name,
        message: 'action called',
        properties,
        id: actionId,
        state: {...this.state}
      });
      await this.update(mutator, properties, {
        ...info, action: name, actionId,
      });
      this.log({
        source: 'action',
        name,
        message: 'action completed',
        properties,
        state: {...this.state}
      })
    };
  }

  async transaction(fn) {
    const tid = uuid();
    this.transactions.add(tid);
    const savedState = {...this.state};
    try {
      await (fn);
      this.transactions.remove(tid);
      if (!this.transactions.length) {
        this.stream.next(this.state);
      }
    } catch (err) {
      this.state = savedState;
      this.transactions.remove(tid);
    }
    return savedState;
  }

  reset(newState = undefined, patch = false) {
    if (this.storeState.state === STORE_STATE_ERROR) {
      this.storeState.do('restore');
    }
    if (typeof newState === 'object') {
      if (patch) {
        Object.assign(this.state, newState);
      } else {
        this.state = newState;
      }
    }
  }

  async update(value, params = [], info) {
    let localInfo = {...info};
    if (!Array.isArray(params)) {
      throw new Error(`bad params for update: ${params}`);
    }

    const {stream} = this;
    const {actionId, transaction, clone} = info;
    let revertState = clone ? _.cloneDeep(this.state) :  {...this.state};

    if (transaction) {
      this.transactions.push(actionId);
      localInfo.transaction = false;
    }

    try {
      if (this.storeState.state !== STORE_STATE_RUNNING) {
        throw new Error('attempt to update store in state ' + this.storeState.state);
      }
      let nextState = resolve(this, value, ...params);
      if (nextState === Promise.resolve(nextState)) {
        await nextState.then((value) => this.update(value, [], localInfo));
      } else if (nextState && !is.undefined(nextState)) {
        if (is.object(nextState)) {
          this.state = {...nextState};
        } else {
          throw new TypeError(this.name + ' bad state submitted to update')
        }
      }
      if (transaction) {
        this._trimTransaction(actionId);
        this.stream.next(this);
      }
    } catch (error) {
      stream.error({
        error, info
      });
      this.debugStore.error({
        source: 'update',
        info,
        value,
        error
      });
      stream.error(error);

      if (transaction) {
        this._trimTransaction(actionId);
      }
      this.state = {...revertState};
    }
  }

  complete() {
    if (this.debug) {
      this.debugStream.complete();
    }
  }

  _trimTransaction(actionId) {
    if (!actionId) return;
    const index = _.indexOf(this.transactions, actionId);
    if (index > -1) {
      this.transactions = this.transactions.slice(0, index);
    } else {
      console.log('--- cant find ', actionId, 'in', this.transactions);
    }
  }
}

propper(Store)
  .addProp('name',
    {
      type: 'string',
      required: false,
      defaultValue: uuid
    })
  .addProp('debugStore', {
    defaultValue: noopStream
  })
  .addProp('propState',
    {
      type: 'object',
      defaultValue: () => ({})
    })
  .addProp('transactions', {
    defaultValue: () =>([])
  })
  .addProp('debug',
    {
      type: 'boolean',
      defaultValue: false
    })
  .addProp('actions',
    {
      type: 'object',
      defaultValue: () => ({})
    })
  .addProp('storeState', {
    type: 'object',
    defaultValue: makeStoreState,
  })
  .addProp('subscribers', {
    defaultValue: () => new Set()
  })
  .addProp('state',
    {
      type: 'object',
      defaultValue: () => ({}),
      onChange: function () {
        // note - the stream takes the whole store, not just state, so onChange param ignored
        if (this && this.stream) {
          this.stream.next(this);
        }
      }
    });

export default Store;
