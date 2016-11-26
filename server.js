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

function getState(me) {
  var state = []
  for (var hash in users) {
    var user = users[hash]
    var data = {
      name: user.name,
      hash: hash
    }
    if (hash === me) {
      state.unshift(data)
    } else {
      state.push(data)
    }
  }
  return state
}

var users = {}
var hashes = []
var matches = []
var matchmakingQueue = []
io.on("connection", (socket) => {
  var index = hashes.length
  var hash = getHash(hashes)
  var user = {
    name: "guest",
    hash: hash,
    socket: socket,
    match: null,
    connected: true,
    played: 0,
    wins: 0,
    losses: 0
  }
  users[hash] = user
  socket.broadcast.emit("join", hash)
  socket.emit("state", getState(hash))
  socket.on("queue", () => {
    if (!user.match) {
      matchmakingQueue.push(user)
    }
    while (matchmakingQueue.length >= 2) {
      var a = matchmakingQueue.shift()
      var b = matchmakingQueue.shift()
      var matchName = "match-" + matches.length
      var match = {
        name: matchName,
        players: [a, b],
        moves: [],
        turn: 0,
        ended: false
      }
      var playerData = [
        {
          name: a.name,
          hash: a.hash
        },
        {
          name: b.name,
          hash: b.hash
        }
      ]
      a.socket.emit("match", playerData)
      b.socket.emit("match", playerData)
      a.socket.join(matchName)
      b.socket.join(matchName)
      a.match = match
      b.match = match
      matches.push(match)
    }
  })
  function unqueue() {
    (index = matchmakingQueue.indexOf(user)) !== -1 && matchmakingQueue.splice(user, 1)
  }
  socket.on("unqueue", unqueue)
  function forfeit() {
    var match = user.match
    if (match) {
      console.log(`! ${user.hash} forfeited the match.`)
      var players = match.players
      var player, i = players.length
      while (i--) {
        player = players[i]
        if (player !== user) {
          player.socket.emit("forfeit")
          player.socket.leave(match.name)
          player.match = null
        }
      }
      (index = matches.indexOf(match)) !== -1 && matches.splice(match, 1)
      user.socket.leave(match.name)
      user.match = null
    }
  }
  socket.on("forfeit", forfeit)
  socket.on("move", (col) => {
    var match = user.match
    if (match) {
      var turn = match.turn
      var currentUser = match.players[turn]
      if (user === currentUser) {
        if (col >= 0 && col < 7) {
          console.log("! Received input " + col + " from user " + hash + " (Player " + (turn + 1) + ").")
          match.moves.push(col)
          io.to(match.name).emit("move", col)
          match.turn = turn = !turn + 0
        } else {
          console.log("Move " + col + " is invalid.")
        }
      } else {
        console.log("It's not your turn!")
      }
    } else {
      console.log("Not currently in a match.")
    }
  })
  socket.on("rematch-request", () => {
    var match = user.match
    if (match) {
      var a = match.players[0]
      var b = match.players[1]
      var other = a !== user ? a : b !== user ? b : null
      other.socket.emit("rematch-request")
    } else {
      console.log("Rematch request lacks a recipient.")
    }
  })
  socket.on("rematch-response", (response) => {
    var match = user.match
    if (match) {
      var a = match.players[0]
      var b = match.players[1]
      var other = a !== user ? a : b !== user ? b : null
      other.socket.emit("rematch-response", response)
    } else {
      console.log("Rematch response lacks a recipient.")
    }
  })
  socket.on("user-request", (hash) => {
    var user = users[hash]
    var response = !user ? null : {
      name:   user.name,
      hash:   user.hash,
      played: user.played,
      wins:   user.wins,
      losses: user.losses,
    }
    socket.emit("user-response", response)
  })
  socket.on("disconnect", () => {
    unqueue()
    forfeit()
    socket.broadcast.emit("leave", hash)
    var user = users[hash]
    user.connected = false
    ;(index = matchmakingQueue.indexOf(user)) !== -1 && matchmakingQueue.splice(user, 1)
    delete users[hash]
    hashes.splice(index, 1)
    console.log(`- ${socket.id} left.`)
  })
  console.log(`+ ${socket.id} joined as ${user.name}#${user.hash}.`)
})

server.listen(PORT, () => {
  console.log(`Server started at localhost:${PORT}`)
})
