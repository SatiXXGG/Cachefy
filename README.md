
# Cachefy
Cachefy is a tool that provides an advanced cache that auto-cleanups every-time you want and also replicates if you need it, useful for user in-server global interactions sync so it seems like it is live while it isn't

change the cache while saving to the data store every certain time!

```typescript
const cache = new Cachefy<KeyType, ValueType>()
cache.set(key: K, value: V, lifetime: number) //life time in seconds
cache.get(key: K, () => V | undefined)
cache.onUpdate(callback: (key: K) => undefined)
cache.onKeyUpdate(callback: () => undefined)
cache.receive = (buffer: buffer) => V // used to read the data
cache.send = (value: V) => buffer
cache.clearKey(key: K)
cache.clear()
cache.allowReplication() // allows the replication server-client
cache.grab(k: K) // sends a request to the server to get the key

Cachefy.cleanup_time // the time for the cache to clear the unused keys
```
