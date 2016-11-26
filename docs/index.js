(function main() {
  if (typeof io !== "undefined") {
    var socket = io.connect();
    socket.io.reconnection(false);
  }

  var vm = new Vue({
    el: "#wrap",
    data: {
      state: [],
      users: [],
      modals: [],
      hash: "0000",
      turn: 0,
      players: [
        {
          name: "guest",
          hash: "0000"
        },
        {
          name: "VICTOR",
          hash: "CPU0"
        },
      ],
      animating: false,
      winner: null,
      match: null,
      matching: [],
      ended: false,
      connected: false,
      queueing: false,
      requestPending: false,
      requestDenied: false,
      opponentDisconnected: false,
      online: false,
      buttons: [
        {
          id:   "ai",
          text: "Vs. Computer",
          icon: "desktop_windows"
        },
        {
          id:   "local",
          text: "Vs. Friend",
          icon: "people"
        },
        {
          id:   "online",
          text: "Online Play",
          icon: "public"
        },
      ],
      index: 0,
      lastMove: null,
    },
    computed: {
      // turn: function () {
      //   return this.state.length % 2
      // },
      waiting: function () {
        return this.animating || !this.isMyTurn() || this.ended
      },
      inProgress: function () {
        return !!this.state.length
      },
      canRequest: function () {
        return this.online && this.ended && !this.requestPending && !this.requestDenied && !this.opponentDisconnected
      },
      canReset: function () {
        return !this.online && this.state.length || this.canRequest
      },
      modal: function () {
        return this.modals[0] || null
      },
      board: function () {
        var board = [];
        for (var i = 0; i < 7; i++) {
          var column = [];
          for (var j = 0; j < 6; j++) {
            column.push(null);
          }
          board.push(column);
        }
        var move, lastMove, imax = this.state.length, i = 0;
        while (i < imax) {
          move = this.state[i];
          column = board[move];
          var square, j = column.length;
          while (j--) {
            square = column[j];
            if (square === null) {
              var type = i % 2;
              column[j] = type;
              lastMove = [move, j];
              break
            }
          }
          i++;
        }
        this.lastMove = lastMove;
        return board
      }
    },
    methods: {
      requestUser: function (hash) {
        if (hash !== "0000" && hash !== "2" && hash.indexOf("CPU") === -1) {
          socket.emit("user-request", hash);
        }
      },
      isMyTurn: function () {
        var hash = this.players[this.turn].hash;
        return hash === this.hash || hash === "2"
      },
      resetBoard: function () {
        vm.state = [];
        vm.ended = false;
        vm.winner = null;
        vm.matching = [];
        vm.animating = false;
        vm.turn = -1; // Dirty reflush hack ._.
        vm.turn = 0;
        var hash = this.players[this.turn].hash;
      },
      fall: function (el, done) {
        vm.animating = true;
        for (var i = 6, current = el; (current = current.nextSibling); i--);
        var y = (i * -100);
        var v = 0;
        var g = 1.25;
        var e = 0.4;
        var b = 0;
        var m = 3;
        var s = 0;(function loop() {
          if (s < 1) {
            s += 0.15;
          } else {
            s = 1;
            v += g;
            y += v;
            if (y > 0) {
              v *= -e;
              y = 0;
              b++;
            }
          }
          el.style.transform = "translateY(" + y + "%) scale(" + s + ")";
          if (b < m) {
            requestAnimationFrame(loop);
          } else {
            el.style.transform = null;
            vm.animating = false;
            vm.endTurn();
            done();
          }
        })();
      },
      isWithinBoard: function (pos) {
        var x = pos[0];
        var y = pos[1];
        return x >= 0 && x < 7 && y >= 0 && y < 6
      },
      getNeighbor: function (origin, direction, step) {
        step = typeof step === "undefined" ? 1 : step;
        return [origin[0] + direction[0] * step, origin[1] + direction[1] * step]
      },
      checkMatches: function (origin, type, board) {
        board = board || vm.board;
        var type = typeof type === "undefined" ? board[origin[0]][origin[1]] : type;
        if (type === null) return null
        var matches = [];
        var axes = [
          [-1,-1],
          [ 0,-1],
          [ 1,-1],
          [-1, 0]
        ];
        var axis, i = axes.length;
        var match, matchLength;
        var stack, step;
        var current, currentIndex, currentType;
        while (i--) {
          axis = axes[i];
          match = [origin];
          matchLength = 4;
          stack = [-1, 1];
          while (stack.length) {
            step    = stack.shift();
            current = vm.getNeighbor(origin, axis, step);
            if (vm.isWithinBoard(current)) {
              currentType  = board[current[0]][current[1]];
              if (currentType === type) {
                stack.push(step + Math.abs(step) / step);
                match.push(current);
              }
            }
          }
          if (match.length >= matchLength) {
            matches.push(match);
          }
        }
        return !matches.length ? null : {
          type:    type,
          matches: matches
        }
      },
      isFilled: function () {
        return vm.state.length === 42
      },
      isColumnFilled: function (col) {
        var column = vm.board[col];
        return column[0] !== null
      },
      getPieceDepth: function (col) {
        var column = vm.board[col];
        var i = column.length;
        while (i--) {
          if (column[i] === null) {
            return i
          }
        }
        return null
      },
      getBestMove: (function() {
        function getMoveScore(move, turn) {
          var wins, blocks, setups, target = move.target;
          wins = vm.checkMatches(target, turn);
          if (wins) {
            return 2
          }
          blocks = vm.checkMatches(target, !turn + 0);
          if (blocks) {
            return 1
          }
          setups = vm.checkMatches([target[0], target[1] - 1], !turn + 0);
          if (setups) {
            return 0
          }
          return Math.random() // 1 - Math.abs(Game.center - move.column) / Game.center - Math.random() / 10
        }
        function getMove(col, turn) {
          var move = {
            column: col,
            target: [col, vm.getPieceDepth(col)]
          };
          // move.board = (function() {
          //   board[posToIndex(move.target, Game.size)] = turn
          //   return board
          // }())
          move.score = getMoveScore(move, turn);
          return move
        }
        return function(turn, board) {
          turn = turn || vm.turn;
          board = [].slice(board || vm.board);
          var bestMove;
          var moves = [];
          var col = 7;
          if (vm.isFilled()) {
            return null
          }
          while (col--) {
            if (!vm.isColumnFilled(col)) {
              moves.push(getMove(col, turn));
            }
          }
          if (!moves.length) {
            return null
          }
          moves.sort(function(a, b) {
            return b.score - a.score
          });
          bestMove = moves.shift();
          return bestMove.column
        }
      })(),
      requestRematch: function () {
        if (vm.online && !vm.requestPending) {
          socket.emit("rematch-request");
          vm.requestPending = true;
        } else {
          vm.resetBoard();
        }
      },
      endGame: function (data) {
        if (data) {
          var winner = data.type;
          var player = vm.players[winner];
          vm.matching = [];
          var i = data.matches.length;
          while (i--) {
            var match = data.matches[i];
            var j = match.length;
            while (j--) {
              var tile = match[j];
              vm.matching.push(tile.toString());
            }
          }
          vm.winner = winner;
        } else {
          vm.winner = null;
        }
        vm.ended = true;
      },
      endTurn: function () {
        vm.turn = vm.state.length % 2;              // Update turn (can be 0 or 1).
        var matches = vm.checkMatches(vm.lastMove); // Check for matches.
        if (matches) {                             // If a match is found,
          vm.endGame(matches);                      // End the game.
          return
        } else if (vm.isFilled()) {
          vm.endGame();
          return
        }
        if (vm.players[vm.turn].hash.indexOf("CPU") !== -1) { // If the new player is a bot,
          var col = vm.getBestMove();                 // Choose a random column
          vm.dropPiece(col);                          // to drop a piece.
        }
      },
      dropPiece: function (col) {
        if (col >= 0 && col < 7 && !vm.isColumnFilled(col)) {
          if (!vm.online) {
            vm.state.push(col);
          } else {
            socket.emit("move", col);
          }
        }
      },
      openModal: function (modalData) {
        vm.modals.push(modalData);
      },
      closeModal: function () {
        return vm.modals.shift()
      },
      reset: function () {
        var modal;
        if (!vm.ended) {
          modal = {
            title: "Game in progress!",
            icon: "warning",
            text: "Are you sure you want to reset the board? All progress made during this game will be lost.",
            buttons: [
              {
                text: "Reset",
                flag: "danger",
                onclick: vm.resetBoard
              },
              {
                text: "No thanks"
              }
            ],
            onclose: function () {}
          };
        } else {
          modal = {
            title: "Rematch?",
            icon: "replay",
            text: "Ready for a rematch?",
            buttons: [
              {
                text: "Rematch",
                flag: "emphasis",
                onclick: vm.requestRematch
              },
              {
                text: "No thanks"
              }
            ],
            onclose: function () {}
          };
        }
        vm.openModal(modal);
      },
      reconnect: function () {
        if (socket) {
          socket.io.connect();
        }
      },
      queue: function () {
        if (socket) {
          vm.match = null;
          vm.queueing = true;
          socket.emit("queue");
        }
      },
      unqueue: function () {
        socket.emit("unqueue");
        vm.queueing = false;
        vm.index = 0;
      },
      setIndex: function (newIndex) {
        var button = vm.buttons[newIndex];
        var oldIndex = vm.index;
        function reset() {
          vm.index = oldIndex;
        }
        if (button) {
          if (button.id === "online") {
            if (vm.connected) {
              vm.index = newIndex;
              vm.openModal({
                title: "Play online?",
                icon: "public",
                showUsers: true,
                text: "Ready to play a quick online match? You'll be able to play against a live human opponent in realtime.",
                buttons: [
                  {
                    text: "Queue",
                    flag: "emphasis",
                    onclick: vm.queue
                  },
                  {
                    text: "Not yet",
                    onclick: reset
                  }
                ],
                onclose: reset
              });
            }
          } else if (!vm.queueing) {
            vm.index = newIndex;
            if (vm.online) {
              vm.openModal({
                title: "Disconnect?",
                icon: "warning",
                text: "You are currently playing online. If you switch to offline mode now, you will automatically disconnect and forfeit the match.",
                buttons: [
                  {
                    text: "Forfeit",
                    flag: "danger",
                    onclick: function () {
                      vm.online = false;
                      vm.resetBoard();
                      socket.emit("forfeit");
                    }
                  },
                  {
                    text: "Never mind",
                    onclick: reset
                  }
                ],
                onclose: reset
              });
            } else {
              if (newIndex === 0) {
                function change() {
                  vm.players[1] = {
                    name: "VICTOR",
                    hash: "CPU0"
                  };
                  vm.resetBoard();
                }
                if (vm.inProgress) {
                  vm.openModal({
                    title: "Switch modes?",
                    icon: "warning",
                    text: "The board will be reset.",
                    buttons: [
                      {
                        text: "OK",
                        flag: "emphasis",
                        onclick: change
                      },
                      {
                        text: "Never mind",
                        onclick: reset
                      }
                    ],
                    onclose: reset
                  });
                } else {
                  change();
                }
              }
              if (newIndex === 1) {
                function change() {
                  vm.players[1] = {
                    name: "PLAYER",
                    hash: "2"
                  };
                  vm.resetBoard();
                }
                if (vm.inProgress) {
                  vm.openModal({
                    title: "Switch modes?",
                    icon: "warning",
                    text: "The board will be reset.",
                    buttons: [
                      {
                        text: "OK",
                        flag: "emphasis",
                        onclick: change
                      },
                      {
                        text: "Never mind",
                        onclick: reset
                      }
                    ],
                    onclose: reset
                  });
                } else {
                  change();
                }
              }
            }
          }
        }
      }
    },
    mounted: function () {
      socket.on("connect", function () {
        vm.connected = true;
      });
      socket.on("connect_error", function () {
        vm.connected = false;
        console.log("Failed to connect to server.");
      });
      socket.on("match", function (match) {
        var a = match[0];
        var b = match[1];
        vm.players[0].name = a.name;
        vm.players[0].hash = a.hash;
        vm.players[1].name = b.name;
        vm.players[1].hash = b.hash;
        vm.queueing = false;
        vm.online = true;
        vm.requestPending = false;
        vm.requestDenied = false;
        vm.opponentDisconnected = false;
        vm.resetBoard();
        if (vm.modals.length) {
          vm.closeModal();
        }
      });
      socket.on("forfeit", function () {
        vm.opponentDisconnected = true;
        vm.openModal({
          title: "Yikes!",
          icon: "sentiment_very_dissatisfied",
          text: "Your opponent disconnected. Would you like to queue for another match?",
          priority: true,
          buttons: [
            {
              text: "Sure",
              flag: "emphasis",
              onclick: vm.queue
            },
            {
              text: "No thanks",
              onclick: function () {
                vm.resetBoard();
                vm.index = 0;
              }
            }
          ],
          onclose: function () {}
        });
      });
      socket.on("rematch-request", function () {
        function accept() {
          socket.emit("rematch-response", true);
          vm.resetBoard();
        }
        function decline() {
          socket.emit("rematch-response", false);
        }
        vm.openModal({
          title: "Attention!",
          icon: "warning",
          text: "Your opponent has requested a rematch.",
          priority: true,
          buttons: [
            {
              text: "Accept",
              flag: "emphasis",
              onclick: accept
            },
            {
              text: "Decline",
              flag: "danger",
              onclick: decline
            }
          ]
        });
      });
      socket.on("rematch-response", function (response) {
        vm.requestPending = false;
        if (!response) {
          vm.requestDenied = true;
          vm.openModal({
            title: "Oops.",
            icon: "sentiment_dissatisfied",
            text: "Your request for a rematch was declined. Would you like to queue for another match?",
            priority: true,
            buttons: [
              {
                text: "Sure",
                flag: "emphasis",
                onclick: vm.queue
              },
              {
                text: "No thanks",
                onclick: function () {
                  vm.resetBoard();
                  vm.index = 0;
                }
              }
            ]
          });
        } else {
          vm.resetBoard();
        }
      });
      socket.on("move", function (col) {
        if (vm.online) {
          vm.state.push(col);
        }
      });
      socket.on("state", function (users) {
        var user = users[0];
        vm.hash = user.hash;
        vm.players[0] = user;
        vm.users = users.length;
      });
      socket.on("join", function (user) {
        vm.users++;
      });
      socket.on("leave", function (user) {
        vm.users--;
      });
      socket.on("user-response", function (response) {
        var template =
          "<p class='name'>"+
            "<span class='nickname'>" + response.name + "</span><span class='hash'>#" + response.hash + "</span>"+
          "</p>"+
          "<p>Games played: " + response.played + "</p>"+
          "<p>Wins: " + response.wins + "</p>"+
          "<p>Losses: " + response.losses + "</p>";
        var modal = {
          title: "User Stats",
          icon: "person",
          text: template,
          buttons: response.hash === vm.hash ? [
            {
              text: "Change Name",
              flag: "emphasis",
              onclick: function () {
                var value = modal.input.value;
                if (value) {
                  var players = vm.players;
                  var player, i = players.length;
                  while (i--) {
                    player = players[i];
                    if (player.hash === vm.hash) {
                      player.name = value;
                      break
                    }
                  }
                }
              }
            }
          ] : null,
          input: {
            placeholder: "Max 8 chars.",
            maxlength: 8,
            value: ""
          },
          onclose: function () {}
        };
        vm.openModal(modal);
      });
    },
    components: {
      modal: {
        template: "#modal-template",
        props: ["modal", "close", "users"]
      },
      users: {
        template: "#users-template",
        props: {
          users: {
            type: Number,
            default: 0
          }
        }
      }
    }
  });
})();
