# looking-glass-engine (LGE) 3.0 - the ValueStream release

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]
[![Coveralls][coveralls-badge]][coveralls]

The 3.0 Looking Glass Engine (LGE) release contains ValueStreams, which will ultimately replace Stores.
Value streams are recursive notes that stream values from either 
a single value field, OR a map of children that can in turn be ValueStreams
or general values. 

ValueStreams can be *filtered*; call `.filter(...field names)` to receive a stream of sub-values
of the main ValueStreams or rather to block out change notification from
all other values. This is analogous to the `connect()` technique that makes Redux such a joy;
you can selectively filter the output fields to a subset of the original stream.

## Why the new system

Stores were MASSIVELY GREAT and I used it for years to accelerate my efficiency
in application design. however they had a few minor issues I found troublesome.

1. The 'toss-in' nature of properties made it possible to set the property of a
   property to a badly-typed value -- or worse yet if you're not careful, remove it entirely
2. It was not easy to observe a set of properties' change, ignoring the updating
   of other ones; when *any* properties changed, the entire store was broadcast.
   You could of course use RxJS mixins to refine your results, but it was such
   a core feature I wanted to directly address it. 
3. In use it became clear that properties weren't a "nice to have" feature of 
   stores but were in fact to useful that the need to define a store *without*
   a fixed schema and set of initialized properties really didn't exist.
4. Actions encourage you to call multiple `.setName(value)` calls of the Store,
   which can trigger a lot of updates broadcasts.
   
SO the conceit of having a store being "an observable collection of stuff" that 
if you wanted to, you could define by a schema, really didn't hold water. 

The strength of a more aggressively structured map of property/value pairs
let to a whole new model that was both simpler and more interesting: ValueStreams.

## Value Streams: A New Beginning

A Value Stream is an observable that is either:
* an observable single value, with an optional type constraint
* an observable **Map** of values -- children -- which are either:
  1. a basic untyped value
  2. a single value ValueStream
  3. a multi-value ValueStream
  
The latter is where things get interesting. You can replicate the multi-tenant
model of Redux with a ValueStream of ValueStreams.

## `.subscribe(..)`ing to a ValueStream

There are multiple sucbscription options. 

* `.subscribe()` to a ValueStream returns the entire ValueStream every time one(or more)
  of its values are changed. (this is the reccommended method, as you have full access 
  to the entire ValueStream in the listener.)
* `subscribeToValue` returns the  value/children as an object *ONLY* to all listeners. 
* `subscribeToMap` returns a nested map of the children. 

## The Filtering

Filtering ValueStreams are a snap. Filtering is only relevant to map 
ValueStreams; you can call `const observable = myStream.filter('name', 'age', 'height')`
and get an RxJS patterned observable that you can subscribe to when a particular subset of fields
are updated. This means you can ignore all updates on the *other* fields.

Unlike subscribing to ValueStreams, filtered subscriptions only return 
the actual sub-values as an object. While I considered creating a new ValueStream
and returning it, I don't like the ambiguity of creating actions on *that* 
ValueStream and wondering what side effect(s) it has on the initial one. 

You can even use filtering to add update hooks to a value stream; filter on one(or multiple)
fields to engage a synchronous side-effect for a value change:

`myStream.filter('name').subscribe(({name}) => {if (!/^[\w]+$/.test(name) myStream.stream.error('bad name})`;

## Setting multiple values at once.

If it weren't so annoyingly asynchronous, React components' setState does have the virtue
of simultaneously updating a set of values at the same time.
I added a `.setState({..})` method to Stores and found it quite handy; however
I don't want people to presume that the behavior and async nature of Reacts's 
setState is delivered here too, so I have added a `.setMany({...})` which 
is exactly the same as setState but (and) is synchronous. 

Also, you can call `myValueStream.set('name', 'Bob', 'age', 10...)` 
which will update a set of children in one fell swoop and like setMany, 
will only broadcast once. 

For single value streams -- which I have not created but you never know --
you will be using the `.value` property to store the ValueStream's value. 
you can get -- and set -- this property directly, though of course the latter
triggers as broadcast. 

