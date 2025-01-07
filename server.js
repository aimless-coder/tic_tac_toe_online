// Importing necessary modules
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Getting the current file path
const __filename = fileURLToPath(import.meta.url);
// Getting the directory name of the current file
const __dirname = dirname(__filename);

// Creating an instance of an Express application
const app = express();
// Creating an HTTP server using the Express app
const server = createServer(app);
// Creating a Socket.IO server
const io = new Server(server);

// Serving static files from the current directory
app.use(express.static(path.join(__dirname, '')));

// Initializing a map to store game rooms
const rooms = new Map();

// Function to create a new game room
function createRoom() {
    return {
        players: [], // Array to hold players in the room
        gameState: Array(9).fill(''), // Initial game state with empty cells
        scores: {}, // Object to hold scores of players
        currentRound: 1, // Current round number
        totalRounds: 3, // Total number of rounds in the game
        lastWinner: null, // Last winner of the round
        lastRound: null, // Last round number
        roundInProgress: false, // Flag to indicate if a round is in progress
        processingRound: false, // Flag to indicate if the round is being processed
        roundStarter: 'cross' // Track who starts the round
    };
}

// Function to generate a unique room ID
function generateRoomId() {
    return Math.random().toString(36).substring(7); // Generate a random string as room ID
}

// Handling socket connections
io.on('connection', (socket) => {
    // Handling quick join event
    socket.on('quickJoin', () => {
        let joinedRoom = false; // Flag to check if a room is joined
        
        // Try to join an existing room
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.length === 1) { // Check if room has one player
                socket.join(roomId); // Join the room
                room.players.push(socket.id); // Add player to the room
                room.scores[socket.id] = 0; // Initialize player score
                
                // Emit player assignment to the client
                socket.emit('playerAssigned', { 
                    symbol: 'circle', // Assign symbol 'circle' to the player
                    roomId,
                    joinType: 'quick'
                });
                
                room.roundInProgress = true;
                io.to(roomId).emit('gameStart', {
                    firstPlayer: room.players[0],
                    gameState: room.gameState,
                    scores: room.scores,
                    currentRound: room.currentRound,
                    totalRounds: room.totalRounds
                });
                
                joinedRoom = true; // Set flag to true
                break; // Exit the loop
            }
        }
        
        // If no room was joined, create a new one
        if (!joinedRoom) {
            const roomId = generateRoomId(); // Generate a new room ID
            const newRoom = createRoom(); // Create a new room
            rooms.set(roomId, newRoom); // Add the new room to the map
            socket.join(roomId); // Join the new room
            newRoom.players.push(socket.id); // Add player to the room
            newRoom.scores[socket.id] = 0; // Initialize player score
            
            // Emit player assignment to the client
            socket.emit('playerAssigned', { 
                symbol: 'cross', // Assign symbol 'cross' to the player
                roomId,
                joinType: 'quick'
            });
        }
    });

    // Handling create room event
    socket.on('createRoom', () => {
        const roomId = generateRoomId(); // Generate a new room ID
        const newRoom = createRoom(); // Create a new room
        rooms.set(roomId, newRoom); // Add the new room to the map
        socket.join(roomId); // Join the new room
        newRoom.players.push(socket.id); // Add player to the room
        newRoom.scores[socket.id] = 0; // Initialize player score
        
        // Emit player assignment to the client
        socket.emit('playerAssigned', { 
            symbol: 'cross', // Assign symbol 'cross' to the player
            roomId,
            joinType: 'create'
        }); 
        socket.emit('roomCreated', roomId);
    });

    // Handling join room event
    socket.on('joinRoom', (roomId) => {
        const room = rooms.get(roomId); // Get the room by ID
        console.log('Room not found');
        if (!room) { // Check if room exists
            socket.emit('roomNotFound'); // Emit room not found event
            return;
        }
        
        if (room.players.length >= 2) { // Check if room is full
            socket.emit('roomFull'); // Emit room full event
            return;
        }

        // Join the room
        socket.join(roomId);
        room.players.push(socket.id); // Add player to the room
        room.scores[socket.id] = 0; // Initialize player score
        
        // Assign symbol
        const playerSymbol = room.players[0] === socket.id ? 'cross' : 'circle';
        socket.emit('playerJoined', {
            symbol: playerSymbol,
            roomId: roomId
        });

        // If this is the second player, start the game
        if (room.players.length === 2) {
            room.roundInProgress = true;
            io.to(roomId).emit('gameStart', {
                firstPlayer: room.players[0],
                gameState: room.gameState,
                scores: room.scores,
                currentRound: room.currentRound,
                totalRounds: room.totalRounds
            });
        }
    });

    // Handling make move event
    socket.on('makeMove', ({ index, roomId }) => {
        const room = rooms.get(roomId); // Get the room by ID
        if (!room) { // Check if room exists
            return;
        }

        // Check if both players are in the room
        if (room.players.length !== 2) {
            return;
        }

        if (!room.roundInProgress) {
            return;
        }

        // Get player's symbol and determine if it's their turn
        const playerSymbol = room.players[0] === socket.id ? 'cross' : 'circle';
        const moveCount = room.gameState.filter(cell => cell !== '').length;
        
        // If it's the first move of the round, check against roundStarter
        if (moveCount === 0) {
            if (playerSymbol !== room.roundStarter) {
                return;
            }
        } else {
            // For subsequent moves, alternate based on move count
            const currentTurn = moveCount % 2 === 0 ? room.roundStarter : (room.roundStarter === 'cross' ? 'circle' : 'cross');
            if (playerSymbol !== currentTurn) {
                return;
            }
        }

        if (room.gameState[index] === '') {
            room.gameState[index] = playerSymbol;
            io.to(roomId).emit('moveMade', {
                index: index,
                symbol: playerSymbol,
                gameState: room.gameState
            });
        }
    });

    // Handling round won event
    socket.on('roundWon', ({ roomId, winnerId }) => {
        const room = rooms.get(roomId); // Get the room by ID
        if (!room) { // Check if room exists
            return;
        }
        
        if (!room.roundInProgress) {
            return;
        }

        if (room.processingRound) {
            return;
        }

        try {
            room.processingRound = true;
            // Prevent processing if this round was already handled
            if (room.lastWinner === winnerId && room.lastRound === room.currentRound) {
                return;
            }
            
            // Update score only if it's a valid round
            if (room.currentRound <= room.totalRounds) {
                room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
                room.lastWinner = winnerId;
                room.lastRound = room.currentRound;
                room.roundInProgress = false;
                
                // Move to next round if available
                if (room.currentRound < room.totalRounds) {
                    setTimeout(() => {
                        if (room && room.players.length === 2) {
                            room.currentRound++;
                            room.gameState = Array(9).fill('');
                            room.roundInProgress = true;
                            // Switch starting player
                            room.roundStarter = room.roundStarter === 'cross' ? 'circle' : 'cross';
                            io.to(roomId).emit('nextRound', {
                                scores: room.scores,
                                currentRound: room.currentRound,
                                gameState: room.gameState,
                                startingPlayer: room.roundStarter
                            });
                        }
                    }, 1500);
                } else {
                    // Game is complete
                    const finalScores = room.scores;
                    const winnerScore = Math.max(...Object.values(finalScores));
                    const winners = Object.entries(finalScores)
                        .filter(([_, score]) => score === winnerScore)
                        .map(([id]) => id);
                    
                    const winner = winners.length === 1 ? winners[0] : null;
                    io.to(roomId).emit('gameOver', {
                        scores: finalScores,
                        winner: winner
                    });
                }
            }
        } catch (error) {
            // Removed unnecessary console.log statements
        } finally {
            // Add delay before resetting processing flag
            setTimeout(() => {
                if (room) {
                    room.processingRound = false;
                }
            }, 1000);
        }
    });

    // Handling round draw event
    socket.on('roundDraw', ({ roomId }) => {
        const room = rooms.get(roomId); // Get the room by ID
        if (!room) return;

        if (!room.roundInProgress) {
            return;
        }

        if (room.processingRound) {
            return;
        }

        try {
            room.processingRound = true;
            room.roundInProgress = false;

            if (room.currentRound < room.totalRounds) {
                setTimeout(() => {
                    if (room && room.players.length === 2) {
                        room.currentRound++;
                        room.gameState = Array(9).fill('');
                        room.roundInProgress = true;
                        // Switch starting player
                        room.roundStarter = room.roundStarter === 'cross' ? 'circle' : 'cross';
                        room.processingRound = false;
                        io.to(roomId).emit('nextRound', {
                            scores: room.scores,
                            currentRound: room.currentRound,
                            gameState: room.gameState,
                            startingPlayer: room.roundStarter
                        });
                    }
                }, 1500);
            } else {
                // Game is complete
                const finalScores = room.scores;
                const winnerScore = Math.max(...Object.values(finalScores));
                const winners = Object.entries(finalScores)
                    .filter(([_, score]) => score === winnerScore)
                    .map(([id]) => id);
                
                const winner = winners.length === 1 ? winners[0] : null;
                io.to(roomId).emit('gameOver', {
                    scores: finalScores,
                    winner: winner
                });
                room.processingRound = false;
            }
        } catch (error) {
            // Removed unnecessary console.log statements
            room.processingRound = false;
        }
    });

    // Handling send emoji event
    socket.on('sendEmoji', ({ roomId, emoji }) => {
        const room = rooms.get(roomId); // Get the room by ID
        if (room) {
            io.to(roomId).emit('emojiReceived', {
                emoji,
                playerId: socket.id
            });
        }
    });

    // Handling leave game event
    socket.on('leaveGame', ({ roomId }) => {
        if (roomId) {
            socket.leave(roomId);
            const room = rooms.get(roomId);
            if (room) {
                // Remove player from room
                room.players = room.players.filter(id => id !== socket.id);
                // Notify other player
                io.to(roomId).emit('playerDisconnected');
                // If room is empty, delete it
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                }
            }
        }
    });

    // Handling socket disconnection event
    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(socket.id)) {
                // Remove player from room
                room.players = room.players.filter(id => id !== socket.id);
                // Notify other player
                io.to(roomId).emit('playerDisconnected');
                // If room is empty, delete it
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                }
            }
        }
    });
});

// Starting the server on a specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    // Log server start
    console.log(`Server running on port ${PORT}`);
});
