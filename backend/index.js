import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../frontend')));

const rooms = new Map();

function createRoom() {
    return {
        players: [],
        gameState: Array(9).fill(''),
        scores: {},
        currentRound: 1,
        totalRounds: 3,
        lastWinner: null,
        lastRound: null,
        roundInProgress: false,
        processingRound: false,
        roundStarter: 'cross'
    };
}

function generateRoomId() {
    return Math.random().toString(36).substring(7);
}

io.on('connection', (socket) => {
    socket.on('quickJoin', () => {
        let joinedRoom = false;
        
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.length === 1) {
                socket.join(roomId);
                room.players.push(socket.id);
                room.scores[socket.id] = 0;
                
                socket.emit('playerAssigned', { 
                    symbol: 'circle',
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
                
                joinedRoom = true;
                break;
            }
        }
        
        if (!joinedRoom) {
            const roomId = generateRoomId();
            const newRoom = createRoom();
            rooms.set(roomId, newRoom);
            socket.join(roomId);
            newRoom.players.push(socket.id);
            newRoom.scores[socket.id] = 0;
            
            socket.emit('playerAssigned', { 
                symbol: 'cross',
                roomId,
                joinType: 'quick'
            });
        }
    });

    socket.on('createRoom', () => {
        const roomId = generateRoomId();
        const newRoom = createRoom();
        rooms.set(roomId, newRoom);
        socket.join(roomId);
        newRoom.players.push(socket.id);
        newRoom.scores[socket.id] = 0;
        
        socket.emit('playerAssigned', { 
            symbol: 'cross',
            roomId,
            joinType: 'create'
        }); 
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('roomNotFound');
            return;
        }
        
        if (room.players.length >= 2) {
            socket.emit('roomFull');
            return;
        }

        socket.join(roomId);
        room.players.push(socket.id);
        room.scores[socket.id] = 0;
        
        const playerSymbol = room.players[0] === socket.id ? 'cross' : 'circle';
        socket.emit('playerJoined', {
            symbol: playerSymbol,
            roomId: roomId
        });

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

    socket.on('makeMove', ({ index, roomId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            return;
        }

        if (room.players.length !== 2) {
            return;
        }

        if (!room.roundInProgress) {
            return;
        }

        const playerSymbol = room.players[0] === socket.id ? 'cross' : 'circle';
        const moveCount = room.gameState.filter(cell => cell !== '').length;
        
        if (moveCount === 0) {
            if (playerSymbol !== room.roundStarter) {
                return;
            }
        } else {
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

    socket.on('roundWon', ({ roomId, winnerId }) => {
        const room = rooms.get(roomId);
        if (!room) {
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
            if (room.lastWinner === winnerId && room.lastRound === room.currentRound) {
                return;
            }
            
            if (room.currentRound <= room.totalRounds) {
                room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
                room.lastWinner = winnerId;
                room.lastRound = room.currentRound;
                room.roundInProgress = false;
                
                if (room.currentRound < room.totalRounds) {
                    setTimeout(() => {
                        if (room && room.players.length === 2) {
                            room.currentRound++;
                            room.gameState = Array(9).fill('');
                            room.roundInProgress = true;
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
        } finally {
            setTimeout(() => {
                if (room) {
                    room.processingRound = false;
                }
            }, 1000);
        }
    });

    socket.on('roundDraw', ({ roomId }) => {
        const room = rooms.get(roomId);
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
            room.processingRound = false;
        }
    });

    socket.on('sendEmoji', ({emoji, roomId}) => {
        const room = rooms.get(roomId);
        if (room) {
            io.to(roomId).emit('emojiReceived', {
                emoji,
                playerId: socket.id
            });
        }
    });

    socket.on('leaveGame', ({ roomId }) => {
        if (roomId) {
            socket.leave(roomId);
            const room = rooms.get(roomId);
            if (room) {
                io.to(roomId).emit('playerDisconnected');
                room.players.forEach(playerId => {
                    const playerSocket = io.sockets.sockets.get(playerId);
                    if (playerSocket) {
                        playerSocket.leave(roomId);
                    }
                });
                rooms.delete(roomId);
            }
        }
    });

    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('playerDisconnected');
                room.players.forEach(playerId => {
                    const playerSocket = io.sockets.sockets.get(playerId);
                    if (playerSocket) {
                        playerSocket.leave(roomId);
                    }
                });
                rooms.delete(roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