Though I don't recommend it, `myValueStream.value = {name: Bob, age: 10}`
has the same behavior as `myStream.setMany({name: Bob, age: 10})`: a multi-value
update that triggers a single broadcast. 

## Stricter control of the field set

You can't randomly add a field to a ValueStream using `.addMany()`, `.set()` or `.value =`. 
These methods are **NOT** meant to expand the schema but to work with the currently defined schema.
The field set is assumed to be fixed and non-extensible through random assignation. 
Adding a set of good and bad properties with these methods will only accept the previously
defined values in the definition, and will emit an error in the other circumstances.

To intentionally expand a ValueStream's schema after the fact, call
`.addChild(name, value)` (or its legacy synonym `addProp` or `.addSubstream(name, ...definition)`;
like addAction, these calls are meant to parametrically define the stream post-construction. 
however they are not meant to **REDEFINE** an existing field which will trigger an error
because it's stupid and wrong. 

Its not advised to separate schema definition from the initial construction of a stream;
that is wrong and ill=advised. However you might find parametrically expanding a ValueStream
with functions a useful pattern. 

note that unlike Redux or LGE 2.x, it is **VERY DIFFICULT** (if not impossible) to simply wipe a value
out of the current state, **OR** to set it to an illegitimate value. 
Type checking is so deeply welded to the field definition/update process that you are insulated from
bad action by the nature of ValueStreams. It *is possible* to have untyped values -- but once
you define the type of a stream, it is nearly impossible to set its value to another type of data. 

## transactions

I have tried and failed several times to model transactions. The difficulty in transactions is that 
they either become blocking (by delaying outside activity til the transaction - action completes)
confusing (by resetting the value of the stream to its previous state, you may be undoing
the healthy activity of other actions) or heavy (creating some sort of change-tracked parallel universe
stream that synchronizes on completion). 

Blocking is often not what you want if you want to enable sub-actions to complete.

Instead, transactions in LGE 3.x limit the number of emitted update broadcasts to one no matter
how many values have changed - they don't block actual updates to value streams.

## Change Observation

New in LGE 3.2, the ValueStreams extend EventEmitter. While you can use this for whatever systems you want
in your app, `set(...)` now triggers 'change:[fieldName]' events that you can listen to. 

You can also hook up actions to fire on specific change broadcasts with `.watch(keyName, actionName)`.
this method links an action to the change of a specific value. change notifier will send action 'actionName'
an object with `{name, value, was}` as in `{name: 'count', value: 2, was: 1}`. 

If you expect an action to be triggered in a transaction that you want to complete,
look at the `whenAfterTransaction(fn)` function or the `awaitAfterTransaction():Promise` function. 

# The API

ValueStream is polymorpic in that you can define it to be a single value observer or an observer of multiple values.
The latter case is the principle use case so it is what this documentation will focus on. 
Its worth noting that multi-value observers' children are maps of single value observers. 

No testing has been done on deeply nested ValueStreams.

## Constructor({name, type, value | children, actions, parent})
## Constructor (name, value? , actions?, type?)

As a side note, setting the value as an object in the constructor will *not* create a map ValueStream;
only setting the children property will do so. 
This also means that the only way to initialize a ValueStream with children in the constructor 
is the first form of the constructor (by passing a parameter).
Otherwise you'll need to define children parametrically, post-construction. 

Also, while you can initialize a ValueStream only in its constructor
you can also call currying functions to extend it post-construction. 

```javascript

const actions = {
    whatYouGoingToDo(v){
        console.log('my value: ', v.state, 'my type', v.type);
   }
}
const badBoy = new ValueStream('Bad Boy', 'bad boy', actions, 'string');
badBoy.do.whatYouGoingToDo();
// 'my value: ', 'bad boy', 'my type', 'string'
badBoy
  .addChild('age', 10)
  .addChild('weight', 300);
badBoy.do.whatYouGoingToDo();
// 'my value: ', {age: 10, weight: 300}, 'my type',  undefined
```

The constructor value, 'bad boy', and its type definition have been obliterated. 

Another example: defining the value in a list of properties defines a single-value ValueStream.
defining children explicitly in the constructor OR post construction will make that ValueStream
a multi-value stream.
 
 ```javascript

const listStream = new ValueStream('list stream', {a: 1, b: 2});
console.log (typeof(listStream.do.setA));
// undefined

const paramValue = new ValueStream({name: 'param value stream', value: {a: 1, b: 2}});
console.log(typeof paramValue.do.setA);
// undefined

// THIS IS THE RIGHT WAY TO ADD CHLILDREN IN THE CONSTRUCTOR
const paramChildren = new ValueStream({name: 'param children stream', children: {a: 1, b: 2}});
console.log(typeof paramChildren.do.setA);
// function

```
So, if you want to have complete control of a ValueStream's value, add properties willy nilly,
and don't care about type validation use name + value patterns. Otherwise (and I hope you do otherwise)
define children specifically as a parameter or via `.addChildren(name, value, type)`. 

# Properties

## Value properties

There are a couple of parallel ways to get/set values of a multi-value stream. Note that 
the `.my` property is the preferred way to get/set individual values.

### my {Object|value}

an object you can use to get/set individual child values. 
On a non-child object my is a read-only alias for value.


```javascript

/**

const s = new ValueStream('withMy')
  .addChild('alpha', 0, 'number')
  .addChild('beta', 0, 'number')
  .addChild('sum', 0, 'number')
  .addAction('updateSum', (stream) => {
    stream.my.sum = stream.my.beta + stream.my.alpha;
  })
  .watch('alpha', 'updateSum')
  .watch('beta', 'updateSum');

console.log(s.my.alpha); 
// 0
console.log(s.my.beta);
// 0
console.log(s.my.sum);
// 0

s.my.beta = 2;

console.log(s.my.beta);
// 2
console.log(s.my.sum);
// 2

**/
```

### value: {various}
### state: (identical)

The value of a single-value ValueStream -- **OR** a map containing name/value pairs of the children.
this effectively clones the `.children property `
note the values of this map will be **value streams**. If you want a hydrated object see `.values` `.asObject` and `.my`.
Setting the value manually `myStream.value = 3` will update a single-value stream's value.
Setting a value of a multi-value with an object or array sets multiple key-values at once (see `.setMany`).
state is added as a legacy property. 

# values: {various}

returns value for single-value ValueStreams, or asObject's value -- children's values hydrated to an object -- 
for multi-value streams. 

### children {Map} 

A collection of name/value properties of a multi-value ValueStream. Useful for iterations, 
`.has(name)` checks etc. *do not* manipulate/set to children directly! it won't broadcast 
changes OR type check values, and deleting value(s)) will F**K you up. 

