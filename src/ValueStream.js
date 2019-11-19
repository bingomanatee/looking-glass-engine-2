import _ from 'lodash';
import propper from '@wonderlandlabs/propper'
import {BehaviorSubject, Subject, Notification, merge} from "rxjs";
import {map, distinctUntilChanged, materialize, dematerialize, filter, catchError} from 'rxjs/operators';
import is from 'is';
import resolve from './resolve';
import capFirst from './capFirst';
import EventEmitter from 'events';

const PARAMETER_NAMES = 'name,value,actions,parent,type'.split(',');

const STATUS_ACTIVE = Symbol('active');
const STATUS_CLOSED = Symbol('closed');
const STATUS_NEW = Symbol('new');
const STATUS_TRANSACTION = Symbol('transaction');
const ABSENT = Symbol('just leaving for a pack of cigarettes');

const compare = (v1, v2) => {
  if (v1 === v2) {
    return true;
  }
  return (v1 === v2) || _.isEqual(v1, v2);
};

class ValueStream extends EventEmitter {

  constructor(name, value = ABSENT, actions, type) {
    super();
    this._initStream();
    this._value = ABSENT;
    this._type = ABSENT;
    if (name && is.object(name)) {
      this._argToParam(name);
    } else {
      this.name = name;
      if (value !== ABSENT) {
        this.value = value;
      }
      if (actions && is.object(actions)) {
        this.addActions(actions);
      }
      if (type && is.string(type) && !this.hasChildren) {
        this.type = type;
      }
    }
    this.init();
  }

  /********** INIT *******************/

  _argToParam(arg) {
    Object.keys(arg).forEach(key => {
        if (PARAMETER_NAMES.includes(key)) {
          const value = arg[key];
          this[key] = value;
        }
      }
    );

    if (arg.children) {
      if ('_value' in this) {
        delete this._value;
      }
      this.setMany(arg.children);
    }
  }

  init() {
    this.startValue = this.value;
    this._constructed = true;
  }

  _initStream() {
    if (this._stream) {
      console.log('streamOfValues stream cannot be reset');
      return;
    }
    this._stream = new BehaviorSubject(this);
    this._rootSub = this._stream.subscribe((value) => {
      // the overall model is push and broadcast -- nothing is done locally after
      // update is broadcast
    }, (err) => {
    }, () => {
      try {
        this._unsubChildren();
        this._rootSub = null;
        this.status = STATUS_CLOSED;
      } catch (err) {
        console.log('error unsubscribing? unpossible!', err);
      }
    });
  }

  _unsubChildren() {
    this.childSubs.forEach((sub, key) => {
      sub.unsubscribe();
      this.childSubs.delete(key);
    })
  }

  complete() {
    this.stream.complete();
  }

  addActions(actions) {
    if (!is.object(actions)) {
      throw new Error('non-object passed to addActions');
    }
    Object.keys(actions).forEach((name) => {
      const value = actions[name];
      if (Array.isArray(value)) {
        this.addAction(name, ...value);
      } else {
        this.addAction(name, value);
      }
    })
  }

  /********* PROPERTIES **************/

  get type() {
    if (this._type === ABSENT) {
      return undefined;
    }
    return this._type;
  }

  set type(t) {
    this._type = t; // @todo: value check?
  }

  get actions() {
    if (!this._actions) {
      this._actions = {};
    }

    return this._actions;
  }

  get status() {
    if (!this._status) {
      return STATUS_NEW;
    }
    return this._status;
  }

  set status(s) {
    if (typeof s !== 'symbol') {
      console.log(this.name, 'status set to bad value:', s);
      return;
    }
    if (this._status === s) {
      return;
    }
    this.emit('status', s);
    this._status = s;
  }

  whenfterTransaction(fn) {
    if (!this.isTransactng) {
      fn();
    }
    const onT = () => {
      if (!this.isTransactng) {
        this.off('status', onT);
        fn();
      }
    };

    this.on('status', onT);

    return this;
  }

  /**
   * returns a promise that will resolve after all transactions have cleared.
   *
   * @returns {Promise<unknown>|Promise<void>}
   */
  awaitAfterTransaction() {
    if (!this.isTransactng) {
      return Promise.resolve();
    }
    let done;
    const p = new Promise((d) => done = d)

    const onT = () => {
      if (!this.isTransactng) {
        this.off('status', onT);
        done();
      }
    };

    this.on('status', onT);

    return p;
  }

