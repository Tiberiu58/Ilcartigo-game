import { MULTIPLAYER_CONFIG } from "../config.js"

const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"])

export function getMultiplayerServerUrl() {
  const explicitUrl = getExplicitServerUrl()
  if (explicitUrl) {
    return explicitUrl
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  const host = window.location.hostname || "127.0.0.1"

  if (LOCAL_HOSTS.has(host)) {
    return `${protocol}://${host || "127.0.0.1"}:${MULTIPLAYER_CONFIG.serverPort}`
  }

  // Public static hosts cannot run the Node server. Configure public-config.js
  // with the Render wss:// URL once the backend deploy is live.
  return ""
}

function getExplicitServerUrl() {
  const queryUrl = new URLSearchParams(window.location.search).get("ws")
  const configuredUrl = window.FACILITY_ZERO_WS_URL
  const storedUrl = window.localStorage?.getItem("facilityZeroWsUrl")

  return normalizeWebSocketUrl(queryUrl)
    || normalizeWebSocketUrl(configuredUrl)
    || normalizeWebSocketUrl(storedUrl)
}

function normalizeWebSocketUrl(value) {
  const url = String(value || "").trim()
  if (!url) {
    return ""
  }

  if (url.startsWith("wss://") || url.startsWith("ws://")) {
    return url
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`
  }

  return ""
}
