
(function () {  
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
    if (serverGame && msg.gameId == serverGame.id) {
      document.getElementById('game-message').innerHTML = `<span class="user-${serverGame.users.white === msg.userId ? 'white' : 'black'}">${getShortName(msg.userId)}</span> resigned.`
      document.getElementById('game-resign').innerHTML = `Leave`;
      resigned = true;
    }

    removeGame(msg.gameId);
  });
              
  socket.on('joingame', function(msg) {
    playerColor = msg.color;
    initGame(msg.game);
    $('#page-lobby').hide();
    $('#page-game').show();
  });
    
  socket.on('move', function (msg) {
    if (serverGame && msg.gameId === serverGame.id) {
      game.move(msg.move);
      board.position(game.fen());
      addMoveMessage(msg.move);
      updateMessaging();
    }
  });
  
  function logMeIn(username) {
    if (username && username.length > 0 && username.includes('#')) {
      $('#userLabel').text(username);
      socket.emit('login', username);
      
      $('#page-login').hide();
      $('#page-lobby').show();
    } 
  }

  try {
    username = window.localStorage.getItem('username') || '';
    logMeIn(username);
  } catch(e) {
    // console.error("Could not get logged in username");
  }
  
  var getShortName = function(username) {
    return username.split('#')[0];
  }

  //////////////////////////////
  // Menus
  ////////////////////////////// 
  $('#login-form').submit( function(event) {
    event.preventDefault();
    var formVal = $('#username').val().trim();
    var name = '';
    var hash = '';
    var usernameMap = {};

    try {
      usernameMap = JSON.parse(window.localStorage.getItem('usernameMap')) || {};
    } catch (e) { }

    if (formVal.includes('#')) {
      hash = formVal.split('#')[1].slice(0,4).replace(/[^0-9]/g, "");
      name = formVal.split('#')[0].slice(0,20);
    } else {
      name = formVal.slice(0,20);
      if (usernameMap[name]) {
        hash = usernameMap[name]
      }
    }

    if (!hash) {
      hash = Math.floor(Math.random() * 10000).toString()
    }
    
    hash = hash.padStart(4, '0');
    
    username = `${name}#${hash}`
    usernameMap[name] = hash;
    
    if (name && name.length > 0) {
      try {
        window.localStorage.setItem('username', username);
        window.localStorage.setItem('usernameMap', JSON.stringify(usernameMap));
      } catch(e) {
        // console.error("Could not save logged in username");
      }
      logMeIn(username);
    }

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
      // console.error("Could not remove logged in username");
    }
    socket.emit('logout', username);
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
    }

    updateUserList();
  };
  
  var removeUser = function(userId) {
    for (var i=0; i<usersOnline.length; i++) {
      if (usersOnline[i] === userId) {
          usersOnline.splice(i, 1);
      }
    }
    
    updateUserList();
  };

  var removeGame = function(gameId) {
    for (var i=0; i<myGames.length; i++) {
      if (myGames[i].id === gameId) {
        myGames.splice(i, 1);
      }
    }

    updateGamesList();
  }
  
  var updateGamesList = function() {
    if (!myGames || !myGames.length){
      document.getElementById('gamesList').innerHTML = 'No active games';
      return
    }
    document.getElementById('gamesList').innerHTML = '';
    myGames.forEach(function(game) {
      let gameUsers = Object.keys(game.users).reduce((accumulator, color) => game.users[color] === username ? [`You`, ...accumulator] : [...accumulator, `${game.users[color]}`], []);
      let vsText = `${getShortName(gameUsers[0])}  vs. ${getShortName(gameUsers[1])}`;
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
                    .text(`Challenge ${getShortName(user)}`)
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
    var gameUsers = Object.keys(serverGame.users).reduce((accumulator, color) => serverGame.users[color] === username ? [`<span class="user-${color}">You</span>`, ...accumulator] : [...accumulator, `<span class="user-${color}">${getShortName(serverGame.users[color])}</span>`], []);
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
      $('#game-log').empty();
      updateMessaging();
  }
  var updateMessaging = function() {
    var message = '';
    opponentColor = playerColor === 'white' ? 'black': 'white';
    if (game.game_over()) {
      
      if (game.in_checkmate()) {
        if (game.turn() == playerColor[0]){ // if game is over and its your turn, you lost
          message += `Game Over: <span class="user-${opponentColor}">${getShortName(serverGame.users[opponentColor])}</span> put <span class="user-${playerColor}">you</span> in checkmate `;
        } else {
          message += `You win: <span class="user-${playerColor}">you</span> put <span class="user-${opponentColor}">${getShortName(serverGame.users[opponentColor])}</span> in checkmate! `;
        }
      } else {
        message += 'Game Over: '
        if (game.in_stalemate()) {
          message += `Stalemate`;
        } else if (game.draw()) {
          message += `Draw`;
        } else if (game.insufficient_material()) {
          message += 'Insufficient material ';
        } else if (game.in_threefold_repetition()) {
          message += 'Threefold repetition ' ;
        } else {
          message += '??? Not sure why ???' ;
        }
      }
      document.getElementById('game-resign').innerHTML = 'Leave';
    } else {
      if (game.turn() == playerColor[0]){
        message += `<span class="user-${playerColor}">Your</span> turn. `;
      } else {
        message += `<span class="user-${opponentColor}">${getShortName(serverGame.users[opponentColor])}'s</span> turn. `;
      }
      if (game.in_check()) {
        if (game.turn() == playerColor[0]){
          message += `<br/><span class="user-${playerColor}">You</span> are in check. `;
        } else {
          message += `<br/><span class="user-${opponentColor}">${getShortName(serverGame.users[opponentColor])}</span> is in check. `;
        }
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
    addMoveMessage(move);
    updateMessaging();
  };
  
  // update the board position after the piece snap 
  // for castling, en passant, pawn promotion
  var onSnapEnd = function() {
    board.position(game.fen());
  };

  function generateNeighbors(position, distance) {
    var letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
    var neighbors = [];
    for (let letterIndex = Math.max(0, letters.indexOf(position[0])- distance); letterIndex <= Math.min(letters.length, letters.indexOf(position[0]) + distance); letterIndex++) {
      for (let numberIndex = Math.max(1, parseInt(position[1]) -  distance); numberIndex <=  Math.min(8, parseInt(position[1]) + distance); numberIndex++){
        if (`${letters[letterIndex]}${numberIndex}` !== position){
          neighbors.push(`${letters[letterIndex]}${numberIndex}`);
        }
      }
    }
    return neighbors;
  }

  var addMoveMessage = function(move) {
    var src = move.to;
    var dest = move.to;
    var pieces = {
      "p": "pawn",
      "k": "king",
      "q": "queen",
      "r": "rook",
      "n": "knight",
      "b": "bishop"
    }
    var myTurn = playerColor[0] === move.color;
    var visibleSrc = myTurn || generateNeighbors(src, 1).filter(pos => game.get(pos) && (playerColor[0] === game.get(pos).color)).length > 0;
    var visibleDest = myTurn || generateNeighbors(dest, 1).filter(pos => game.get(pos) && (playerColor[0] === game.get(pos).color)).length > 0;
    var foggyDest =  visibleDest || generateNeighbors(dest, 2).filter(pos => game.get(pos) && (playerColor[0] === game.get(pos).color)).length > 0;
    var titleCaseColor = move.color === 'w' ? 'White' : 'Black';
    var logMessage = '';
    if (game.game_over() && game.in_checkmate()){
      logMessage += `Checkmate!`
    } else if (move.promotion && visibleDest) {
      logMessage += `${titleCaseColor} pawn promoted to queen on ${move.to}`
    } else if (move.captured && visibleDest) {
      logMessage += `${titleCaseColor} ${pieces[move.piece]} captured ${pieces[move.captured]} on ${move.to}`
    } else if (move.captured) {
      logMessage += `${titleCaseColor} captured ${pieces[move.captured]} on ${move.to}` 
    } else if (move.flags.includes('k') && visibleDest) {
      logMessage += `${titleCaseColor} castled on kingside`
    } else if (move.flags.includes('q') && visibleDest) {
      logMessage += `${titleCaseColor} castled on queenside`
    } else if ((move.flags.includes('k') || move.flags.includes('q')) && visibleSrc) {
      logMessage += `${titleCaseColor} castled`
    } else if (visibleDest || (visibleSrc && foggyDest)) {
      logMessage += `${titleCaseColor} ${pieces[move.piece]} moved to ${move.to}`
    } else if (visibleSrc) {
      logMessage += `${titleCaseColor} ${pieces[move.piece]} moved`
    } else if (foggyDest) {
      logMessage += `${titleCaseColor} moved to ${move.to}`
    } else {
      logMessage += `${titleCaseColor} moved` 
    }
    $('#game-log').prepend($('<li>').text(logMessage));
  };
})();