  /** a shorter handier alias to actions */
  get do() {
    return this.actions;
  }

  set actions(obj) {
    if (obj && is.object(obj)) {
      Object.keys(obj).forEach((fn, name) => {
        this.addAction(name, fn);
      })
    }
  }

  addAction(name, fn, transact) {
    if (transact) {
      this.actions[name] = async (...args) => {
        await this.transact(async () => {
          try {
            await resolve(this, fn(this, ...args));
          } catch (err) {
            this._emitError(err);
          }
        });
      };
    } else {
      this.actions[name] = async (...args) => {
        try {
          await resolve(this, fn(this, ...args));
        } catch (err) {
          this._emitError(err);
        }
      };
    }
    return this;
  }

  get state() {
    if (this.hasChildren) {
      return this.values;
    }
    return this.value;
  }

  get stream() {
    return this._stream;
  }

  get streamInvulnerable() {
    return this.stream.pipe(
      catchError(err => {
        this.errorStream.next(err);
        return new BehaviorSubject(this);
      })
    )
  }

  get errorStream() {
    if (!this._eStream) {
      this._eStream = new Subject();
    }
    return this._eStream;
  }

  get streamOfValues() {
    if (!this._valueStream) {
      this._valueStream = this.streamInvulnerable
        .pipe(map((stream) => {
            if (stream.hasChildren) {
              return stream.asObject;
            }
            return stream.value;
          }),
          distinctUntilChanged((prev, curr) => {
            const diff = compare(prev, curr);
            return diff;
          })
        );
    }
    return this._valueStream;
  }

  get asObject() {
    if (!this.hasChildren) {
      return {value: this.value};
    }
    const out = {};
    this.children.forEach((value, key) => {
      try {
        if (value instanceof ValueStream) {
          if (!value.hasChildren) {
            out[key] = value.value;
          } else {
            out[key] = value.asObject;
          }
        } else {
          out[key] = value;
        }
      } catch (err) {
      }
    });

    return out;
  }

  get asMap() {
    // this is pretty messed up but... whatever.
    if (!this.hasChildren) {
      return new Map(['value', this.value]);
    }
    const map = new Map();
    this.children.forEach((value, key) => {
      if (value instanceof ValueStream) {
        if (value.hasChildren) {
          map.set(key, value.asMap())
        } else {
          map.set(key, value.value);
        }
      } else {
        map.set(key, value);
      }
    });
    return map;
  }

  get mapStream() {
    if (!this._mapStream) {
      this._mapStream = this.stream.pipe(map((valueStream) => {
        if (valueStream.hasChildren) {
          return valueStream.asMap;
        }
      }));
    }
    return this._mapStream;
  }

  /**
   * this is either a local (scalar?) value for a "leaf" (childless) stream
   * or the raw map that the child values subscribe into.
   * @returns {Map|var}
   */
  get value() {
    if (this.hasChildren) {
      return new Map(this.children.entries());
    } else if (this._value === ABSENT) {
      return undefined;
    }
    return this._value;
  }

  /**
   * this test ONLY evaluates the existenceness of the value property.
   * i.e., it is true if this ValueStream has a value AND NOT children.
   * @returns {boolean}
   */
  get hasValue() {
    if (this.hasChildren) {
      return false;
    }
    if (!('_value' in this)) {
      return false;
    }
    if (this.value === ABSENT) {
      return false;
    }
    if (is.undef(this.value)) {
      return false;
    }
    return true;
  }

  /**
   * sets the stream's value -- either as a single value
   * or as an object dispersal of a set of children values.
   *
   * if the value is an object or array AND the stream is typed thus,
   * it will deconstruct the value to attempt to encourage immutability.
   *
   * @param newValue {any}
   */
  set value(newValue) {
    if (!this._constructed && is.object(newValue)) {
      this._value = newValue;
      return;
    }
    if (this.hasChildren) {
      if (Array.isArray(newValue)) {
        this.set(...newValue);
      }
      if (is.object(newValue)) {
        this.setMany(newValue);
      }
      console.log('attempted to set the value of ', this.name, 'which has children; a no-op');
      this._updateStatus();
    } else {
      if (this.type !== ABSENT) {
        if (!this.validValue(newValue)) {
          this._emitError({
            message: 'attempt to set invalid value',
            name: this.name,
            value: newValue,
            type: this.type,
          });
          return;
        }
      }
      if (this.type === 'array' && Array.isArray(newValue)) {
        this._value = [...newValue];
      } else if (this.type === 'object' && newValue && is.object(newValue)) {
        this._value = {...newValue};
      } else {
        this._value = newValue;
      }
      this._updateStatus();
      this._broadcast();
    }
  }