`.children` may contain a mix of ValueStreams and values.
.asMap` or `.asObject` is a cleaner way to access the values of a ValueStream as they will compress
out any ValueStreams from the return value. 

## asObject: {Object}

The values of the stream as an object. 
Nested ValueStreams return their value, or their `.asObject` property if they have children. 

## asMap: {Map}

The values of the stream as a map. 
Nested ValueStreams return their value, or their `.asMap` property if they have children. 
This is what is returned by the `.subscribeToMap` observable function

# values {Object}

unlike value which essentially clones the children property

## Information/introspection properties

### name: {String}

The name of the ValueStream.

### hasChildren {boolean}
### isValue {boolean}
reflects the storage mode of a ValueStream. Ordinarily only one of these is true. However
if a ValueStream has neither a value (value is undefined) *nor* children both can be false at the same
time. (they will never both be *true* though.)

### type: {string} ?

the type of a single-value ValueStream used to validate updates. It is *optional* but if present
blocks the setting of your ValueStream's value to the wrong type.
Under the hood it uses the `is` module's type checkers to determine validity. 
It has no meaning for multi-value ValueStreams.

### actions {Object}
### do {Object} (identical)
this is a collection of methods you can add to your stream to add functionality. 
*do not* attempt to change/add actions directly to these objects! use `.addAction(...)`.

### isNew {boolean}
### isActive {boolean}
### isComplete {boolean}
These properties reflect the *status* of a ValueStream. 
* A ValueStream that has no value *or* children is "new"; it won't broadcast and is very little fun. 
* A ValueStream that has a value *or* children is "active".
* A streamOfValues that has been completed is "complete"; it shouldn't broadcast or accept changes without 
errors. 

It may be useful to check isActive after an async call in order to terminate mid-action when
the ValueStream may be terminated. 

## Streams

### stream {BehaviorSubject}

This is how the ValueStream broadcasts change. If you want very granular control over updates, or to 
mutate the values before you recieve them, you can `.pipe(..)` from the stream as much as you want.
There is no circumstances in which this stream can/should be updated once created. 

## streamOfValues {BehaviorSubject}
## mapStream {BehaviorSubject}
Streams that return the value(s) of the ValueStream on changes,
not the entire ValueStream (as `stream` does). streamOfValues always returns an object; mapStream emits
a copy of the children map; this also means that mapStream will return any sub-streams intact. 

# Methods 

## Stream methods 

### .subscribe(onNext, onErr, onComplete): subscriber

exactly equivalent to `myValueStream.stream.subsccribe(...)`. Adds event hooks that let you know
when the values have been changed. the event hooks return the *entire* streamOfValues as a value;

### .subscribeToMap(onNext, onErr, onComplete): subscriber
### .subscribeToValue(onNext, onErr, onComplete): subscriber

if you only care about the value(s) of the stream you can subscribe to a limited stream of those. 
.subscribeToMap on a value without children will return a single map `{'value' => value}`.

## .filter(...field names): subscriber

Filter pipes from `.subscribeToValue` and only returns the fields you care about. note that 
it *will filter the results of a single value object*. Changes to un-requested fields shouldn't 
trigger broadcasts. 
Under the hood uses `distinctUntilChanged(_.isEqual)` to only return unique values. 

### complete()

This shuts down the behavior subject and block all value updates; it hasn't been 
thoroughly tested. It sets `.isCompleted` to true. 

## Definition properties

### addAction(name, fn) 
Adds a utility function to the `.do` and `.actions` collection. 
The is wrapped in a hook that sets the first property to the ValueStream itself. 

The return value of actions is ignored -- unless it is a function or promise, 
in which case it is unravelled. (see "Resolving Actions" below)

Because actions don't(shouldn't) use 'this' 
as the important context is passed as the first property,
they can be passed in as React event hooks without any need to bind them. 

```javascript

      const coord = new ValueStream('coord')
        .addChild('x', 0, 'number')
        .addChild('y', 0, 'number')
        .addAction('transform', (v, xT, yT) => {
          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x + xT, 'y', y + yT);
        })
        .addAction('scale', (v, n) => {
          if (!is.number(n)) {
            throw new Error('bad scale value')
          }
          const x = v.get('x');
          const y = v.get('y');
          v.set('x', x * n, 'y', y * n);
        });

      // monitor activity
      const values = [];
      const errors = [];
      const s = coord.subscribeToValue((xy) => {
        console.log(xy);
      });
	  
	  // {x: 0, y: 0}

      coord.do.transform(2, 3);
      // {x: 2, y: 3}

      coord.do.transform(-1, 0);
      // {x: 1, y: 3}
      
      coord.do.scale(2);
      // {x: 2, y: 6}

