const socket = io();

socket.on('connect_error', (error) => {
    roomStatusEl.innerHTML = 'Connection error. Please try again later.';
    console.error('Socket connection error:', error);
});

socket.on('connect', () => {
    // Enable buttons only after connection is established
    quickJoinEl.disabled = false;
    createRoomEl.disabled = false;
    joinRoomEl.disabled = false;
});

const quickJoinEl = document.getElementById('quickJoin');
const createRoomEl = document.getElementById('createRoom');
const joinRoomEl = document.getElementById('joinRoom');
const roomInputEl = document.getElementById('roomInput');
const cells = document.querySelectorAll('[data-cell]');

const introAreaEl = document.getElementById('introArea');
const gameAreaEl = document.getElementById('gameArea');
const boardAreaEl = document.getElementById('boardArea');
const playerScoreDisplayEl = document.getElementById('playerScore');
const opponentScoreDisplayEl = document.getElementById('opponentScore');
const roundDisplayEl = document.getElementById('currentRound');
const resultEl = document.getElementById('result');
const messageEl = document.getElementById('message');
const boardEl = document.getElementById('board');

const roomStatusEl = document.getElementById('roomStatus');

let currentPlayer = 'cross';
let gameActive = false;
let currentRoom = '';
let playerSymbol = '';
let gameState = ['', '', '', '', '', '', '', '', ''];
let scores = {};
let currentRound = 1;
let roundInProgress = true;
let totalRounds = 3;
let roundFinished = false;
let processingWin = false;
let bothPlayersJoined = false;
let winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6] 
];

const handleCellClick = (index) => {
    if(!bothPlayersJoined) {
        roomStatusEl.innerHTML = 'Waiting for opponent to join...';
        return;
    }

    if(!roundInProgress || roundFinished || processingWin) {
        return;
    }

    if (gameState[index] !== '') {
        return;
    }

    if (!gameActive || currentPlayer !== playerSymbol) {
        return;
    }

    gameState[index] = playerSymbol;
    updateBoard();

    const hasWon = checkWin(gameState, playerSymbol);
    const isDraw = checkDraw(gameState);

    socket.emit('makeMove', { 
        index: index, 
        roomId: currentRoom,
        hasWon: hasWon,
        isDraw: isDraw
    });
};

const updateBoard = () => {
    cells.forEach((cell, index) => {
        if (gameState[index] === 'cross') {
            cell.classList.add('cross');
        } else if (gameState[index] === 'circle') {
            cell.classList.add('circle');
        }
    });
};

const updateHover = () => {
    boardEl.classList.remove('circle', 'cross');
    boardEl.classList.add(currentPlayer);
}

// Fix updateScoreDisplay to properly handle undefined scores
const updateScoreDisplay = () => {
    if (!scores) {
        scores = {};
    }
    
    const playerScore = scores[socket.id] || 0;
    const opponentId = getOpponentId();
    const opponentScore = opponentId ? (scores[opponentId] || 0) : 0;

    if (playerScoreDisplayEl && opponentScoreDisplayEl) {
        playerScoreDisplayEl.textContent = playerScore;
        opponentScoreDisplayEl.textContent = opponentScore;
    }
}

const updateRoundDisplay = () => {
    roundDisplayEl.textContent = `${currentRound}/${totalRounds}`;
}
const checkWin = (board, symbol) => {
    for(const condition of winningConditions) {
        const [a, b, c] = condition;
        if(board[a] === symbol && board[b] === symbol && board[c] === symbol) {
            return true;
        }
    }
    return false;
};

const checkDraw = (board) => {
    return board.every(cell => cell !== '');
};

// Fix the getOpponentId function to return just the ID string
const getOpponentId = () => {
    const opponentEntry = Object.entries(scores).find(([id]) => id !== socket.id);
    return opponentEntry ? opponentEntry[0] : null;
}

const resetBoard = () => {
    gameState = ['', '', '', '', '', '', '', '', ''];
    cells.forEach(cell => {
        cell.classList.remove('cross', 'circle');
    });
    processingWin = false;
    roundFinished = false;
    updateBoard();
};

socket.on('roomCreated', (roomId) => {
    currentRoom = roomId;
    introAreaEl.style.display = 'none';
    gameAreaEl.style.display = 'grid';
    roomStatusEl.innerHTML = `Room created! Room ID: ${roomId}`;
});

socket.on('gameStart', ({
    gameState: initialGameState,
    scores: initialScores,
    currentRound: startRound,
    totalRounds: rounds
}) => {
    gameState = initialGameState;
    scores = initialScores;
    currentRound = startRound;
    totalRounds = rounds;
    roundFinished = false;
    processingWin = false;
    bothPlayersJoined = true;

    updateScoreDisplay();
    updateRoundDisplay();
    updateBoard();
    updateHover();

    gameActive = true;
    roundInProgress = true;
    currentPlayer = 'cross';

    if(playerSymbol === 'cross') {
        roomStatusEl.innerHTML = 'Your turn!';
    } else {    
        roomStatusEl.innerHTML = 'Opponent\'s turn!';
    }
});

