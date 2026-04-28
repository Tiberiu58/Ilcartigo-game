import { MESSAGE_TYPES, parseMessage, serializeMessage } from "../shared/protocol.js"

export class NetworkClient {
  constructor(url) {
    this.url = url
    this.socket = null
    this.onMessage = null
    this.onOpen = null
    this.onClose = null
    this.onError = null
  }

  connect() {
    if (!this.url) {
      return Promise.reject(new Error("Multiplayer server URL is not configured."))
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      let socket
      try {
        socket = new WebSocket(this.url)
      } catch (error) {
        reject(error)
        return
      }

      this.socket = socket

      socket.addEventListener("open", () => {
        this.send(MESSAGE_TYPES.HELLO, { client: "browser" })
        if (typeof this.onOpen === "function") {
          this.onOpen()
        }
        resolve()
      })

      socket.addEventListener("message", (event) => {
        const message = parseMessage(event.data)
        if (message && typeof this.onMessage === "function") {
          this.onMessage(message)
        }
      })

      socket.addEventListener("close", () => {
        if (typeof this.onClose === "function") {
          this.onClose()
        }
      })

      socket.addEventListener("error", (error) => {
        if (typeof this.onError === "function") {
          this.onError(error)
        }
        reject(error)
      })
    })
  }

  disconnect() {
    if (!this.socket) {
      return
    }

    this.socket.close()
    this.socket = null
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(serializeMessage(type, payload))
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN
  }
}
