const _events = new WeakMap()

export default class EventTarget {
  constructor() {
    _events.set(this, {})
  }

  addEventListener(type, listener, options = {}) {
    let events = _events.get(this)

    if (!events) {
      events = {}
      _events.set(this, events)
    }
    if (!events[type]) {
      events[type] = []
    }
    events[type].push(listener)

    if (options.capture) {
      console.warn('EventTarget.addEventListener: options.capture is not implemented.')
    }
    if (options.once) {
      console.warn('EventTarget.addEventListener: options.once is not implemented.')
    }
    if (options.passive) {
      console.warn('EventTarget.addEventListener: options.passive is not implemented.')
    }
  }

  removeEventListener(type, listener, options = {}) {
    const events = _events.get(this)

    if (events) {
      const listeners = events[type]

      if (listeners && listeners.length > 0) {
        for (let i = listeners.length - 1; i >= 0; i--) {
          if (listeners[i] === listener) {
            listeners.splice(i, 1)
            break
          }
        }
      }
    }
  }

  dispatchEvent(event = {}) {
    const listeners = _events.get(this)[event.type]

    if (listeners) {
      // DOM 规范：监听器调用时 this 指向 currentTarget（如 FileLoader 的
      // load 回调读 this.status/this.response），裸调用会丢失绑定
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].call(this, event)
      }
    }
  }
}
