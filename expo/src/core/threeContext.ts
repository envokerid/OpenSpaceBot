/**
 * Expo SDK 57's WebGL2 prototype inherits WebGLRenderingContext. Three r186
 * rejects any instanceof WebGLRenderingContext as WebGL1, even this GL2
 * context. Present a prototype-free facade while binding all native methods
 * to their original receiver. Do not mutate global constructors or the GLView.
 */
export function threeContext<T extends object>(gl: T): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(Object.create(null) as T, {
    get(_target, key) {
      const value = Reflect.get(gl, key);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, value.bind(gl));
      return methods.get(key);
    },
    set(_target, key, value) { return Reflect.set(gl, key, value); },
    has(_target, key) { return Reflect.has(gl, key); },
  });
}