socket.on('playerAssigned', ({symbol, roomId, joinType}) => {
    playerSymbol = symbol;
    currentRoom = roomId;

    if(joinType === 'quick') {
        introAreaEl.style.display = 'none';
        gameAreaEl.style.display = 'grid';
        roomStatusEl.innerHTML = 'Finding game...';
    }
});

socket.on('playerJoined', ({symbol, roomId}) => {
    playerSymbol = symbol;
    currentRoom = roomId;

    introAreaEl.style.display = 'none';
    gameAreaEl.style.display = 'grid';
    
    if(symbol === 'cross') {
        roomStatusEl.innerHTML = 'Waiting for opponent to join...';
    } else {
        roomStatusEl.innerHTML = 'Game Started!';
    }
});

socket.on ('nextRound', ({ scores: newScores,
    currentRound: newRound,
    gameState: newGameState,
    startingPlayer}) => {
        resetBoard();
        scores = newScores;
        currentRound = newRound;
        gameState = newGameState;
        roundFinished = false;
        processingWin = false;

        updateScoreDisplay();
        updateRoundDisplay();
        updateBoard();
        updateHover();

        gameActive = true;
        roundInProgress = true;
        currentPlayer = startingPlayer;

        if(playerSymbol === currentPlayer) {
            roomStatusEl.innerHTML = 'Your turn!';
        } else {
            roomStatusEl.innerHTML = 'Opponent\'s turn!';
        }
    });

socket.on('gameOver', ({ scores: finalScores, winner}) => {
    scores = finalScores;
    updateScoreDisplay();

    const playerScore = scores[socket.id] || 0;
    const opponentId = Object.keys(scores).find(id => id !== socket.id);
    const opponentScore = opponentId ? (scores[opponentId] || 0) : 0;
    
    playerScoreDisplayEl.textContent = playerScore;
    opponentScoreDisplayEl.textContent = opponentScore;

    boardAreaEl.style.display = 'none';
    resultEl.style.display = 'grid';

    if (winner === null) {
        messageEl.innerHTML = 'Game Over - Draw! 🤝';
    } else if (winner === socket.id) {
        messageEl.innerHTML = 'Game Over - You won the match! 🎉';
    } else {
        messageEl.innerHTML = 'Game Over - Opponent won the match! 👏';
    }
        
    gameActive = false;
    roundInProgress = false;
    roundFinished = true;
});

// Fix moveMade event handler
socket.on('moveMade', ({index, symbol, gameState: newGameState}) => {
    gameState = newGameState;
    currentPlayer = symbol === 'cross' ? 'circle' : 'cross';
    updateBoard();
    updateHover();

    const hasWon = checkWin(gameState, symbol);

    if(hasWon && !processingWin) {
        processingWin = true;
        gameActive = false;
        roundInProgress = false;
        roundFinished = true;

        const winnerId = symbol === playerSymbol ? socket.id : getOpponentId();
        if(winnerId) {
            // Initialize score if not exists
            if (!scores[winnerId]) {
                scores[winnerId] = 0;
            }
            
            socket.emit('roundWon', {
                roomId: currentRoom,
                winnerId: winnerId
            });
            
            scores[winnerId]++;
            updateScoreDisplay();
        }

        roomStatusEl.innerHTML = symbol === playerSymbol ? 'You won this round!' : 'You lost this round!';
    } else if(checkDraw(gameState) && gameActive && !processingWin) {
        processingWin = true;
        gameActive = false;
        roundInProgress = false;
        roundFinished = true;

        socket.emit('roundDraw', {
            roomId: currentRoom
        });

        roomStatusEl.innerHTML = 'Round Draw!';
    } else if(gameActive && !processingWin) {
        roomStatusEl.innerHTML = currentPlayer === playerSymbol ? 'Your turn!' : 'Opponent\'s turn!';
    }
});

socket.on('playerDisconnected', () => {
    bothPlayersJoined = false;
    gameActive = false;

    boardAreaEl.style.display = 'none';
    
    resultEl.style.display = 'grid';
    messageEl.innerHTML = 'Opponent disconnected!';
});


cells.forEach((cell, index) => {
    cell.addEventListener('click', () => {
        console.log('cell clicked', index);
        handleCellClick(index);
    });
});

quickJoinEl.addEventListener('click', () => {
    socket.emit('quickJoin');
});

createRoomEl.addEventListener('click', () => {
    socket.emit('createRoom');
    roomStatusEl.innerHTML = 'Waiting for opponent...';

});

joinRoomEl.addEventListener('click', () => {
    const roomID = roomInputEl.value.trim();
    console.log('joining room', roomID);
    if (roomID) {
        socket.emit('joinRoom', roomID);
    }
});


