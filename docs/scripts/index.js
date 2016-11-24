(function main() {
  if (typeof io !== "undefined") {
    var socket = io.connect()
    socket.io.reconnection(false)
  }

  new Vue({
    el: "#wrap",
    data: {
      connected: false
    },
    methods: {
      reconnect: function () {
        if (socket) {
          socket.io.connect()
          console.log("Reconnecting...")
        }
      }
    },
    mounted: function () {
      var vm = this
      socket.on("connect", function () {
        vm.connected = true
      })
      socket.on("connect_error", function () {
        vm.connected = false
        console.log("Failed to connect to server.")
      })
    }
  })
})()
