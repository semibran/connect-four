const express = require("express")
const app     = express()
const server  = require("http").Server(app)
const io      = require("socket.io")(server)
const path    = require("path")
const getHash = require("./get-hash")()
const src     = "docs"
const PORT    = 8080

app.use(express.static(path.join(__dirname, src)))
app.get("/", (req, res) => {
  res.send(__dirname + src + "/index.html")
})

function getState() {
  return {}
}

var users = {}
var hashes = []
io.on("connection", (socket) => {
  // var index = hashes.length
  // var hash = getHash(hashes)
  // var user = {}
  // users[hash] = user
  // socket.broadcast.emit("join", user)
  // socket.emit("state", getState())
  socket.on("disconnect", () => {
    // socket.broadcast.emit("leave", hash)
    // delete users[hash]
    // hashes.splice(index, 1)
    console.log(`- ${socket.id}`)
  })
  console.log(`+ ${socket.id}`)
})

server.listen(PORT, () => {
  console.log(`Server started at localhost:${PORT}`)
})
