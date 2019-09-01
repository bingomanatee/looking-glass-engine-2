import _ from 'lodash';
import propper from '@wonderlandlabs/propper'
import uuid from 'uuid';
import {BehaviorSubject} from "rxjs";
import is from 'is';
import makeStoreState, {STORE_STATE_ERROR, STORE_STATE_COMPLETE, STORE_STATE_RUNNING} from './makeStoreState';
import nameRegex from './nameRegex.js';
import validate from './validate.js';
import resolve from './resolve.js';

const capFirst = string => string[0].toUpperCase() + string.slice(1);

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
                debug = false
              }) {

    this.name = name || uuid();
    this.state = state;
    this.stream = new BehaviorSubject(this);
    this.addActions(actions);

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

  addProp(name, config = {}) {
    let {start = null, type, setter} = config;

    if (!name in this.state) {
      this.state = {...this.state, [name]: start};
    }

    if (!isFnName(setter)) {
      setter = `set${capFirst(name)}`;
    }

    if (!this.actions[setter]) {
      this.addAction(setter, (store, value) => {
        if (type) {
          validate(type, value);
        }
        return {...this.state, [name]: value};
      })
    }
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
          this.debugStream.next({
            source: 'stateStream',
            state
          })
        }
      ));
    }
  }

  stopDebugging() {
    this.debug = false;
    if (this.debugStream) {
      this.debugStream.complete();
      this.complete(this._stateDebugStreamSub);
    }
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
   * returns a function that changes state.
   * @param name {string}
   * @param mutator {function}
   * @param info {Object}
   * @returns {function(...[*]): ChangePromise}
   */
  addAction(name, mutator = ({state}) => state, info = {}) {
    if (this.actions[name]) {
      throw new Error(`${this.name} addAction: overwriting ${name}`);
    }

    // console.log('addAction: name:', name, 'mutator:', mutator, 'info:',  info);
    if (!(name && _.isString(name))) {
      throw new Error('addAction: bad name');
    }
    if (!is.function(mutator)) {
      throw new Error('addAction: bad action ' + name);
    }
    if (_.get(info, 'transaction')) {
      this.actions[name] = async (...args) => {
        this.transaction(() => {
          this.update(mutator, args, {
            ...info, action: name
          });
        })
      }
    } else {
      this.actions[name] = async (...args) => {
        this.update(mutator, args, {
          ...info, action: name,
        });
      };
    }
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
    if (!Array.isArray(params)) {
      throw new Error(`bad params for update: ${params}`);
    }

    const {stream} = this;

    try {
      if (this.storeState.state !== STORE_STATE_RUNNING) {
        throw new Error('attempt to update store in state ' + this.storeState.state);
      }
      let nextState = resolve(this, value, ...params);
      if (nextState === Promise.resolve(nextState)) {
        await nextState.then((value) => this.update(value, [], info));
      } else if (nextState && (typeof nextState === 'object')) {
        this.state = nextState;
      }
    } catch (error) {
      stream.error(error);
      if (this.debug) {
        this.debugStore.error({
          source: 'update',
          info,
          value,
          error
        })
      }

      if (_.get(info, 'transaction')) {
        throw error;
      } else {
        stream.error(error);
      }
    }
  }

  complete() {
    if (this.debug) {
      this.debugStream.complete();
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
  .addProp('propState',
    {
      type: 'object',
      defaultValue: () => ({})
    })
  .addProp('transactions', {
    defaultValue: () => new Set()
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
      onChange(nextState) {
        if (
          (this.transactions.length < 1)
          && (this.stateStream.state === STORE_STATE_RUNNING)
        ) {
          this.stream.next(nextState);
        }
      }
    });

export default Store;
