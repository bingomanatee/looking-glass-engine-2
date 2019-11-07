import _ from 'lodash';
import propper from '@wonderlandlabs/propper'
import uuid from 'uuid';
import {BehaviorSubject, EMPTY} from "rxjs";
import {filter} from 'rxjs/operators';
import is from 'is';
import makeStoreState, {STORE_STATE_ERROR, STORE_STATE_RUNNING} from './makeStoreState';
import nameRegex from './nameRegex';
import validate from './validate';
import resolve from './resolve';
import capFirst from './capFirst';

// to reduce memory, a "stub" map is used for children until a child is added parametrically
export const EMPTY_MAP = {
  _id: 'empty map',
  get() {
    return null;
  },
  forEach(iter) {
    // do nothing with the iterator
  },
  set(value) {
    throw new Error('cannot set ' + value + ' on empty map');
  },
  length: 0,
  keys() {
    return []
  },
  values() {
    return []
  },
  delete() {

  },
  has() {
    return false;
  }
};

const PARAMETER_NAMES = 'name,startValue,type,parent,onError'.split(',');

const STATUS_ACTIVE = Symbol('active');
const STATUS_CLOSED = Symbol('closed');
const STATUS_NEW = Symbol('new');
const STATUS_TRANSACTION = Symbol('transaction');
const ABSENT = Symbol('just leaving for a pack of cigarettes');

class ValueStream {

  constructor(...args) {
    this._value = ABSENT;
    const first = args[0];
    if (first && is.object(first)) {
      this._argToParam(first);
    } else {
      for (let i = 0; i < args.length; ++i) {
        const value = args[i];
        if (i < PARAMETER_NAMES.length) {
          const key = PARAMETER_NAMES[i];
          // console.log('valueStream c:', key, value );
          this[key] = value;
        } else if (value && is.object(value)) {
          this._argToParam(value);
        } else {
          console.log('strange constructor argument', i, value);
        }
      }
    }
    this.init();
  }

  /********** INIT *******************/

  _argToParam(arg) {
    Object.keys(arg).forEach(key => {
        if (PARAMETER_NAMES.includes(key)) {
          this[key] = arg.key;
        }
      }
    );
  }

  init() {
    this._initStream();
  }

  _initStream() {
    if (this._streamSet) {
      throw new Error('valueStream stream cannot be reset');
    }
    this._stream = new BehaviorSubject(this.startValue);
    const valueSub = this._stream.subscribe((value) => {
      // the overall model is push and broadcast -- nothing is done locally after
      // update is broadcast
    }, (err) => {
    }, () => {
      try {
        this._status = STATUS_CLOSED;
      } catch (err) {
        console.log('error unsubscribing? unpossible!', err);
      }
    });
    this._streamSet = true;
  }

  /********* PROPERTIES **************/

  get stream() {
    return this._stream;
  }

  /**
   * this is either a local (scalar?) value for a "leaf" (childless) stream
   * or the raw map that the child values subscribe into.
   * @returns {Map|var}
   */
  get value() {
    if (this.hasChildren) {
      return this.children;
    } else if (this._value === ABSENT) {
      return undefined;
    }
    return this._value;
  }

  /**
   * this is like value --- except --- if there are children the value are coerced
   * into an object.
   *
   * @returns {*}
   */
  get values() {
    if (!this.hasChildren) {
      return this._value;
    }

    const out = {};
    this.children.forEach((value, key) => {
      out[key] = value instanceof ValueStream ? value.values : value;
    });
    return out;
  }

  get state() {
    return [this.name, this.values, this.status, this.lastError];
  }

  get children() {
    return this._children || EMPTY_MAP;
  }

  get childSubs() {
    if ((!this._childSubs) && (this.hasChildren)) {
      this._childSubs = new Map();
    }
    return this._childSubs || EMPTY_MAP;
  };

  /* ******************* METHODS ********************* */

  async transact(fn) {
    if (this.isClosed) {
      throw new Error('cannot transact a closed valueStream');
    }
    const status = this._status;
    this._status = STATUS_TRANSACTION;

    await resolve(fn);
    this._status = status;
    this._broadcast();
  }

  subscribe(...args) {
    if (!this.isClosed) {
      return this.stream.subscribe(...args);
    }
    throw new Error('cannot subscribe to a closed valueStream');
  }

