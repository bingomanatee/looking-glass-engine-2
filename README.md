# looking-glass-engine (LGE)

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]
[![Coveralls][coveralls-badge]][coveralls]

## NOTE ON VALUESTREAMS

this branch contains ValueStreams, which will ultimately replace Stores

# Main Documentation

Looking glass engine takes the deceptively hard job of maintaining state
changes and broadcasting updates. 

It is intended for React, but like RxJS is application agnostic and can be used in any
development environment (even server side) that requires state management. 

[build-badge]: https://img.shields.io/travis/user/repo/master.png?style=flat-square
[build]: https://travis-ci.org/user/repo

[npm-badge]: https://img.shields.io/npm/v/npm-package.png?style=flat-square
[npm]: https://www.npmjs.org/package/npm-package

[coveralls-badge]: https://img.shields.io/coveralls/user/repo/master.png?style=flat-square
[coveralls]: https://coveralls.io/github/user/repo

## What is a Store?

A Store instance is an object has a collection of key/value pairs `.state` and a
collection of actions `.actions` that change state. 

It conforms to the RXJS Observable pattern; updated state can be monitored 
by calling `.subscreibe(...)` on a state you instantiate.

```javascript
import {Store} from '@wonderlandlabs/looking-glass-engine';

const myState = new Store(
{
  state: {
      name: 'garden',
      flowers: ['rose', 'petunia']
    },
  actions: {
    addFlower (store, flower) {
      const flowers = [...store.state.flowers, flower];
     // like redux, you return a mutated version of the store's state to update it
     return {...store.state, flowers};
    }
  }
}); 
 myState.subscribe((store) => {
 console.log('state is now ', store.state);
});
 myState.addFlower('lilac');
 // 'state is now', {name: garden, flowers: ['rose', 'petunia', 'lilac']}
```

In React this can be done in the `componentDidMount()`  handler. 

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
const s = new Store({state: {a: 1, b: 2}});
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
   This is the "redux pattern" state updating. (with some exceptions)
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
a react setState(). 
 
A`.setState()` method is supplied for "delta updates"; it takes an object and blends
the objects' values into the state. 
etState does NOT trigger an update notification! It is intended to only be called
from inside an action, not from outside the state. 
  
As a useful shorthand,
`s.setState('foo', 'bar')` has the same effect as `s.setState({foo: 'bar'))`.

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

s.actions.setAlpha(4);
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

s.actions.setAlpha(4);
// 'state is now', {alpha: 4, beta: 'two', delta: [1, 2, 3]}

s.actions.setBeta(4);
// 'error: ', ' bad value set for a: two failed integer'
// (state is unchanged)
```

#### Multiple ways to set props

You can set props as chained calls(as above).

You can also set props as a single call, or as  a constructor parameter:
```javascript
const s = new State({props: {alpha: {type: 'integer', start: 1}}})
.addStateProp('beta', 'two', 'string')
.addStateProps({delta: {start: [1, 2, 3], type: 'array'}});

s.subscribe(({state}) => {
  console.log('state is now ', state);
}, (err) => {
  console.log('error: ', err.message);
});

s.actions.setAlpha(4);
// 'state is now', {alpha: 4, beta: 'two', delta: [1, 2, 3]}

s.actions.setBeta(4);
// 'error: ', ' bad value set for a: two failed integer'
// (state is unchanged)
```
```javascript
const s = new State()
.addStateProp('beta', {a: 1, b: 2}, 'object')
````

#### Advanced Validation

There are multiple forms of the "type" property:

* falsy - no type checking:
* string: (name of method of is.js)
* function: expected to throw on bad data
* array of any of the above

Array tests are done one at a time; so, in the example below, 
your tests can trust that value is a string before it arrives into the function. 

```javascript
const s = new State({alpha: {type: 'integer', start: 1}})
.addStateProp('beta', 'name', ['string',
 (value) => {
if (value.length < 2) throw new Error('must be at least 2 characters');
},
(value) => {
  if (value.length > 10) throw new Error('must be at no more than 10 characters');
  }
])
.addStateProps({delta: {start :[1, 2, 3], type: [
        'array',
        (value) => {
        if (value.length < 1) throw new Error('value cannot be an empty array')
        }
    ]
  }
});

s.subscribe(({state}) => {
  console.log('state is now ', state);
}, (err) => {
  console.log('error: ', err.message);
});

s.actions.setBeta(1);
// 'state is now', {alpha: 4, beta: 'two', delta: [1, 2, 3];

s.actions.setBeta(100);
// 'error: ', 'bad value set for beta: 100 failed string'

s.actions.setBeta('a');
// 'error: ', ' bad value set for beta: value must be at least two characters'
// (state is unchanged)
```

## Synchronicity of Actions

Synchronicity is a "fuzzy" thing in Looking Glass engine. The short answer is that
LGE is *both*.

Actions that return promises are *resolved* and the promise value (if any) updates the state.
Actions themselves (once processed into the Store object) return a promise -- however
if the action itself calls property set actions or any other actions that are not
asynchronous, then the updates are instant, before the promise is resolved. 

If you call an asynchronous action *without waiting for the result* and then call a synchromous 
action then your resolution is *going to be out of order* and will *not* complete 
before the resolution of your action:  

If the api below returns [1, 2, 3], then 

```javascript

const s = new State({ actions: { 
  async loadData( store) {
       const {data} = await axios.get('http://www.data.com/api')
      store.setState('data', [...store.state.data, ...data]);
   },
   loadAndAppend(store, ...values) {
       store.actions.loadData();
       store.actions.setState('data', [...store.state.data, ...values]);
   }
}
})
.addProp('data', [], 'array');

s.actions.loadAndAppend(4, 5, 6)
    .then(() => {
    console.log('data is', s.state.data);
    });
    // 'data is', 4, 5, 6
```
    
you will *not* see the data from loadData in the console.log because you didn't `await`
the sub-call to loadData in `loadAndAppend`. 

Below, note that the action call is prefixed with `await` ensuring completion of the async
action:

```javascript

const s = new State({ actions: { 
  async loadData( store) {
       const {data} = await axios.get('http://www.data.com/api')
      store.setState('data', [...store.state.data, ...data]);
   },
   async loadAndAppend(store, ...values) {
       await store.actions.loadData();
       store.actions.setState('data', [...store.state.data, ...values];
   }
}
})
.addProp('data', [], 'array');

s.actions.loadAndAppend(4, 5, 6)
    .then(() => {
    console.log('data is', s.state.data);
    });
    // 'data is', 1, 2, 3, 4, 5, 6
```
