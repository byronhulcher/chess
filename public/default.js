
(function () {
    
    WinJS.UI.processAll().then(function () {
      
      var socket, serverGame;
      var username, playerColor;
      var game, board;
      var usersOnline = [];
      var myGames = [];
      var resigned = false;
      socket = io();
           
      //////////////////////////////
      // Socket.io handlers
      ////////////////////////////// 
      
      socket.on('login', function(msg) {
            myGames = msg.games;
            usersOnline = msg.users;

            updateGamesList();
            updateUserList();
            
      });
      
      socket.on('joinlobby', function (msg) {
        addUser(msg);
      });
      
       socket.on('leavelobby', function (msg) {
        removeUser(msg);
      });
      
      socket.on('gameadd', function(msg) {
        socket.emit('login', username);
      });
      
      socket.on('resign', function(msg) {
            if (msg.gameId == serverGame.id) {
              document.getElementById('game-message').innerHTML = `${msg.userId} resigned.`
              document.getElementById('game-resign').innerHTML = `Leave`;
              resigned = true;
            }
                       
      });
                  
      socket.on('joingame', function(msg) {
        console.log("joined as game id: " + msg.game.id );   
        playerColor = msg.color;
        initGame(msg.game);
        $('#page-lobby').hide();
        $('#page-game').show();
        
      });
        
      socket.on('move', function (msg) {
        if (serverGame && msg.gameId === serverGame.id) {
           game.move(msg.move);
           board.position(game.fen());
           updateMessaging();
        }
      });
     
      
      socket.on('logout', function (msg) {
        removeUser(msg.username);
      });
      
      function logMeIn(username) {
        if (username && username.length > 0) {
          $('#userLabel').text(username);
          socket.emit('login', username);
          
          $('#page-login').hide();
          $('#page-lobby').show();
        } 
      }

      try {
        username = localStorage.getItem('username');
      } catch(e) {
        console.error("Could not get logged in username");
      }
      
      logMeIn(username);

      //////////////////////////////
      // Menus
      ////////////////////////////// 
      $('#login-form').submit( function(event) {
        event.preventDefault();
        username = $('#username').val().trim();
        
        if (username && username.length > 0) {
          try {
            window.localStorage.setItem('username', username);
          } catch(e) {
            console.error("Could not save logged in username");
          }
        }

        logMeIn(username);
      });
      
      $('#logout').on('click', function() {
        username = null;
        myGames = [];
        usersOnline = [];
        serverGame = null;
        game = null;
        board = null;
        playerColor = null;
        resigned = false;
        try {
          window.localStorage.removeItem('username');
        } catch(e) {
          console.error("Could not remove logged in username");
        }
        $('#page-login').show();
        $('#page-lobby').hide();
      });

      $('#game-back').on('click', function() {
        socket.emit('login', username);
        
        $('#page-game').hide();
        $('#page-lobby').show();
      });
      
      $('#game-resign').on('click', function() {
        if (!resigned){
          socket.emit('resign', {userId: username, gameId: serverGame.id});
        }
        socket.emit('login', username);
        $('#page-game').hide();
        $('#page-lobby').show();
      });
      
      var addUser = function(userId) {
        if (usersOnline.indexOf(userId) == -1) {
          usersOnline.push(userId);
          updateUserList();
        }
      };
    
     var removeUser = function(userId) {
          for (var i=0; i<usersOnline.length; i++) {
            if (usersOnline[i] === userId) {
                usersOnline.splice(i, 1);
            }
         }
         
         updateUserList();
      };
      
      var updateGamesList = function() {
        if (!myGames || !myGames.length){
          document.getElementById('gamesList').innerHTML = 'No active games';
          return
        }
        document.getElementById('gamesList').innerHTML = '';
        myGames.forEach(function(game) {
          let gameUsers = Object.keys(game.users).reduce((accumulator, color) => game.users[color] === username ? [`You`, ...accumulator] : [...accumulator, `${game.users[color]}`], []);
          let vsText = `${gameUsers[0]}  vs. ${gameUsers[1]}`;
          $('#gamesList').append($('<button>')
                        .text(`${vsText}`)
                        .on('click', function(event) {
                          event.target.parentNode.removeChild(event.target);
                          socket.emit('resumegame',  game.id);
                        }));
        });
      };
      
      var updateUserList = function() {
        let opponentUsers = [];
        for (myGame of myGames) {
          for (color in myGame.users) {
            if (myGame.users[color] !== username) {
              opponentUsers.push(myGame.users[color])
            }
          }
        }
        let usersToList = usersOnline.filter(user => user !== username && !opponentUsers.includes(user));
        if (!usersToList || !usersToList.length){
          document.getElementById('userList').innerHTML = 'No users online';
          return
        }
        document.getElementById('userList').innerHTML = '';
        usersToList.forEach(function(user) {
          $('#userList').append($('<button>')
                        .text(`Challenge ${user}`)
                        .on('click', function() {
                          socket.emit('invite',  user);
                        }));
        });
      };
           
      //////////////////////////////
      // Chess Game
      ////////////////////////////// 
      
      var initGame = function (serverGameState) {
        serverGame = serverGameState; 
        // console.log("*** Init game: ***")
        // console.log(serverGame);
        var gameUsers = Object.keys(serverGame.users).reduce((accumulator, color) => serverGame.users[color] === username ? [`<span class="user-${color}">You</span>`, ...accumulator] : [...accumulator, `<span class="user-${color}">${serverGame.users[color]}</span>`], []);
        document.getElementById('game-users').innerHTML = `${gameUsers[0]}  vs. ${gameUsers[1]}`;
          var cfg = {
            draggable: true,
            showNotation: false,
            orientation: playerColor,
            position: serverGame.board ? serverGame.board : 'start',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            onMoveEnd: onMoveEnd,
          };
               
          game = serverGame.board ? new Chess(serverGame.board) : new Chess();
          board = new ChessBoard('game-board', cfg);
          resigned = false;
          updateMessaging();
      }
      var updateMessaging = function() {
        var message = '';
        if (game.game_over()) {
          message += 'Game Over: '
          if (game.in_checkmate()) {
            message += `${game.turn() === 'w' ? 'Black' : 'White'} wins`;
          } else if (game.in_stalemate()) {
            message += `Stalemate`;
          } else if (game.draw()) {
            message += `Draw`;
          } else if (game.insufficient_material()) {
            message += 'Insufficient material ';
          } else if (game.in_threefold_repetition()) {
            message += 'Threefold repetition ' ;
          } else {
            console.log(`Game ended... for some reason`);
          }
          document.getElementById('game-resign').innerHTML = 'Leave';
        } else {
          color = game.turn() === 'w' ? 'white': 'black';
          if (game.turn() == playerColor[0]){
            message += `<span class="user-${color}">Your</span> turn. `;
          } else {
            message += `<span class="user-${color}">${serverGame.users[color]}'s</span> turn. `;
          }
          if (game.in_check()) {
            message += `<span class="user-${color}">${game.turn() === 'w' ? 'White\'s' : 'Black\'s'}</span> is in check.`;
          }
          document.getElementById('game-resign').innerHTML = 'Resign'; 
        }
        document.getElementById('game-message').innerHTML = message; 
      }

      var onMoveEnd = function(oldPos, newPos) {
        updateMessaging();
      }

      // do not pick up pieces if the game is over
      // only pick up pieces for the side to move
      var onDragStart = function(source, piece, position, orientation) {
        if (game.game_over() === true ||
            (game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1) ||
            (game.turn() !== playerColor[0])) {
          return false;
        }
      };  
      
    
      
      var onDrop = function(source, target) {
        // see if the move is legal
        var move = game.move({
          from: source,
          to: target,
          promotion: 'q' // NOTE: always promote to a queen for example simplicity
        });
      
        // illegal move
        if (move === null) { 
          return 'snapback';
        } else {
           socket.emit('move', {move: move, gameId: serverGame.id, board: game.fen()});
        }

        updateMessaging();
      };
      
      // update the board position after the piece snap 
      // for castling, en passant, pawn promotion
      var onSnapEnd = function() {
        board.position(game.fen());
      };
    });
})();