  /**
   * returns a ValueStream that responds to a subset of this streams' fields.
   * The return vaue will share the child streams of this one.
   *
   * note - filter streams ONLY return the state - no the store with state and action props.
   *
   * @param fields {Array<String>>}
   * @returns {ValueStream}
   */
  filter(...fields) {
    if (!this.hasChildren) {
      return this;
    }

    const fieldNames = _(fields)
      .flattenDeep()
      .compact()
      .filter(is.string)
      .sortBy()
      .value();

    return this.streamOfValues.pipe(
      map((value) => {
        if (!is.object(value)) {
          return value;
        }
        return _.pick(value, fieldNames);
      }),
      distinctUntilChanged((prev, curr) => {
        return compare(prev, curr);
      })
    )
  }

  _inferType(value) {
    if (Array.isArray(value)) {
      this.type = 'array';
    } else {
      if (is.undef(value)) {
        return;
      }
      if (is.number(value)) {
        this.type = 'number';
      } else if (is.string(value)) {
        this.type = 'string';
      } else if (is.date(value)) {
        this.type = 'date';
      } else if (is.object(value)) {
        this.type = 'object';
      }
      this.type = '';
      // -- any zany outliers are assumed to not be typed.
    }
  }

  /**
   * this is like value --- except --- if there are children the value are coerced
   * into an object.
   *
   * @returns {*}
   */
  get values() {
    if (!this.hasChildren) {
      return this.value;
    }

    const out = {};
    this.children.forEach((value, key) => {
      out[key] = value instanceof ValueStream ? value.values : value;
    });
    return out;
  }

  get children() {
    if (!this._children) {
      this._children = new Map();
    }
    return this._children;
  }

  get childSubs() {
    if (!this._childSubs) {
      this._childSubs = new Map();
    }
    return this._childSubs;
  };

  /* ******************* METHODS ********************* */

  async transact(fn) {
    const status = this._status;
    this._status = STATUS_TRANSACTION;

    const t = this._tCount;
    this._tCount = t + 1;
    try {
      await resolve(this, fn);
    } catch (err) {
      console.log('transaction error', t, err);
      this._emitError(err);
    }
    this.status = status;
    this._broadcast();
    return this;
  }

  transactSync(fn) {
    const status = this.status;
    this._status = STATUS_TRANSACTION;

    const t = this._tCount;
    this._tCount = t + 1;
    try {
      fn();
    } catch (err) {
      console.log('transaction error', t, err);
      this._emitError(err);
    }
    this.status = status;
    this._broadcast();
    return this;
  }

  subscribe(onNext, onError, onComplete) {
    if (onError) {
      this.errorStream.subscribe(onError);
    }
    return this.streamInvulnerable.subscribe(onNext, onError, onComplete);
  }

  subscribeToValue(onValue, onError, onComplete) {
    if (onError) {
      this.errorStream.subscribe(onError);
    }
    return this.streamOfValues
      .subscribe(onValue, onError, onComplete);
  }

  subscribeToMap(onNext, onError, onComplete) {
    if (onError) {
      this.errorStream.subscribe(onError);
    }
    return this.mapStream.subscribe(onNext, onError, onComplete);
  }

  get(key, asValue = true) {
    if (!this.hasChildren) {
      if (asValue) {
        if (is.object(this.value) && key in this.value) {
          return this.value[key];
        }
      }
      console.log('get(', key, ') called on a childless ValueStream', ths.name, 'with value', this.value);
    }
    if (this.has(key)) {
      const value = this.children.get(key);
      if (asValue && (value instanceof ValueStream)) {
        return value.value;
      }
      return value;
    } else {
      console.log('get -- cannot find key ', key, 'in', this.children);
    }
  }

