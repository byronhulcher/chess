var {LocalStorage} = require('node-localstorage');
localStorage = new LocalStorage('./data');
var express = require('express');
var app = express();
app.use(express.static('public'));
app.use(express.static('dashboard'));
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var lobbyUsers = {};

var users = {};
try {
  users = JSON.parse(localStorage.getItem('users')) || {}
} catch(e) {}
console.log(users);
var activeGames = {};
try {
  activeGames = JSON.parse(localStorage.getItem('activeGames')) || {}
} catch(e) {}
console.log(activeGames);
app.get('/', function(req, res) {
 res.sendFile(__dirname + '/public/default.html');
});

app.get('/dashboard/', function(req, res) {
 res.sendFile(__dirname + '/dashboard/dashboard.html');
});

io.on('connection', function(socket) {
    socket.on('login', function(userId) {
      try {
        doLogin(socket, userId);
      } catch(e) {
        console.error(`Error during login w/ userId ${userId}:`)
        console.error(e);
      }
      
    });

    function doLogin(socket, userId) {
      var newUser = false;
      socket.userId = userId;  
    
      if (!users[userId]) {    
          console.log(`Creating new user ${userId}`);
          users[userId] = {userId: socket.userId, games:{}};
          newUser = true;
      } else {
          console.log(`Found user ${userId}`);
          Object.keys(users[userId].games).forEach(function(gameId) {
              console.log('gameid - ' + gameId);
          });
      }
      
      socket.emit('login', {users: Object.keys(lobbyUsers), 
                            games: Object.keys(users[userId].games).map(gameId => activeGames[gameId])});
      lobbyUsers[userId] = socket;
      
      socket.broadcast.emit('joinlobby', socket.userId);

      if (newUser) {
        localStorage.setItem('users', JSON.stringify(users));
      }
    }
    
    socket.on('invite', function(opponentId) {
      try {
        doInvite(opponentId);
      } catch(e) {
        console.error(`Error during invite w/ opponentId ${opponentId}:`)
        console.error(e);
      }
    });

    function doInvite(opponentId) {
      console.log('Got an invite from: ' + socket.userId + ' --> ' + opponentId);
        
      socket.broadcast.emit('leavelobby', socket.userId);
      socket.broadcast.emit('leavelobby', opponentId);
    
      
      var game = {
          id: Math.floor((Math.random() * 1000000000) + 1),
          board: null, 
          users: {white: socket.userId, black: opponentId}
      };
      
      socket.gameId = game.id;
      activeGames[game.id] = game;
      
      users[game.users.white].games[game.id] = game.id;
      users[game.users.black].games[game.id] = game.id;

      console.log(`Starting game ${game.id} for users ${socket.userId} and ${opponentId}`);
      lobbyUsers[game.users.white].emit('joingame', {game: game, color: 'white'});
      lobbyUsers[game.users.black].emit('gameadd', {gameId: game.id, gameState:game});
      
      delete lobbyUsers[game.users.white];
      delete lobbyUsers[game.users.black];   

      localStorage.setItem('users', JSON.stringify(users));
      localStorage.setItem('activeGames', JSON.stringify(activeGames));
    }
    
    socket.on('resumegame', function(gameId) {
      try {
        doResume(gameId);
      } catch(e) {
        console.error(`Error during resume w/ gameId ${gameId}:`)
        console.error(e);
      }
    });
    
    function doResume(gameId) {
      console.log(`Ready to resume game ${gameId} for user ${socket.userId}`);
        
      socket.gameId = gameId;
      var game = activeGames[gameId];
      
      users[game.users.white].games[game.id] = game.id;
      users[game.users.black].games[game.id] = game.id;

      console.log(`Resuming game ${gameId} for user ${socket.userId}`);
      if (lobbyUsers[game.users.white] && game.users.white === socket.userId) {
          lobbyUsers[game.users.white].emit('joingame', {game: game, color: 'white'});
          delete lobbyUsers[game.users.white];
      }
      
      if (lobbyUsers[game.users.black] && game.users.black === socket.userId) {
          lobbyUsers[game.users.black] && 
          lobbyUsers[game.users.black].emit('joingame', {game: game, color: 'black'});
          delete lobbyUsers[game.users.black];  
      }


      localStorage.setItem('users', JSON.stringify(users));
    }

    socket.on('move', function(msg) {
      socket.broadcast.emit('move', msg);
      activeGames[msg.gameId].board = msg.board;
      localStorage.setItem('activeGames', JSON.stringify(activeGames));
    });
    
    socket.on('resign', function(msg) {
      console.log("resign: " + msg);

      delete users[activeGames[msg.gameId].users.white].games[msg.gameId];
      delete users[activeGames[msg.gameId].users.black].games[msg.gameId];
      delete activeGames[msg.gameId];

      socket.broadcast.emit('resign', msg);

      localStorage.setItem('activeGames', JSON.stringify(activeGames));
    });
    
    socket.on('disconnect', function(msg) {
        
      console.log(msg);
      
      if (socket && socket.userId && socket.gameId) {
        console.log(socket.userId + ' disconnected');
        console.log(socket.gameId + ' disconnected');
      }
      
      delete lobbyUsers[socket.userId];
      
      socket.broadcast.emit('logout', {
        userId: socket.userId,
        gameId: socket.gameId
      });
    });
    
    /////////////////////
    // Dashboard messages 
    /////////////////////
    
    socket.on('dashboardlogin', function() {
        console.log('dashboard joined');
        socket.emit('dashboardlogin', {games: activeGames}); 
    });
           
});

http.listen(port, function() {
    console.log('listening on *: ' + port);
});