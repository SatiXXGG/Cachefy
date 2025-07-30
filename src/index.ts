import Net from "@rbxts/net";

interface ICacheInfo<T> {
	value: T;
	timestamp: number;
	lifetime: number;
}

export default class Cachefy<K, V> {
	private events = Net.CreateDefinitions({
		sendKeyUpdate: Net.Definitions.ServerToClientEvent<[key: unknown]>(),
		getValue: Net.Definitions.ServerFunction<(key: unknown) => unknown | undefined>(),
	});
	static cleanup_time = 60;
	private lastCleanup = tick();
	private cached = new Map<K, ICacheInfo<V>>();
	private middleware = new Set<(player: Player, key: K) => boolean>();
	public send: ((data: V) => buffer) | undefined = undefined;
	public receive: ((data: buffer) => V) | undefined = undefined;
	private isValid(timestamp: number, lifetime: number) {
		return tick() - timestamp < lifetime;
	}

	private updateCallbacks = new Map<K, Set<() => void>>();
	private globalUpdates = new Set<(key: K) => void>();
	/**
	 * Sets a value to the cache
	 * @param key
	 * @param value
	 */

	onKeyUpdate(key: K, callback: () => void) {
		const callbacks = this.updateCallbacks.get(key);
		if (callbacks) {
			callbacks.add(callback);
		}
	}

	onUpdate(callback: (key: K) => void) {
		this.globalUpdates.add(callback);
	}

	addMiddleware(callback: (player: Player, key: K) => boolean) {
		this.middleware.add(callback);
	}

	set(key: K, value: V, lifetime: number = math.huge) {
		if (tick() - this.lastCleanup > Cachefy.cleanup_time) {
			this.lastCleanup = tick();
			this.cached.forEach((value, key) => {
				if (!this.isValid(value.timestamp, value.lifetime)) {
					this.cached.delete(key);
				}
			});
		}

		//Checks difference
		const old = this.cached.get(key);
		if (this.updateCallbacks.has(key)) {
			const callbacks = this.updateCallbacks.get(key);
			if (callbacks) {
				for (const callback of callbacks) {
					task.spawn(() => callback());
				}
			}
		} else {
			this.updateCallbacks.set(key, new Set());
		}

		this.globalUpdates.forEach((callback) => {
			task.spawn(() => callback(key));
		});

		this.cached.set(key, {
			value,
			timestamp: tick(),
			lifetime: lifetime,
		});
	}
	/**
	 * Gets the given key
	 * @param key
	 */

	get(key: K, onUndefined?: () => V | undefined) {
		const gotKey = this.cached.get(key);
		if (gotKey) {
			const isValid = this.isValid(gotKey.timestamp, gotKey.lifetime);
			if (isValid) {
				return gotKey.value;
			} else {
				this.cached.delete(key);
				if (onUndefined) {
					const value = onUndefined();
					if (value !== undefined) this.set(key, value);
					return value;
				}
			}
		} else {
			if (onUndefined) {
				const value = onUndefined();
				if (value !== undefined) this.set(key, value);
				return value;
			}
		}
	}

	clearKey(key: K) {
		this.cached.delete(key);
	}
	clear() {
		this.cached.clear();
	}
	allowReplication() {
		if (game.GetService("RunService").IsServer()) {
			this.onUpdate((key) => {
				const got = this.cached.get(key);
				if (got) {
					const players = game.GetService("Players").GetPlayers();
					players.forEach((player) => {
						let failed = false;
						this.middleware.forEach((callback) => {
							if (!failed) {
								const result = callback(player, key);
								if (!result) {
									failed = true;
									return;
								}
							}
						});

						if (!failed) {
							this.events.Server.Get("sendKeyUpdate").SendToPlayer(player, key);
						}
					});
				}
			});

			this.events.Server.Get("getValue").SetCallback((player: Player, key) => {
				const got = this.cached.get(key as K);
				if (got) {
					const isValid = this.isValid(got.timestamp, got.lifetime);
					if (isValid) {
						if (this.send) {
							return this.send(got.value);
						}
						return got.value;
					} else {
						this.cached.delete(key as K);
					}
				}
			});
		} else {
			this.events.Client.Get("sendKeyUpdate").Connect((key) => {
				let failed = false;
				this.middleware.forEach((callback) => {
					if (!failed) {
						const result = callback(game.GetService("Players").LocalPlayer, key as K);
						if (!result) {
							failed = true;
							return;
						}
					}
				});
				if (!failed) {
					this.events.Client.Get("getValue")
						.CallServerAsync(key)
						.then((value) => {
							if (value !== undefined) {
								if (this.receive) {
									this.set(key as K, this.receive(value as buffer) as V);
									return;
								}
								this.set(key as K, value as V);
							}
						});
				}
			});
		}
	}
	/**
	 * gets the key K, if called from client it will grab the key from the server
	 * @param key
	 */
	grab(key: K) {
		return this.events.Client.Get("getValue").CallServerAsync(key) as V;
	}
}