  set(key, value) {
    if (this.hasChildren) {
      if (key === ABSENT) {
        throw new Error('cannot set the value of a parent ValueStream');
      }
      if (!this.canSetChildValues) {
        throw new Error('cannot set the child values of this ValueStream with "set"')
      }
      if (!this.has(key)) {
        console.log('failed to find key in ', this.children);
        throw new Error('ValueStream ' + this.name + ' has no child ' + key +  ' -- existing keys [' + Array.from(this.children.keys()).join(',') + ']');
      }
      this.updateChildValue(key, value);
    } else {
      value = key;
      if (this.isClosed) {
        throw new Error('cannot update value of closed stream ' + this.name);
      }
      this._updateSingleValue(value);
    }
  }

  has(key) {
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
    this.addChild(key, value);
    return this;
  }

  /**
   * a synonym for backwards compatibility
   * @param args
   * @returns {*}
   */
  addProp(...args) {
    return this.addSubStream(...args);
  }

  addChild(key, value) {
    if (!this.hasChildren) {
      this._children = new Map();
    }
    if (this.children.has(key)) {
      throw new Error('cannot redefine key ' + key)
    }
    if (value instanceof ValueStream) {
      this.children.set(key, value);

    } else {
      this.children.set(key, new ValueStream(key, value));
    }
    this._updateStatus();
    this.childSubs.set(key, this.children.get(key).subscribe((value) => {
      this._broadcast();
    }, (error) => {
    }, () => {
      if (this.childSubs.has(key)) {
        this.childSubs.get(key).unsubscribe();
        this.childSubs.delete(key);
      }
    }))
  }

  _updateSingleValue(value) {
    if (this.hasChildren) {
      return this._emitError(new Error('attempt to update the value on a parent ValueStream'))
    }
    this._setLocalValue(value);
  }

  updateChildValue(key, childValue) {
    if (this.isClosed) {
      throw new Error('cannot update the child value of a closed valueStream');
    }
    if (!this.hasChildren) {
      return this._emitChildError(key, new Error('attempt to emit a child error on a childless ValueStream'))
    }
    if (!this.children.has(key)) {
      return this._emitChildError(key, 'ValueStream ' + this.name + ' has no key ' + key, '; existing keys = ', this.children.keys());
    }

    const currentValue = this.children.get(key);
    if (currentValue instanceof ValueStream) {
      currentValue.set(childValue);
    } else {
      this.children.set(key, childValue);
    }
  }

  _emitChildError(key, error) {
    if (!this.isClosed) {
      this.stream.error({
        type: 'child error',
        key,
        error
      })
    }
  }

  _emitError(err) {
    if (!this.isClosed) {
      this.stream.error(err);
    }
  }

  _broadcast() {
    // if (this.isTransacting) return;
    if (!(this.isActive)) {
      return this._emitError(new Error('attempt to update the value on a closed ValueStream'))
    }
    if (this.hasChildren) {
      this.stream.next(this.values);
    } else {
      this.stream.next(this.value);
    }
  }

  _setLocalValue(value) {
    if (!this.isActive) {
      return;
    }
    if (this._goodType(value)) {
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

  // ---- misc. flags

  get hasChildren() {
    return this.children !== EMPTY_MAP;
  }

  _goodType(value) {
    if (this.type === ABSENT) {
      return true;
    }
    if (is.function(this.type)) {
      return !this.type(value);
    }
    if (is.string(this.type) && (is[this.type])) {
      return is[this.type](value);
    }
    throw new Error('strange type definition');
  }

  // ---- status flags

  /**
   * checks to see if the stream is complete enough to qualify as active.
   * @private
   */
  _updateStatus() {
    if (!this.isNew) {
      return;
    }
    if (this.name && (this.hasChildren || this._value !== ABSENT)) {
      this._status = STATUS_ACTIVE;
    }
  }

  get isNew() {
    return this.status === STATUS_NEW;
  }

  get isActive() {
    return this.status === STATUS_ACTIVE;
  }

  get isClosed() {
    return this.status === STATUS_CLOSED;
  }
  get isTransactng() {
    return this.status === STATUS_TRANSACTION;
  }
}

propper(ValueStream)
  .addProp('name', {
    type: 'string',
    required: true,
    onChange(value) {
      this._updateStatus();
    }
  })
  .addProp('type', {
    defaultValue: ABSENT
  })
  .addProp('status', {type: 'symbol', defaultValue: STATUS_NEW})
  .addProp('parent')
  .addProp('startValue', {
    onChange(value) {
      if (this.isNew) {
        this._value = value;
        this._updateStatus();
      }
    }
  })
  .addProp('onError', {
    type: 'fn'
  })
  .addProp('canSetChildValues', {
    type: 'boolean',
    defaultValue: true
  })
  .addProp('lastError')
  .addProp('tests', {
    type: 'array',
    defaultValue: () => ([])
  });

export default ValueStream;
