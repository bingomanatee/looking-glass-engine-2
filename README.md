# looking-glass-engine (LGE)

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]
[![Coveralls][coveralls-badge]][coveralls]

Describe looking-glass-engine here.

[build-badge]: https://img.shields.io/travis/user/repo/master.png?style=flat-square
[build]: https://travis-ci.org/user/repo

[npm-badge]: https://img.shields.io/npm/v/npm-package.png?style=flat-square
[npm]: https://www.npmjs.org/package/npm-package

[coveralls-badge]: https://img.shields.io/coveralls/user/repo/master.png?style=flat-square
[coveralls]: https://coveralls.io/github/user/repo

Looking glass engine takes the deceptively hard job of maintaining state
changes and broadcasting updates. 

A Store instance has a collection of key/value pairs `.state` and a
collection of actions `.actions` that change state. 

## State 

State is a POJO that has name-value pairs. It can be as complex or simple as you like, 
with any level of nesting you need. 

State is initialized to the `.start` property of the constructor config,
along with any other start values of parameters you define with `.addStateProp(s)`.

while you *can* manually set the state from the outside, this is a *bad idea*.
State should be changed with actions; also any properties you change won't be 
immediately registered .

**THE WRONG WAY**

```javascript
// the road to hell

const s = new Store({state: {a: 1, b: 2}});
s.setState({a: 2, b: 3});

// actual hell
s.state.b = 4;
```

**THE RIGHT WAY**_

```javascript

const s = new Store({state: {a: 1, b: 2},
actions: {
  incrementBoth: ({state}) => {
   let {a, b} = state;
    a += 1;
    b += 1;
    return {...state. a, b};
}
}
})

s.actions.incrementBoth();
console.log('store state:', s.state);
// {a: 2, b: 3}

```

### Observing State

There is an RxJS BehaviorStream for each store that emits the entire Store every time
state is changed. To harvest state change from the Store,
call `myStore.subscribe(onChange, onError, onComplete)` and extract state from the result:

```javascript

const s = new Store({state: {a: 1, b: 2},
actions: {
  incrementBoth: ({state}) => {
   let {a, b} = state;
    a += 1;
    b += 1;
    return {...state. a, b};
}
}
})

s.subscribe(({state}) => {
  console.log('state is now ', state);
});

s.actions.incrementBoth();

// 'state is now', {a: 2, b: 3}

```

## Actions

Actions change state in one of three ways:

1. The return value of an action, *if it is not undefined*, replaces the state.
   This is the "redux pattern" state updating.
2. Actions have access to the store, and so, can call *other actions*. 
3. BOTH of the above changes can occur from the same Store's action. 

## Action types

There are two of action types: user defined actions and property setters that
are side effects of addProp. 

### User defined actions

Any action you pass to the actions collection of the store is turned into a mutator;
the first parameter of the action is the store itself, and the subsequent parameters
are (optionally) whatever the user submits.

You **DO NOT HAVE** to return the next value of state if you wish to simply change state
indirectly through calling other actions. if an action doesn't have a return clause
(returns undefined) then calling it will not *directly* change state. 

If you **DO** return state you must return ALL of state; this is not a "delta update" like
a react setState(). (a `.setState()` method is supplied for "delta updates" but again,
its best to call it from actions, not directly.)

**THE WRONG WAY**

```javascript

const s = new Store({state: {a: 1, b: 2},
actions: {
  incrementA: ({state}) => {
   let {a} = state;
    a += 1;
    return {a};
}
}
})

s.subscribe(({state}) => {
  console.log('state is now ', state);
});

s.actions.incrementA();

// 'state is now', {a: 2}
// crap! where is B?

```

**THE RIGHT WAY**
**THE WRONG WAY**

```javascript

const s = new Store({state: {a: 1, b: 2},
actions: {
  incrementA: ({state}) => {
   let {a} = state;
    a += 1;
    return {...state, a};
}
}
})

s.subscribe(({state}) => {
  console.log('state is now ', state);
});

s.actions.incrementA();

// 'state is now', {a: 2, b: 2}
// better. No missing properties.

```

### property definition actions

Every property defined (see below) implicitly creates a set-method based on the property name:

```javascript

const s = new State()
.addStateProp('alpha',1)
.addStateProp('beta', 2)
.addStateProp('delta', 3);

s.subscribe(({state}) => {
  console.log('state is now ', state);
});

s.setAlpha(4);
// 'state is now', {alpha: 4, beta: 2, delta: 3}

```

State Properties can have type validations thanks to [is.js](http://is.js.org):

```javascript

const s = new State()
.addStateProp('alpha',1, 'integer')
.addStateProp('beta', 'two', 'string')
.addStateProp('delta', [1, 2, 3], 'array');

s.subscribe(({state}) => {
  console.log('state is now ', state);
}, (err) => {
  console.log('error: ', err.message);
});

s.setAlpha(4);
// 'state is now', {alpha: 4, beta: 'two', delta: [1, 2, 3]}

s.setBeta(4);
// 'error: ', ' bad value set for a: two failed integer'
// (state is unchanged)
```