```

a few things to note:
* `.get(name)` returns the raw value of a child field; even if it is itself a streamOfValues
* `.set(aField, aValue, bField, bValue...)` will only broadcast once. 
* When calling an action you only have to define the parameters - the recipient function will get the stream as the first argument.
  This means you should never (have to) refer to "this" inside an action. 
  
## Mutation methods

### get(fieldName{string}, asValue = true) : {value}

gets a named child. By default extracts the value for a sub-stream.

### set(field{string}, value [,field2, value2...]) <curried>

sets one (or more) child values. uses `.transactionSync` under the hood to broadcast once, no matter
how many children are updated. 

### setMany (values{object}) <curried>

updates the object with 

## has(field {string}) : boolean

tests the children collection for the existence of a field

## Transactional methods

Transactional methods attempt to control the flow of information out of the streams by
muffling all update broadcasts until you have done a series of changes. 

Note that transactional methods *always* broadcast after completion of their input function regardless
of whether any actual changes have been made! 

### async transact(fn{function}) : <curried>

Executes a function asynchronously, then broadcasts when complete.
It will not broadcast *until* the function is completely resolved. 

### transactSync(fn): <curried>

The synchronous version of transact. 

# Resolving Actions

Actions are *optionally asynchronous*. By default they are synchronous - the chidlren's `set[ChildName]'`
occur in real time and will broadcast as soon as they are called (unless inside a `.transact(fn)`). 