  /**
   * This is a direct update method to update a named value -- or the sole value on a childless node.
   * You can set multiple properties in a single stroke --
   * set('alpha', 1, 'beta', 2, 'delta', 3) will broadcast an update only once.
   *
   * note: for single value streams, set requires no key; the first argument to set
   * is the new value.
   *
   * @param key
   * @param value
   * @param otherArgs
   */
  set(key = ABSENT, value = ABSENT, ...rest) {
    if (key === ABSENT) {
      console.log('called set on ', this.name, 'with no arguments');
      return;
    }

    if (this.isComplete) {
      throw new Error('cannot update value of closed stream ' + this.name);
    }

    this.transactSync(() => {
      if (this.hasChildren) {
        if (is.string(key)) {
          this._updateChild(key, value);
          while (rest.length) {
            const nextKey = rest.shift();
            const nextValue = rest.shift();
            if (is.string(nextKey)) {
              this._updateChild(nextKey, nextValue);
            }
          }
        } else {
          console.log('bad key value passed to set:', key, value);
        }
      } else {
        this.value = key;
      }
    });
    return this;
  }

  setMany(obj) {
    if (!is.object(obj)) {
      throw new Error('setMany only accepts an object');
    }
    if (this._constructed && !this.hasChildren) {
      throw new Error('setMany called on a ValueStream without children -- ' + this.name);
    }
    if (obj instanceof Map) {
      obj.forEach((value, name) => {
        if (!this._constructed) {
          this.addChild(name, value)
        } else {
          this._updateChild(name, value);
        }
      });
    } else {
      Object.keys(obj).forEach((name) => {
        const objValue = obj[name];
        if (!this._constructed) {
          this.addChild(name, objValue)
        } else {
          this._updateChild(name, objValue);
        }
      })
    }
    if (this._constructed) {
      this._broadcast();
    }
    return this;
  }

  setState(obj) {
    return this.setMany(obj);
  }

  has(key) {
    if (!this.hasChildren) {
      return false;
    }
    // note will hit EMPTY_MAP for single value
    return this.children.has(key);
  }

  addSubStream(key, ...args) {
    let value;
    const first = args[0];
    if (first instanceof ValueStream) {
      first.parent = this;
      value = first;
    } else {
      value = new ValueStream(key, ...args);
      value.parent = this;
    }
    return this.addChild(key, value);
  }

  /**
   * a synonym for backwards compatibility
   * @param args
   * @returns {*}
   */
  addProp(...args) {
    return this.addSubStream(...args);
  }

  _purgeValue() {
    delete this._value;
    delete this._type;
  }

  addChild(key, value, type) {
    if (this.children.has(key)) {
      throw new Error('cannot redefine key ' + key)
    }
    if (!this.hasChildren && this.hasValue) {
      console.log('adding a child', key, 'to ValueStream', this.name, 'will remove its singular value.');
      this._purgeValue();
    }

    if (!(value instanceof ValueStream)) {
      if (type) {
        value = new ValueStream({
          name: key,
          value,
          type,
          parent: this
        })
      } else if (is.object(value) && ('value' in value) && ('type' in value)) {
        value = new ValueStream({
          name: key,
          type: value.type,
          value: value.value,
        })
      }
    }
    this.children.set(key, value);

    this._updateStatus();

    const setMethodName = 'set' + capFirst(key);
    try {
      this.addAction(setMethodName,
        (store, value) => {
          this.set(key, value);
          return false;
        });
    } catch (err) {
      console.log('adding a child property ', key, 'but NOT a set method because ', setMethodName, ' is already an action')
    }

    const subValue = this.children.get(key);
    if (subValue instanceof ValueStream) {
      const sub = subValue.subscribe(this._broadcast.bind(this), (error) => {
        this._emitError({
          message: 'child error:' + _.get(error, 'message', ''),
          child: key,
          error
        })
      }, () => {
        if (sub) {
          sub.unsubscribe();
        }
      });
    }
    return this;
  }

