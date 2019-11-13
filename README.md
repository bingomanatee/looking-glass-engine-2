# looking-glass-engine (LGE) 3.0 - the ValueStream release

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]
[![Coveralls][coveralls-badge]][coveralls]


The 3.0 Looking Glass Engine (LGE) release contains ValueStreams, which will ultimately replace Stores.
Value streams are recursive notes that stream values from either 
a single value field, OR a map of children that can in turn be ValueStreams
or general values. 

The significant feature of ValueStreams is that they can be *filtered*;
you can call `.filter(...field names)` to receive a stream of sub-values
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

.subscribing to a ValueStream returns the entire ValueStream every time one(or more)
of its values are changed. I say "one or more"

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

**IN NO CIRCUMSTANCE** do any of these methods or actions cauterize the fields that they don't include ...

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

## My continued failure: transactions

I have tried and failed several times to model transactions. The difficulty in transactions is that 
they either become blocking (by delaying outside activity til the transaction - action completes)
confusing (by resetting the value of the stream to its previous state, you may be undoing
the healthy activity of other actions) or heavy (creating some sort of change-tracked parallel universe
stream that synchronizes on completion). so while there are transaction options in the API I would emphasize
*use with caution* -- they are intended only to manage *synchronous* actions in which you have full control 
of all the state and undoing back to zero is a healthy option for an error-throwing action. 

# The API

ValueStream is polymorpic in that you can define it to be a single value observer or a value map observer.
The latter case is the principle use case so it is what this documentation will focus on. 

## Constructor({name, type, value | children, actions, parent})
## Constructor (name, value, actions, type)

The first form of the constructor is preferred. 

As a side note, setting the value as an object in the constructor will *not* create a map ValueStream;
only setting the children property will do so. This also means that the only way to initialize a
map valueStream with children in the constructor is the first form of the constructor (by passing a parameter).
Otherwise you'll need to define children parametrically, post-construction. 

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

note the constructor value, 'bad boy', and its type definition have been obliterated. 
that is bad magic. best to simply construct `const badBoy = new ValueStream('Bad Boy')`,
which never implies single-valuenesss. 

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

const paramChildren = new ValueStream({name: 'param children stream', children: {a: 1, b: 2}});
console.log(typeof paramChildren.do.setA);
// function

```
So, if you want to have complete control of a ValueStream's value, add properties willy nilly,
and don't care about type validation use name + value patterns. Otherwise (and I hope you do otherwise)
define children specifically as a parameter or via `.addChildren(name, value, type)`. 

## Properties

### name: {String}

the name of the ValueStream.

### value: {various}
### state (identical)

the value of a single-value ValueStream -- **OR** a hydrated object 
containing name/value pairs of the children.
Setting the value manually `myStream.value = 3` will update its value 
*and* broadcast an update(see below);)
If you want to be cautious, use `.isValid(aValue)` 
to check the validity of a value before assigning it to value. 

state is added as a legacy property. 

### type: {string} ?

the type of a single-value ValueStream used to validate updates. It is *optional* but if present
blocks the setting of your ValueStream's value to the wrong type.
Under the hood it uses the `is` module's type checkers to determine validity. 
It has no meaning for multi-value ValueStreams.

### actions {Object}
### do {Object} (identical)
this is a collection of methods you can add to your stream to add functionality. 
*do not* attempt to change/add actions directly to these objects! use `.addAction(...)`.

### children {Map} 

A collection of name/value properties of a multi-value ValueStream. Useful for iterations, 
`.has(name)` checks etc. *do not* manipulate/set to children directly! it won't broadcast 
changes OR type check values, and deleting value(s)) will F**K you up. 

### hasChildren {boolean}
### isValue {boolean}
reflects the storage mode of a ValueStream. Ordinarily only one of these is true. However
if a ValueStream has neither a value (value is undefined) *nor* children both can be false at the same
time. (they will never both be *true* though.)

### isNew {boolean}
### isActive {boolean}
### isComplete {boolean}
These properties reflect the *status* of a ValueStream. 
* A ValueStream that has no value *or* children is "new"; it won't broadcast and is very little fun. 
* A ValueStream that has a value *or* children is "active".
* A valueStream that has been completed is "complete"; it shouldn't broadcast or accept changes without 
errors. 

### stream {BehaviorSubject}
This is how the ValueStream broadcasts change. If you want very granular control over updates, or to 
mutate the values before you recieve them, you can `.pipe(..)` from the stream as much as you want.
There is no circumstances in which this stream can/should be updated once created. 

## valueStream {BehaviorSubject}
## mapStream {BehaivorSubject}
Special lazily-instantiated streams that return the value(s) of the ValueStream on changes,
not the entire ValueStream (as stream does). valueStream always returns an object; mapStream emits
a copy of the children map; this also means that mapStream will return any sub-streams intact. 

## methods 

### .subscribe(onNext, onErr, onComplete): subscriber

exactly equivalent to `myValueStream.stream.subsccribe(...)`. Adds event hooks that let you know
when the values have been changed. the event hooks return the *entire* valueStream as a value;

### .subscribeToMap(onNext, onErr, onComplete): subscriber
### .subscribeToValue(onNext, onErr, onComplete): subscriber

if you only care about the value(s) of the stream you can subscribe to a limited stream of those. 
.subscribeToMap on a value without children will return a single map `{'value' => value}`.

## .filter(...field names): subscriber

Filter pipes from `.subscribeToValue` and only returns the fields you care about. note that 
it *will filter the results of a single value object*. Changes to un-requested fields shouldn't 
trigger broadcasts. 

## complete()

This should shut down the behavior subject and block all value updates; it hasn't been 
thoroughly tested. 

## addAction(name, fn) 
Adds a utility function to the `.do` and `.actions` collection. Note, it is wrapped in a hook
that sets the first property to the ValueStream itself. 

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
* `.get(name)` returns the raw value of a child field; even if it is itself a valueStream
* `.set(aField, aValue, bField, bValue...)` will only broadcast once. 
* When calling an action you only have to define the parameters - the recipient function will get the stream as the first argument.
  This means you should never (have to) refer to "this" inside an action. 
  
### get(fieldName{string}, asValue = true) : {value}

gets a named child. By default extracts the value for a sub-stream.

### set(field{string}, value [,field2, value2...]) <curried>

sets one (or more) child values. 

### setMany (values{object}) <curried>

updates the object with 

## has(field {string}) : boolean

tests the children collection for the existence of a field

### async transact(fn{function}) : <curried>

executes a function asyncronously, then broadcasts when complete. it will not broadcast *until* the function 
is completely resolved. 

### transactSync(fn): <curried>

the synchronous version of transact. 

