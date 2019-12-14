## 2.0.0

First reboot of LGE; entirely new codebase
* no "start" functions; too tangled and confusing
* using Rollup over Neutrino
* note - transactions not operating yet

## 2.0.1

* fixed some stream issues
* fixed issue with action naming

## 2.0.4

* Added transactional locking

## 2.0.6

* Removed annoying console logs

## 2.0.7

* d'oh! was using the wrong comparator library; replacing is with `is_js`

## 2.1.0

Introducing ValueStreams, a recursive design for nested states
as an eventual replacement for store. 

## 3.0.1 

replacing Store with ValueStream to put more control over child values.
Allowing filtered streaming to reduce broadcasts for a subset of properties

## 3.0.2

Better error handling. Avoid sending errors out of '.stream'; instead,
create separate error subject.

## 3.0.3

Adding events; ValueStream now extends EventEmitter. changes emit change:[field]
events, which can be linked to actions or independent functions

## 3.0.4, 3.0.5 
Added a shorthand `.my` proxy property for setting/getting values. 
changing the signature of watcher from `oldValue` to `was`