  /**
   * set the value of a key. This handles the branch of `.set()` that is for children.
   * it does NOT broadcast.
   * reducing the number of broadcasts
   * @param key {string}
   * @param value {any}
   */
  _updateChild(key = ABSENT, value = ABSENT) {
    if (key === ABSENT) {
      throw new Error('must call set with arguments');
    }

    if (value === ABSENT) {
      throw new Error('ValueStream.set called without value for key ' + key);
    }

    if (this._constructed && !this.has(key)) {
      console.log(this.name, 'has no child ', key, 'in', this.children);
      throw new Error('ValueStream ' + this.name + ' has no child ' + key + ' -- existing keys [' + Array.from(this.children.keys()).join(',') + ']');
    }

    if (this.isComplete) {
      throw new Error('cannot update the child value of a closed streamOfValues');
    }

    if (!this.hasChildren) {
      return this._emitChildError(key, new Error('attempt to emit a child error on a childless ValueStream'))
    }

    if (!this.children.has(key)) {
      return this._emitChildError(key, 'ValueStream ' + this.name + ' has no key ' + key, '; existing keys = ', this.children.keys());
    }

    const currentValue = this.children.get(key);
    if (currentValue instanceof ValueStream) {
      currentValue.set(value); // the value should broadcast back to this stream automatically
    } else {
      this.children.set(key, value);
    }
    this.changed(key, value, currentValue);
  }

  _emitChildError(key, error) {
    if (!this.isComplete) {
      this._emitError({
        type: 'child error',
        key,
        error
      })
    }
  }

  _emitError(err) {
    try {
      if (!this.isComplete) {

        if (is.string(err)) {
          err = new Error(err);
        }
        this.errorStream.next(err);
      }
    } catch (err) {
      console.log('emit error -- has an error ?', err.message);
    }
  }

  _broadcast() {
    // if (this.isTransacting) return;
    if (!this.isActive) {
      return;
    }
    this.stream.next(this);
  }

  _setLocalValue(value) {
    if (!this.isActive) {
      return;
    }
    if (this.validValue(value)) {
      this._value = value;
    } else {
      this._emitError({
        name: this.name,
        message: 'bad set attempt',
        value,
        type: this.type
      })
    }
    try {
      this._broadcast();
    } catch (err) {
      console.log('error setting value of ', this.name, 'to', value);
    }
  }

  // --- change notification

  _changeEventName(key) {
    return 'changed:' + key;
  }

  changed(key, value, oldValue) {
    this.emit(this._changeEventName(key), {name: key, value, oldValue});
  }

  watch(key, listener) {
    if (!(key && is.string(key))) {
      console.log(this.name, 'bad watch request for key', key);
    } else if (is.string(listener)) {
      if (this.do[listener]) {
        this.on(this._changeEventName(key), this.do[listener])
      } else {
        console.log('cannot listen to ', key, 'with', listener, '(not an action)')
      }
    } else if (is.fn(listener)) {
      this.on(this._changeEventName(key), listener);
    } else {
      console.log('bad watch to ', this.name, key, listener);
    }
    return this;
  }

  // ---- misc. flags

  get hasChildren() {
    if (!this._children) {
      return false;
    }
    return this._children.size > 0;
  }

  validValue(value) {
    if (!this.type) {
      return true;
    }
    let isValid = true;
    if ((is.fn(is[this.type]))) {
      isValid = is[this.type](value);
    } else {
      console.log('cannot find type ', this.type, 'in', Object.keys(is));
    }
    return isValid;
  }

  // ---- status flags

  /**
   * checks to see if the stream is complete enough to qualify as active.
   * @private
   */
  _updateStatus() {
    if (this.isNew && (this.hasChildren || (this.hasValue))) {
      this.status = STATUS_ACTIVE;
    }
  }

  get isNew() {
    return this.status === STATUS_NEW;
  }

  get isActive() {
    return this.status === STATUS_ACTIVE;
  }

  get isComplete() {
    return this.status === STATUS_CLOSED;
  }

  get isTransactng() {
    return this.status === STATUS_TRANSACTION;
  }
}

propper(ValueStream)

  .addProp(
    'name'
    , {
      type: 'string'
      ,
      required: true
      ,

      onChange(value) {
        this._updateStatus();
      }
    }
  )
  .addProp('status', {type: 'symbol', defaultValue: STATUS_NEW})
  .addProp('parent')
  .addProp('startValue')
  .addProp('onError', {
    type: 'fn'
  })
  .addProp('canSetChildValues', {
    type: 'boolean',
    defaultValue: true
  })
  .addProp('_tCount', {defaultValue: 0, type: 'integer'})
  .addProp('lastError')
  .addProp('tests', {
    type: 'array',
    defaultValue: () => ([])
  });

export default ValueStream;