Actions can be async, in which case they will resolve all awaited calls inside them before returning. 

If you return a function or a promise, they are *resolved* before the action's return value is emitted. 
That is:

* a function is called, and *it's* return value is resolved; 
* a promise is completed and *it's* return value is resolved. 

Any other return value is *ignored*. Return values no longer are applied to state, as in practice,
actions and other mutational methods are fully adequate ways to change the state of a ValueStream.

You can if you want call a promise INSIDE an action and wait for it using async methods ... OR NOT. 
If for instance you want to push a value to an API and you don't care about getting its feedback
(or at least *waiting* to get it's feedback) you don't need to interrupt flow. 

## Be careful around action flows

You don't have to `await` an action; but if you do not you are accepting the possibility that 
your action stream may resolve asyncronously at an indeterminate point in the future -- or throw errors. 

```javascript

const syncStream = new ValueStream('sync stream')
  .addChild('a', 1)
  .addChild('b', 3)
  .addAction('addAtoB', (store) => {
    const a = store.get('a');
    const b = store.get('b');
    store.do.setB(a + b);
  })
  .addAction('asyncAddAtoB', async (store) => {
    const a = store.get('a');
    const b = store.get('b');
    // because the promise is returned, it WILL be resolved before the
    // return value of the action is resolved.
    return new Promise((done) => setTimeout(done, 300))
      .then(() => {
        store.do.setB(a + b);
      });
  })
  .addAction('asyncDelayedAddAtoBleaky', async (store) => {
    const a = store.get('a');
    const b = store.get('b');
    // note we neither wait for the promise to resolve NOR return the promise
    new Promise((done) => setTimeout(done, 300))
      .then(() => {
        store.do.setB(a + b);
      });
  });

syncTest.same(syncStream.children.get('a'), 1, 'a is 1');
console.log(syncStream.get('b')) 
// 3

syncStream.do.addAtoB();
console.log(syncStream.get('b')) 
// 4

syncStream.do.asyncDelayedAddAtoBleaky();
console.log(syncStream.get('b')) 
// 4
// the promise inside the 'leaky' action is not awaited;
// therefore it will resolve when it wants to, not before the end of the action

await new Promise((done) => setTimeout(done, 500));
console.log(syncStream.get('b')) 
// 5

await syncStream.do.asyncDelayedAddAtoBleaky();
console.log(syncStream.get('b')) 
// 5
await new Promise((done) => setTimeout(done, 500));
// even await-ing an action won't work if the action itself has
// not been designed to wait for its sub-threads to resolve.
console.log(syncStream.get('b')) 
// 6

await syncStream.do.asyncAddAtoB()
// since we are waiting for a non-leaky async, we should get the results
// after the await resolution.
console.log(syncStream.get('b')) 
// 7

````

so take care with async: if you want to know for sure that an async promise has resolved 
by the end of the action, `await` it in the body of the action 
or return the promise as the last line of the action.

And you *must* await the action in the calling context.

# Errors.

A truly irritating fact of life for BehaviorSubjects is that if they ever get an error,
they close. Because they are weak and stupid. As I hate this conceit, the current 
streams are never (and should never be) sent errors. Instead they plough on with next values
til they are closed.

If an action throws an error it is routed straight to the errorStream as a next event. 
While I could insist you subscribe to errors directly, in the interest of expediency, 
I automatically do so when you `.subscribe` to a ValueStream. 

So in fairness: `myValueStream.subscribe(onValue, onErr, onDone)` is **NOT EXACTLY EQUIVALENT**
to `myValueStream.stream.subscribe(onValue, onError, onDone)`. 

rather it amounts to: 

```javascript
myStream = new ValueStream({name: 'a number', value: 0, type: 'number'});
myStream.subscribe((stream) => {console.log('number is:', stream.value)});
myStream.errorStream.subscribe((error) => {console.error('number error:', error)});
```

the same allowance is made with `.subscribeToValue(...)` and `.subscribeToMap(...)`. 
