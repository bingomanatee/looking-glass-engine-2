(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@wonderlandlabs/propper'), require('lodash'), require('rxjs'), require('uuid/v4'), require('uuid'), require('rxjs/operators'), require('is')) :
  typeof define === 'function' && define.amd ? define(['@wonderlandlabs/propper', 'lodash', 'rxjs', 'uuid/v4', 'uuid', 'rxjs/operators', 'is'], factory) :
  (global = global || self, global.LGE = factory(global.propper, global._, global.rxjs, global.uuid, global.uuid$1, global.operators, global.is));
}(this, function (propper, _, rxjs, uuid, uuid$1, operators, is) { 'use strict';

  propper = propper && propper.hasOwnProperty('default') ? propper['default'] : propper;
  _ = _ && _.hasOwnProperty('default') ? _['default'] : _;
  uuid = uuid && uuid.hasOwnProperty('default') ? uuid['default'] : uuid;
  uuid$1 = uuid$1 && uuid$1.hasOwnProperty('default') ? uuid$1['default'] : uuid$1;
  is = is && is.hasOwnProperty('default') ? is['default'] : is;

  /**
   * "FSM" is a Finite State Machine; the mathematical definition of state.
   * with mode you can define different states that you go between,
   * which paths are legitimate or not,
   *
   * "FSMState" represents a single state; a Modes instance is of several FSMState, collected in a map
   * that you can move between
   */

  const INDETERMINATE = Symbol('INDETERMINATE');
  const ALL_STATES = '*';

  const STABLE = Symbol('STABLE');

  class FSMState {
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

      this.stateStream = new rxjs.BehaviorSubject(this.state);
      this.transState = new rxjs.BehaviorSubject(this.toJSON());
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
      } else {
        if (!this.has(fromState)) {
          throw new Error(`no ${fromState} in ${this.name}`);
        }

        const state = this.states.get(fromState);
        state.addAction(name, toState);
      }

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
      this._arrive(name);
    }

    _arrive(mode) {
      if (this.done) {
        throw new Error('cannot _arrive() from a completed state');
      }
      let name = mode;

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
          });
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

  function debug$1(...args) {
  }

  const resolve = (context, alpha, ...args) => {
    if (typeof alpha === 'undefined') {
      return;
    }
    if (_.isFunction(alpha)) {
      debug$1('... calling fn -', alpha.toString());
      return resolve(context, alpha(context, ...args));
    }

    if (Promise.resolve(alpha) === alpha) { // i.e., alpha is a promise
      return alpha.then((value, ...pArgs) => {
        return resolve(context, value, ...pArgs);
      })
    }
    return alpha;
  };

  const STORE_STATE_ERROR = 'error';
  const STORE_STATE_RUNNING = 'running';
  const STORE_STATE_COMPLETE = 'complete';

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

  /* eslint-disable no-useless-escape,max-len */
  var nameRegex = /^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|null|this|true|void|with|await|break|catch|class|const|false|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)(?:[\$A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D])(?:[\$0-9A-Z_a-z\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B4\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF])*$/;

  /**
   * this function takes a test = an array of criteria or a single one --
   * and throws any validation failures.
   *
   * @param test
   * @param value
   */
  const validate = (name, test, value) => {
    if (Array.isArray(test)) {
      test.forEach(typeItem => {
        validate(name, typeItem, value);
      });
      return;
    }

    if (is.function(test)) {
      try {
        test(value);
      } catch (err) {
        console.log('validation failure: ', name, test, value);
        throw err;
      }
    } else if (is.string(test)) {
      if (!is[test]) {
        throw new Error(`bad criteria for ${name}: ${test}`);
      }
      if (!is[test](value)) {
        throw new Error(`bad value set for ${name}: ${value} failed ${test}`);
      }
    } else {
      throw new Error(`bad criteria for ${name}: ${test}`);
    }
  };

  function capFirst (string) {
    if (!(string && is.string(string))) {
      throw new Error(`capFirst: bad input ${string}`)
    }
    return string[0].toUpperCase() + string.slice(1);
  }

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

      this.stream = new rxjs.BehaviorSubject(this)
        .pipe(operators.filter(() => {
          return this.transactions.length < 1
        }));
      this.name = name || uuid$1();
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
        });
      }
      this.state = {...this.state, [name]: start};
      return this;
    }

    startDebugging() {
      if (!this.debug) {
        this.debugStream = new rxjs.BehaviorSubject({
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
            });
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
        const actionId = (this.debug || info.transaction) ? uuid$1() : '';
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
        });
      };
    }

    async transaction(fn) {
      const tid = uuid$1();
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
        defaultValue: uuid$1
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

  var index = {
    FSM, Store, STABLE, INDETERMINATE, ALL_STATES,
    STORE_STATE_RUNNING, STORE_STATE_COMPLETE, STORE_STATE_ERROR,
    capFirst,
    nameRegex,
    makeStoreState, resolve
  };

  return index;

}));
